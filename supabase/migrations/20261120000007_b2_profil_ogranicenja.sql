-- B2: kolone name/address (samo čitanje za klijenta), CHECK ograničenja, ograničenja slika
-- i izmena, stroža politika za upload slika. Primenjeno 20. 11. 2026.
-- Pokreće se posle migracija 1-6.

-- ----------------------------------------------- odobren naziv i adresa (javno)
-- Puni ih ISKLJUČIVO administrator (supabase/admin/*.sql). Klijent ima samo SELECT.
alter table public.profile_overrides add column name    text;
alter table public.profile_overrides add column address text;
grant select (name, address) on public.profile_overrides to anon, authenticated;
-- (INSERT/UPDATE grantovi iz migracije 2 ne uključuju name, address, team, team_public, status.)

-- ----------------------------------------------------- pomoćne funkcije (CHECK)
create or replace function public.valid_phones(p text[]) returns boolean
language sql immutable
set search_path = public as $$
  select p is null or (
    coalesce(array_length(p, 1), 0) <= 3
    and not exists (select 1 from unnest(p) x
                    where x is null or char_length(x) not between 6 and 20 or x !~ '^[0-9+()/ -]+$'));
$$;

create or replace function public.valid_services(p text[]) returns boolean
language sql immutable
set search_path = public as $$
  select p is null or (
    coalesce(array_length(p, 1), 0) <= 40
    and not exists (select 1 from unnest(p) x where x is null or char_length(x) not between 1 and 80));
$$;

-- radno vreme: objekat sa ključevima mon..sun, svaka vrednost tekst do 60 znakova (ili null)
create or replace function public.valid_hours(j jsonb) returns boolean
language sql immutable
set search_path = public as $$
  select j is null or (
    jsonb_typeof(j) = 'object'
    and pg_column_size(j) <= 1024
    and not exists (
      select 1 from jsonb_each(j) e
      where e.key not in ('mon','tue','wed','thu','fri','sat','sun')
         or jsonb_typeof(e.value) not in ('string','null')
         or (jsonb_typeof(e.value) = 'string' and char_length(e.value #>> '{}') > 60)));
$$;

-- društvene mreže: najviše ovih 5 ključeva, vrednost je http(s) adresa do 300 znakova
create or replace function public.valid_socials(j jsonb) returns boolean
language sql immutable
set search_path = public as $$
  select j is null or (
    jsonb_typeof(j) = 'object'
    and pg_column_size(j) <= 2048
    and not exists (
      select 1 from jsonb_each(j) e
      where e.key not in ('facebook','instagram','linkedin','tiktok','youtube')
         or jsonb_typeof(e.value) <> 'string'
         or char_length(e.value #>> '{}') > 300
         or (e.value #>> '{}') !~ '^https?://[^[:space:]]+$'));
$$;

-- tim: niz do 30 članova {name, role}, do 8 KB
create or replace function public.valid_team(j jsonb) returns boolean
language sql immutable
set search_path = public as $$
  select j is null or (
    jsonb_typeof(j) = 'array'
    and jsonb_array_length(j) <= 30
    and pg_column_size(j) <= 8192
    and not exists (
      select 1 from jsonb_array_elements(j) m
      where jsonb_typeof(m) <> 'object'
         or exists (select 1 from jsonb_object_keys(m) k where k not in ('name','role'))
         or jsonb_typeof(m -> 'name') <> 'string'
         or char_length(m ->> 'name') not between 1 and 100
         or (m ? 'role' and jsonb_typeof(m -> 'role') not in ('string','null'))
         or char_length(coalesce(m ->> 'role', '')) > 100));
$$;

-- izmena na čekanju: oblik zavisi od polja
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
    else false end;
$$;

-- ---------------------------------------------------------- CHECK ograničenja
alter table public.profile_overrides
  add constraint profile_description_len check (description is null or char_length(description) <= 1000),
  add constraint profile_phones_valid     check (public.valid_phones(phones)),
  add constraint profile_services_valid   check (public.valid_services(services)),
  add constraint profile_hours_valid      check (public.valid_hours(hours)),
  add constraint profile_socials_valid    check (public.valid_socials(socials)),
  add constraint profile_website_valid    check (website is null or website = ''
                                                 or (char_length(website) <= 300 and website ~ '^https?://[^[:space:]]+$')),
  add constraint profile_team_valid       check (public.valid_team(team)),
  add constraint profile_team_public_valid check (public.valid_team(team_public)),
  add constraint profile_name_len         check (name is null or char_length(name) between 2 and 150),
  add constraint profile_address_len      check (address is null or char_length(address) between 3 and 200);

alter table public.pending_changes
  add constraint pending_new_value_valid check (public.valid_change(field, new_value)),
  add constraint pending_review_note_len check (review_note is null or char_length(review_note) <= 500);

alter table public.clinic_images
  add constraint clinic_images_path_format
  check (storage_path ~ '^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+\.(jpe?g|png|webp)$');

-- ---------------------------------------------- slike: najviše 8 po ordinaciji
-- Računaju se slike koje čekaju ('pending') i odobrene; odbijene ne.
create or replace function public.clinic_images_before_insert()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if (select count(*) from public.clinic_images
       where clinic_id = new.clinic_id and status in ('pending','approved')) >= 8 then
    raise exception 'image_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.clinic_images_before_insert() from public, anon, authenticated;
create trigger clinic_images_before_insert before insert on public.clinic_images
  for each row execute function public.clinic_images_before_insert();

-- ------------------------------------------ pending_changes: limit i zamena
-- Najviše 20 izmena u 24 h po korisniku (računa se i zamenjene, preko audit_log);
-- nova izmena naziva/adrese/tima zamenjuje prethodnu neodobrenu izmenu istog polja.
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
  if new.field in ('name','address','team') then
    delete from public.pending_changes
     where clinic_id = new.clinic_id and field = new.field and status = 'pending';
  end if;
  return new;
end;
$$;
revoke all on function public.pending_changes_before_insert() from public, anon, authenticated;
create trigger pending_changes_before_insert before insert on public.pending_changes
  for each row execute function public.pending_changes_before_insert();

-- ------------------------------------- upload: samo uz red u clinic_images
-- Fajl se može postaviti tek kad postoji red 'pending' koji je isti korisnik upisao
-- za tu putanju (time limit od 8 slika važi i za storage).
drop policy if exists "clinic-images: owner insert" on storage.objects;
create policy "clinic-images: owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'clinic-images'
    and public.is_verified_owner((storage.foldername(name))[1])
    and exists (select 1 from public.clinic_images ci
                 where ci.storage_path = name
                   and ci.uploaded_by = (select auth.uid())
                   and ci.status = 'pending')
  );
