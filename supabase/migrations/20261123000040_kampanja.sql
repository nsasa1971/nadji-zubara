-- Evidencija kontakata za kampanju (samo admin). NIJE PRIMENJENO. Pokreće se posle migracija 1-9, 10, 20 i 30,
-- ručno u Supabase SQL editoru, na pregled. Ne koristi se nikakav tajni ključ u klijentu.
--
-- Šta se pravi:
--   1) tabela public.clinic_outreach (jedan red po ordinaciji): status kontakta, beleška, datum sledećeg i
--      poslednjeg kontakta. RLS uključen; SELECT/INSERT/UPDATE/DELETE SAMO za admina (is_admin()); anon i obični
--      authenticated nemaju nikakva prava (revoke all).
--   2) trigger: updated_at, updated_by (auth.uid()) i last_contact_at (postavlja se kad se status promeni na bilo
--      šta osim 'nije_kontaktirana').
--   3) RPC admin_list_outreach(): redovi iz clinic_outreach spojeni sa najrelevantnijim zahtevom iz claims
--      (verified > pending > ostalo), uz rok (valid_until, paid_until) i e-adresu podnosioca (admin je već vidi u
--      admin_list_claims). Vraća i ordinacije koje imaju zahtev a nemaju red u clinic_outreach (status
--      'nije_kontaktirana'), da se u adminu sve vidi na jednom mestu.
-- Spisak ordinacija (naziv, adresa, telefon) ostaje u statičkim podacima sajta; ovde se čuva samo clinic_id.

-- -------------------------------------------------------------- tabela
create table public.clinic_outreach (
  clinic_id       text primary key,
  status          text not null default 'nije_kontaktirana'
                  check (status in ('nije_kontaktirana','kontaktirana','zainteresovana','nema_odgovora','odbila')),
  note            text check (note is null or char_length(note) <= 1000),
  next_contact_at date,
  last_contact_at timestamptz,
  updated_at      timestamptz not null default now(),
  updated_by      uuid
);
comment on table public.clinic_outreach is 'Evidencija kontakata sa ordinacijama (kampanja). Pristup samo za admina.';

alter table public.clinic_outreach enable row level security;
revoke all on public.clinic_outreach from public, anon, authenticated;
grant select, insert, update, delete on public.clinic_outreach to authenticated;   -- dalje ih sužavaju politike (samo admin)

create policy outreach_admin_select on public.clinic_outreach
  for select to authenticated using (public.is_admin());
create policy outreach_admin_insert on public.clinic_outreach
  for insert to authenticated with check (public.is_admin());
create policy outreach_admin_update on public.clinic_outreach
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy outreach_admin_delete on public.clinic_outreach
  for delete to authenticated using (public.is_admin());

-- -------------------------------------------------------------- trigger
create or replace function public.clinic_outreach_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  if tg_op = 'INSERT' then
    if new.status <> 'nije_kontaktirana' and new.last_contact_at is null then new.last_contact_at := now(); end if;
  elsif new.status is distinct from old.status and new.status <> 'nije_kontaktirana' then
    new.last_contact_at := now();
  end if;
  return new;
end;
$$;
create trigger clinic_outreach_touch before insert or update on public.clinic_outreach
  for each row execute function public.clinic_outreach_touch();

-- -------------------------------------------------------------- RPC
create or replace function public.admin_list_outreach()
returns table (
  clinic_id text, status text, note text, next_contact_at date, last_contact_at timestamptz, updated_at timestamptz,
  claim_status text, valid_until timestamptz, paid_until timestamptz, owner_email text
)
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  return query
    with best as (
      -- jedan zahtev po ordinaciji: verified, pa pending, pa najnoviji ostali
      select distinct on (c.clinic_id) c.clinic_id, c.status, c.valid_until, c.paid_until, c.user_id
        from public.claims c
       order by c.clinic_id,
                case c.status when 'verified' then 0 when 'pending' then 1 else 2 end,
                c.requested_at desc
    ), ids as (
      select o.clinic_id from public.clinic_outreach o
      union
      select b.clinic_id from best b
    )
    select i.clinic_id,
           coalesce(o.status, 'nije_kontaktirana'),
           o.note, o.next_contact_at, o.last_contact_at, o.updated_at,
           b.status, b.valid_until, b.paid_until,
           u.email::text
      from ids i
      left join public.clinic_outreach o on o.clinic_id = i.clinic_id
      left join best b on b.clinic_id = i.clinic_id
      left join auth.users u on u.id = b.user_id
     order by i.clinic_id
     limit 5000;
end;
$$;
revoke all on function public.admin_list_outreach() from public, anon, authenticated;
grant execute on function public.admin_list_outreach() to authenticated;

-- ================================================================ TEST PLAN (posle primene)
-- Potrebna su 3 naloga: admin (u admin_users), običan vlasnik, anon. Probna ordinacija X.
--  1) Admin upisuje i čita (SQL kao authenticated sa jwt sub admina, ili iz admin aplikacije):
--       insert into public.clinic_outreach(clinic_id, status, note, next_contact_at) values ('X','kontaktirana','zvala 23.11.','2026-12-01');
--       => uspeh; last_contact_at je postavljen (status nije 'nije_kontaktirana'), updated_by = uuid admina.
--       update public.clinic_outreach set status = 'zainteresovana' where clinic_id = 'X';  => last_contact_at se osvežava.
--       update ... set status = 'nema'  => greška (CHECK); note od 1001 znak => greška (CHECK).
--  2) Običan (neadmin) authenticated: select/insert/update/delete nad clinic_outreach => 0 redova / greška RLS
--     (insert: "new row violates row-level security policy"). select * => prazno.
--  3) anon (publishable ključ): GET /rest/v1/clinic_outreach => 401/permission denied; POST => odbijeno.
--  4) RPC: admin poziva admin_list_outreach() => red za 'X' (status 'zainteresovana', claim_status null dok nema zahteva).
--     Dodaj zahtev za X (pending) => claim_status = 'pending'; admin ga verifikuje => 'verified' sa valid_until (+6 mj).
--     Ordinacija Y koja ima zahtev, a nema red u clinic_outreach, pojavljuje se sa status = 'nije_kontaktirana'.
--     Poziv kao neadmin ili anon => 'not_admin' / permission denied.
--  5) Provera da ne curi ništa: odgovor admin_list_outreach sadrži samo kolone sa spiska (nema user_id, verification_code ni beleški vlasnika);
--     owner_email je ista e-adresa koju admin već vidi u admin_list_claims.
