-- Logo ordinacije (Profil+). NIJE PRIMENJENO. Pokreće se posle migracija 1-9, 10, 20, 30, 40, 50 i 60,
-- ručno u Supabase SQL editoru, na pregled. Ne koristi se nikakav tajni ključ u klijentu.
--
-- Šta se menja:
--   1) clinic_images.kind ('photo' | 'logo', podrazumevano 'photo'): postojeći redovi ostaju fotografije.
--   2) clinic_images.status dobija vrednosti 'replaced' (stari logo zamenjen odobrenim novim) i 'removed'
--      (logo koji je vlasnik uklonio). Javno se vide samo 'approved' (kao do sada).
--   3) Zamena logoa: najviše JEDAN logo na čekanju i najviše JEDAN odobren po ordinaciji (dva parcijalna unikatna indeksa).
--      Novi logo je 'pending', a stari 'approved' ostaje javno vidljiv dok admin ne odobri novi; tek tada stari
--      prelazi u 'replaced' (u istoj transakciji). Odbijanje ne dira stari.
--   4) Logo se ne računa u limit od 8 fotografija (okidač broji samo kind = 'photo').
--   5) Zahtev za logo ide kao pending_changes sa field = 'logo' (dozvoljeno novim CHECK-om na koloni field) i new_value = {"path": "<clinic_id>/logo-....webp"}
--      (isti tok kao fotografije: pojavljuje se u adminu u tabu Izmene). Nova izmena zamenjuje prethodnu neodobrenu.
--   6) admin_review_logo(p_id, p_approve, p_note) -> text[]: odobri/odbij logo; vraća putanje fajlova koje admin
--      aplikacija briše iz bucket-a (stari zamenjeni logo, odnosno odbijeni fajl). Napomena kod odbijanja je opciona.
--      admin_review_change odbija field = 'logo' (mora kroz admin_review_logo).
--   7) owner_remove_logo(p_clinic_id) -> text[]: vlasnik uklanja svoj logo (odobren i/ili na čekanju); vraća putanje fajlova
--      za brisanje iz bucket-a (fajl briše klijent, vlasnik je vlasnik objekta).
--   8) admin_list_profiles: approved_images broji samo fotografije.
--   9) javno čitanje se NE menja: politike za approved + profile_is_active(clinic_id) važe i za logo (kad profil istekne,
--      logo nestaje i sajt prikazuje inicijale). Dodaje se samo kolonsko pravo SELECT na kind.
--
-- Profil+ ograničenje (vidi izveštaj): u bazi "Profil+" znači VERIFIKOVAN ZAHTEV (is_verified_owner), a rok (profile_is_active)
-- utiče samo na javni prikaz. Isto pravilo važi i za logo kao za fotografije i cenovnik: upis samo za verifikovanog vlasnika.
-- Posebno pravilo "samo dok je profil aktivan" za upis NE postoji ni za fotografije; ispod je OPCIONI blok (zakomentarisan).
--
-- Tip fajla: bucket clinic-images već dozvoljava samo jpeg, png, webp do 5 MB (SVG nije dozvoljen); putanja logoa mora
-- imati ekstenziju jpe?g|png|webp (CHECK ispod). Logo se ne dodaje u storage politike: važe iste kao za fotografije.

-- ---------------------------------------------------------------- 1) kind
alter table public.clinic_images
  add column kind text not null default 'photo' check (kind in ('photo','logo'));

grant select (kind) on public.clinic_images to anon, authenticated;
grant insert (kind) on public.clinic_images to authenticated;     -- vlasnik bira photo/logo; status je uvek 'pending' (politika)

-- logo ima posebnu putanju (<clinic_id>/logo-<ime>.jpg|png|webp)
alter table public.clinic_images
  add constraint clinic_images_logo_path
  check (kind = 'photo' or storage_path ~ '^[A-Za-z0-9._-]+/logo-[A-Za-z0-9._-]+\.(jpe?g|png|webp)$');

-- ---------------------------------------------------------------- 2) status: replaced, removed
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.clinic_images'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%status%' and pg_get_constraintdef(oid) ilike '%pending%'
  loop
    execute format('alter table public.clinic_images drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.clinic_images
  add constraint clinic_images_status_check
  check (status in ('pending','approved','rejected','replaced','removed'));

-- ---------------------------------------------------------------- 3) jedan logo
create unique index clinic_images_one_pending_logo
  on public.clinic_images (clinic_id) where kind = 'logo' and status = 'pending';
create unique index clinic_images_one_approved_logo
  on public.clinic_images (clinic_id) where kind = 'logo' and status = 'approved';

-- ---------------------------------------------------------------- 4) limit samo za fotografije
create or replace function public.clinic_images_before_insert()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.kind = 'photo'
     and (select count(*) from public.clinic_images
           where clinic_id = new.clinic_id and kind = 'photo' and status in ('pending','approved')) >= 8 then
    raise exception 'image_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.clinic_images_before_insert() from public, anon, authenticated;

-- ---------------------------------------------------------------- 5) pending_changes: field 'logo'
-- tabela dozvoljava samo name/address/images/team: dodaje se 'logo'
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.pending_changes'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%field%' and pg_get_constraintdef(oid) ilike '%images%'
              and pg_get_constraintdef(oid) not ilike '%valid_change%'
  loop
    execute format('alter table public.pending_changes drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.pending_changes
  add constraint pending_changes_field_check check (field in ('name','address','images','team','logo'));

create or replace function public.valid_change(f text, v jsonb) returns boolean
language sql immutable
set search_path = public as $$
  select pg_column_size(v) <= 20480 and case f
    when 'name'    then jsonb_typeof(v) = 'string' and char_length(v #>> '{}') between 2 and 150
    when 'address' then jsonb_typeof(v) = 'string' and char_length(v #>> '{}') between 3 and 200
    when 'team'    then public.valid_team(v) and jsonb_typeof(v) = 'array'
    when 'images'  then jsonb_typeof(v) = 'object'
                        and jsonb_typeof(v -> 'paths') = 'array'
                        and jsonb_array_length(v -> 'paths') between 1 and 8
                        and not exists (select 1 from jsonb_array_elements(v -> 'paths') p
                                        where jsonb_typeof(p) <> 'string'
                                           or (p #>> '{}') !~ '^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+\.(jpe?g|png|webp)$')
    when 'logo'    then jsonb_typeof(v) = 'object'
                        and jsonb_typeof(v -> 'path') = 'string'
                        and (v ->> 'path') ~ '^[A-Za-z0-9._-]+/logo-[A-Za-z0-9._-]+\.(jpe?g|png|webp)$'
                        and not exists (select 1 from jsonb_object_keys(v) k where k <> 'path')
    else false end;
$$;

-- nova neodobrena izmena istog polja zamenjuje prethodnu (i za logo)
create or replace function public.pending_changes_before_insert()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if (select count(*) from public.audit_log
       where actor = new.user_id and table_name = 'pending_changes' and action = 'INSERT'
         and at > now() - interval '24 hours') >= 20 then
    raise exception 'change_limit_24h' using errcode = 'P0001';
  end if;
  if new.field in ('name','address','team','logo') then
    delete from public.pending_changes
     where clinic_id = new.clinic_id and field = new.field and status = 'pending';
  end if;
  return new;
end;
$$;
revoke all on function public.pending_changes_before_insert() from public, anon, authenticated;

-- ---------------------------------------------------------------- 6) admin
-- admin_review_change: isto kao ranije, uz zabranu za 'logo' (ide kroz admin_review_logo).
create or replace function public.admin_review_change(p_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  r public.pending_changes%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_n int;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  if p_approve is null then raise exception 'invalid_argument' using errcode = 'P0001'; end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'note_too_long' using errcode = 'P0001';
  end if;
  if not p_approve and v_note is null then
    raise exception 'note_required' using errcode = 'P0001';
  end if;

  select * into r from public.pending_changes where id = p_id and status = 'pending' for update;
  if not found then raise exception 'change_not_found' using errcode = 'P0001'; end if;
  if r.field = 'logo' then raise exception 'use_admin_review_logo' using errcode = 'P0001'; end if;

  if p_approve then
    if not exists (select 1 from public.claims
                    where clinic_id = r.clinic_id and user_id = r.user_id and status = 'verified') then
      raise exception 'owner_not_verified' using errcode = 'P0001';
    end if;

    insert into public.profile_overrides (clinic_id) values (r.clinic_id) on conflict (clinic_id) do nothing;

    if r.field = 'name' then
      update public.profile_overrides set name = r.new_value #>> '{}' where clinic_id = r.clinic_id;
    elsif r.field = 'address' then
      update public.profile_overrides set address = r.new_value #>> '{}' where clinic_id = r.clinic_id;
    elsif r.field = 'team' then
      update public.profile_overrides set team = r.new_value, team_public = r.new_value where clinic_id = r.clinic_id;
    elsif r.field = 'images' then
      update public.clinic_images set status = 'approved'
       where clinic_id = r.clinic_id and kind = 'photo' and status = 'pending'
         and storage_path in (select jsonb_array_elements_text(r.new_value -> 'paths'));
      get diagnostics v_n = row_count;
      if v_n = 0 then raise exception 'no_pending_images' using errcode = 'P0001'; end if;
    end if;
  elsif r.field = 'images' then
    update public.clinic_images set status = 'rejected'
     where clinic_id = r.clinic_id and kind = 'photo' and status = 'pending'
       and storage_path in (select jsonb_array_elements_text(r.new_value -> 'paths'));
  end if;

  update public.pending_changes
     set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_at = now(), review_note = v_note
   where id = r.id;
end;
$$;

-- Logo: odobri / odbij. Vraća putanje fajlova koje treba obrisati iz bucket-a (admin ima DELETE politiku nad bucketom).
create or replace function public.admin_review_logo(p_id uuid, p_approve boolean, p_note text default null)
returns text[]
language plpgsql security definer
set search_path = public
as $$
declare
  r public.pending_changes%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_path text;
  v_old text[] := '{}';
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  if p_approve is null then raise exception 'invalid_argument' using errcode = 'P0001'; end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'note_too_long' using errcode = 'P0001'; end if;

  select * into r from public.pending_changes where id = p_id and status = 'pending' and field = 'logo' for update;
  if not found then raise exception 'change_not_found' using errcode = 'P0001'; end if;
  v_path := r.new_value ->> 'path';

  if p_approve then
    if not exists (select 1 from public.claims
                    where clinic_id = r.clinic_id and user_id = r.user_id and status = 'verified') then
      raise exception 'owner_not_verified' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.clinic_images
                    where clinic_id = r.clinic_id and kind = 'logo' and status = 'pending' and storage_path = v_path) then
      raise exception 'no_pending_images' using errcode = 'P0001';
    end if;
    -- prvo stari odobreni -> replaced (indeks dozvoljava samo jedan odobren), pa novi -> approved
    with old as (
      update public.clinic_images set status = 'replaced'
       where clinic_id = r.clinic_id and kind = 'logo' and status = 'approved'
      returning storage_path)
    select coalesce(array_agg(storage_path), '{}') into v_old from old;
    update public.clinic_images set status = 'approved'
     where clinic_id = r.clinic_id and kind = 'logo' and status = 'pending' and storage_path = v_path;
  else
    update public.clinic_images set status = 'rejected'
     where clinic_id = r.clinic_id and kind = 'logo' and status = 'pending' and storage_path = v_path;
    v_old := array[v_path];
  end if;

  update public.pending_changes
     set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_at = now(), review_note = v_note
   where id = r.id;
  return v_old;
end;
$$;
revoke all on function public.admin_review_logo(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_review_logo(uuid, boolean, text) to authenticated;

-- lista profila: approved_images broji samo fotografije
create or replace function public.admin_list_profiles()
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
             where i.clinic_id = po.clinic_id and i.kind = 'photo' and i.status = 'approved'),
           po.updated_at,
           c.valid_until, c.paid_until, greatest(c.valid_until, c.paid_until)
      from public.profile_overrides po
      left join public.claims c on c.clinic_id = po.clinic_id and c.status = 'verified'
      left join auth.users u on u.id = c.user_id
     order by po.updated_at desc
     limit 1000;
end;
$$;

-- admin_remove_image (skidanje odobrene slike po putanji) već radi i za logo (ne filtrira po kind).

-- ---------------------------------------------------------------- 7) vlasnik uklanja logo
-- Odobreni i/ili logo na čekanju -> 'removed'; neodobrena izmena za logo se briše. Vraća putanje fajlova za brisanje.
create or replace function public.owner_remove_logo(p_clinic_id text)
returns text[]
language plpgsql security definer
set search_path = public
as $$
declare v_paths text[];
begin
  if not public.is_verified_owner(p_clinic_id) then raise exception 'not_owner' using errcode = 'P0001'; end if;
  with gone as (
    update public.clinic_images set status = 'removed'
     where clinic_id = p_clinic_id and kind = 'logo' and status in ('pending','approved')
    returning storage_path)
  select coalesce(array_agg(storage_path), '{}') into v_paths from gone;
  delete from public.pending_changes where clinic_id = p_clinic_id and field = 'logo' and status = 'pending';
  return v_paths;
end;
$$;
revoke all on function public.owner_remove_logo(text) from public, anon, authenticated;
grant execute on function public.owner_remove_logo(text) to authenticated;

-- ---------------------------------------------------------------- OPCIONO (nije uključeno)
-- Ako želiš da upis logoa (za razliku od fotografija) bude moguć samo dok je profil aktivan (Profil+ nije istekao),
-- otkomentariši. Fotografije i cenovnik to danas NE zahtevaju u bazi.
-- drop policy if exists images_insert_owner on public.clinic_images;
-- create policy images_insert_owner on public.clinic_images
--   for insert to authenticated
--   with check (status = 'pending' and public.is_verified_owner(clinic_id)
--               and (kind = 'photo' or public.profile_is_active(clinic_id)));

-- ================================================================ TEST PLAN (posle primene)
-- Uloge: anon, vlasnik A (verifikovan za ordinaciju X, aktivan profil), vlasnik B (verifikovan za Y), admin.
--  1) Postojeće fotografije: select kind, count(*) from clinic_images group by 1 => sve 'photo'. Limit 8 i dalje radi (9. fotografija => image_limit);
--     logo ne troši limit (8 fotografija + 1 logo => uspeh).
--  2) Vlasnik A: insert (clinic_id 'X', storage_path 'X/logo-1.webp', kind 'logo') => uspeh, status 'pending'. Drugi logo na čekanju => 23505 (jedan pending).
--     Upload fajla u bucket na 'X/logo-1.webp' radi (storage politika owns_pending_image). Putanja bez 'logo-' sa kind 'logo' => CHECK greška.
--     insert pending_changes (field 'logo', new_value {"path":"X/logo-1.webp"}) => uspeh; loš oblik ({"path":"X/a.webp"}, dodatni ključ) => CHECK greška.
--  3) anon: select clinic_images where kind='logo' => 0 redova (pending); potpisani URL za 'X/logo-1.webp' => greška.
--  4) Admin: admin_list_changes() sadrži zahtev sa field 'logo'. admin_review_change(id, true) => 'use_admin_review_logo'.
--     admin_review_logo(id, true) => vraća {} (nema starog); red je 'approved'; anon sada vidi red i potpisani URL (dok je profil aktivan).
--  5) Zamena: vlasnik A upiše 'X/logo-2.webp' (pending) dok je logo-1 approved => uspeh; anon i dalje vidi logo-1. admin_review_logo(.., true) =>
--     vraća {'X/logo-1.webp'}; logo-1 je 'replaced' (anon ga više ne vidi), logo-2 'approved'. Klijent briše fajl logo-1.
--     Odbijanje (admin_review_logo(.., false, null)) => radi i bez napomene; vraća putanju odbijenog fajla; stari approved ostaje.
--  6) Istek profila (valid_until/paid_until u prošlosti): anon ne vidi odobren logo ni potpisani URL (kao fotografije); vlasnik i dalje vidi svoj.
--  7) Vlasnik B: ne može da ubaci logo za 'X' (RLS), ne može da pozove owner_remove_logo('X') ('not_owner'), ne vidi tuđe redove.
--     Neverifikovan korisnik i anon: insert => odbijeno.
--  8) owner_remove_logo('X') (vlasnik A): approved i pending logo -> 'removed', pending_changes za logo obrisana, vraća putanje; javnost vidi inicijale.
--  9) Galerija: select ... where kind='photo' ne vraća logo; admin_list_profiles().approved_images ne broji logo.
-- 10) Tip fajla: upload .svg ili text/html u bucket => odbijeno (allowed_mime_types); putanja 'X/logo-3.svg' => CHECK greška.
