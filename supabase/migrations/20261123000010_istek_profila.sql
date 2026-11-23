-- Rok profila: prvih 6 meseci besplatno od preuzimanja, posle toga prikaz se vraća na osnovni
-- (dodati podaci i slike se ne vide javno) dok admin ne označi plaćanje.
-- NIJE PRIMENJENO. Pokreće se posle migracija 1-9, ručno u Supabase SQL editoru, na pregled.
-- U klijentu se ne koristi nikakav tajni ključ; admin radnje idu kroz RPC (is_admin()).
--
-- Šta se menja:
--   1) claims dobija valid_until (kraj besplatnog perioda) i paid_until (plaćeno do).
--   2) trigger pri verifikaciji postavlja valid_until = claimed_at + 6 meseci.
--   3) popuna za već verifikovane zahteve.
--   4) funkcija profile_is_active(clinic_id): true dok je now() < greatest(valid_until, paid_until).
--   5) javne politike (profil, odobrene slike, storage) važe samo dok je profil aktivan.
--   6) admin: admin_list_profiles (nove kolone) i admin_mark_paid.
-- Ništa se ne briše iz baze. Vlasnik i dalje vidi i menja svoje podatke (njegove politike se ne diraju).
--
-- Zašto na claims: verifikovan zahtev je ono što daje "Preuzet profil"; datum odobrenja (claimed_at) je već tu,
-- uvek postoji (profile_overrides red nastaje tek kad vlasnik nešto sačuva) i samo jedan verifikovan zahtev
-- po ordinaciji može da postoji (claims_one_verified_per_clinic). Vlasnik ne sme da piše ove kolone:
-- INSERT grant na claims je po kolonama (clinic_id, method, notes), a UPDATE grant ne postoji.

begin;

-- ------------------------------------------------------------------ 1) kolone
alter table public.claims
  add column valid_until timestamptz,
  add column paid_until  timestamptz;
comment on column public.claims.valid_until is 'Kraj besplatnog perioda (claimed_at + 6 meseci); postavlja trigger.';
comment on column public.claims.paid_until  is 'Plaćeno do; postavlja samo admin_mark_paid().';

-- ------------------------------------------- 2) trigger: valid_until pri verifikaciji
-- Ista funkcija kao u migraciji 5, uz jednu novu liniju (valid_until).
create or replace function public.claims_before_update()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare v_verified int;
begin
  if new.status is distinct from old.status then
    new.decided_at := now();
    if new.status = 'verified' then
      -- najviše 5 verifikovanih ordinacija po nalogu
      select count(*) into v_verified from public.claims
       where user_id = new.user_id and status = 'verified' and id <> new.id;
      if v_verified >= 5 then
        raise exception 'claim_limit_verified' using errcode = 'P0001';
      end if;
      new.claimed_at  := coalesce(new.claimed_at, now());               -- od tada teče besplatnih 6 meseci
      new.valid_until := coalesce(new.valid_until, new.claimed_at + interval '6 months');
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.claims_before_update() from public, anon, authenticated;

-- ------------------------------------------------- 3) popuna za već odobrene zahteve
update public.claims
   set valid_until = coalesce(claimed_at, decided_at, requested_at) + interval '6 months'
 where status = 'verified' and valid_until is null;

-- ---------------------------------------------------------- 4) profile_is_active
-- true samo ako ordinacija ima verifikovan zahtev čiji rok (valid_until ili paid_until, što je kasnije) nije istekao.
-- greatest() ignoriše NULL; ako su oba NULL, rezultat je NULL => false.
-- security definer jer anon nema pravo čitanja claims; vraća samo boolean.
create or replace function public.profile_is_active(p_clinic_id text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select now() < greatest(c.valid_until, c.paid_until)
      from public.claims c
     where c.clinic_id = p_clinic_id and c.status = 'verified'
     limit 1
  ), false);
$$;
revoke all on function public.profile_is_active(text) from public;
grant execute on function public.profile_is_active(text) to anon, authenticated;

-- ---------------------------------------------- 5) javno čitanje samo dok je profil aktivan
-- Profil (opis, radno vreme, usluge, telefoni, sajt, mreže, tim, naziv/adresa iz profila; prisustvo reda
-- je ono što sajt prikazuje kao "Preuzet profil"):
drop policy if exists profile_select_public on public.profile_overrides;
create policy profile_select_public on public.profile_overrides
  for select to anon, authenticated
  using (status = 'published' and public.profile_is_active(clinic_id));

-- Odobrene fotografije (tabela):
drop policy if exists images_select_approved on public.clinic_images;
create policy images_select_approved on public.clinic_images
  for select to anon, authenticated
  using (status = 'approved' and public.profile_is_active(clinic_id));

-- Odobrene fotografije (fajlovi u privatnom bucketu; potpisani URL-ovi). Prva stavka putanje je clinic_id.
drop policy if exists "clinic-images: public approved" on storage.objects;
create policy "clinic-images: public approved" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'clinic-images'
    and public.profile_is_active((storage.foldername(name))[1])
    and exists (select 1 from public.clinic_images ci
                 where ci.storage_path = name and ci.status = 'approved')
  );
-- Vlasnik (politike profile_select_owner, images_select_owner) i admin ostaju bez promene.

-- ------------------------------------------------------------------ 6) admin
-- 6a) lista profila + rok. Menja se tip rezultata, pa se funkcija ponovo pravi.
drop function if exists public.admin_list_profiles();
create function public.admin_list_profiles()
returns table (
  clinic_id text, status text, name text, address text, phones text[],
  owner_email text, approved_images int, updated_at timestamptz,
  valid_until timestamptz, paid_until timestamptz, expires_at timestamptz
)
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  return query
    select po.clinic_id, po.status, po.name, po.address, po.phones,
           u.email::text,
           (select count(*)::int from public.clinic_images i
             where i.clinic_id = po.clinic_id and i.status = 'approved'),
           po.updated_at,
           c.valid_until, c.paid_until, greatest(c.valid_until, c.paid_until)
      from public.profile_overrides po
      left join public.claims c on c.clinic_id = po.clinic_id and c.status = 'verified'
      left join auth.users u on u.id = c.user_id
     order by po.updated_at desc
     limit 1000;
end;
$$;

-- 6b) "Označi plaćeno": paid_until = max(trenutni istek, danas) + period.
-- (Ako je profil već istekao, period se računa od danas; ako još traje, nadovezuje se na istek.)
create or replace function public.admin_mark_paid(p_clinic_id text, p_period text)
returns timestamptz
language plpgsql security definer
set search_path = public
as $$
declare v_new timestamptz;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  if p_period not in ('month','year') then raise exception 'invalid_period' using errcode = 'P0001'; end if;
  update public.claims c
     set paid_until = greatest(coalesce(greatest(c.valid_until, c.paid_until), now()), now())
                      + case p_period when 'month' then interval '1 month' else interval '1 year' end
   where c.clinic_id = p_clinic_id and c.status = 'verified'
  returning c.paid_until into v_new;
  if not found then raise exception 'claim_not_found' using errcode = 'P0001'; end if;
  return v_new;      -- trag ostaje u audit_log (trigger claims_audit)
end;
$$;

revoke all on function public.admin_list_profiles(), public.admin_mark_paid(text, text) from public, anon, authenticated;
grant execute on function public.admin_list_profiles(), public.admin_mark_paid(text, text) to authenticated;

commit;

-- ================================================================ TEST PLAN (posle primene)
-- Pripremi probnu ordinaciju X sa verifikovanim zahtevom i objavljenim profilom (opis, radno vreme, bar jedna odobrena slika).
--  1) Aktivan profil (valid_until u budućnosti), kao anon (bez prijave, publishable ključ):
--       curl "$SUPABASE_URL/rest/v1/profile_overrides?clinic_id=eq.X&select=clinic_id,description" -H "apikey: $PUBLISHABLE"
--       => 1 red.  curl ".../rest/v1/clinic_images?clinic_id=eq.X&status=eq.approved&select=storage_path" => slike.
--  2) Simuliraj istek (SQL editor):
--       update public.claims set valid_until = now() - interval '1 day', paid_until = null where clinic_id = 'X' and status = 'verified';
--     Isti upiti kao anon => [] (prazno) za profile_overrides i clinic_images; potpisani URL za sliku vraća grešku/404:
--       curl -X POST ".../storage/v1/object/sign/clinic-images" -H "apikey: $PUBLISHABLE" -H "Content-Type: application/json" -d '{"expiresIn":60,"paths":["X/ime.jpg"]}'
--     Takođe direktan upit sa filterom po opisu (select=description&description=not.is.null) ne vraća ništa.
--     Na sajtu: stranica ordinacije X je u osnovnom prikazu, bez oznake "Preuzet profil".
--  3) Vlasnik i dalje vidi svoje: prijavljen kao vlasnik, upit nad profile_overrides vraća njegov red; u "Moj nalog" piše da je istekao.
--  4) Vlasnik ne može da produži: kao authenticated pokušaj
--       update claims set paid_until = now() + interval '1 year' ...   => greška (nema UPDATE prava)
--       insert u claims sa valid_until  => greška (INSERT grant je samo clinic_id, method, notes).
--  5) Admin: u admin panelu "Označi plaćeno -> mesec dana" na X => paid_until = danas + 1 mesec;
--     isti anon upiti iz koraka 2 sada ponovo vraćaju podatke. Ne-admin poziv admin_mark_paid => 'not_admin'.
--  6) Nova verifikacija: kreiraj pending zahtev, verifikuj ga (admin) => valid_until = claimed_at + 6 meseci.
--  7) Povratak: update public.claims set valid_until = now() + interval '6 months' where clinic_id = 'X' and status = 'verified';
