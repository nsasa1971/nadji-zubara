-- Naslovna slika ordinacije (Profil+), pored logoa. NIJE PRIMENJENO. Pokreće se posle migracije 70, ručno u Supabase SQL editoru.
-- Isti model kao logo (migracija 70), sa kind = 'cover':
--   * clinic_images.kind dobija vrednost 'cover'; putanja <clinic_id>/cover-<ime>.jpg|png|webp (CHECK). CHECK za logo iz migracije 70 se
--     preuređuje da važi samo za kind = 'logo' (inače bi odbio 'cover').
--   * najviše jedna naslovna na čekanju i jedna odobrena po ordinaciji (dva parcijalna unikatna indeksa); zamena: nova je 'pending',
--     stara 'approved' ostaje javno vidljiva dok admin ne odobri novu, tada stara prelazi u 'replaced' (isti status kao za logo).
--   * naslovna se ne računa u limit od 8 fotografija i ne ulazi u galeriju (okidač i upiti broje/čitaju samo kind = 'photo').
--   * zahtev ide kao pending_changes sa field = 'cover' i new_value = {"path": "..."}; odobravanje: admin_review_cover(p_id, p_approve, p_note)
--     -> text[] (putanje fajlova za brisanje); vlasnik uklanja: owner_remove_cover(p_clinic_id) -> text[].
--   * javno čitanje se ne menja (approved + profile_is_active): kad profil istekne, sajt ponovo prikazuje opštu naslovnu fotografiju.
--   * admin_review_change odbija 'cover' (kao i 'logo'); admin_remove_image radi i za naslovnu (ne filtrira po kind).
-- Profil+ ograničenje: isto kao za logo i fotografije (verifikovan vlasnik, is_verified_owner); posebno pravilo za istek ne postoji.

-- ---------------------------------------------------------------- kind, putanja, indeksi
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.clinic_images'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%kind%' and pg_get_constraintdef(oid) ilike '%photo%'
              and pg_get_constraintdef(oid) not ilike '%storage_path%'
  loop
    execute format('alter table public.clinic_images drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.clinic_images
  add constraint clinic_images_kind_check check (kind in ('photo','logo','cover'));

-- logo CHECK iz migracije 70 je glasio "kind = 'photo' or putanja logo-*", pa bi odbio i 'cover': sada važi samo za kind = 'logo'
alter table public.clinic_images drop constraint if exists clinic_images_logo_path;
alter table public.clinic_images
  add constraint clinic_images_logo_path
  check (kind <> 'logo' or storage_path ~ '^[A-Za-z0-9._-]+/logo-[A-Za-z0-9._-]+\.(jpe?g|png|webp)$');

alter table public.clinic_images
  add constraint clinic_images_cover_path
  check (kind <> 'cover' or storage_path ~ '^[A-Za-z0-9._-]+/cover-[A-Za-z0-9._-]+\.(jpe?g|png|webp)$');

create unique index clinic_images_one_pending_cover
  on public.clinic_images (clinic_id) where kind = 'cover' and status = 'pending';
create unique index clinic_images_one_approved_cover
  on public.clinic_images (clinic_id) where kind = 'cover' and status = 'approved';

-- ---------------------------------------------------------------- pending_changes: field 'cover'
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
  add constraint pending_changes_field_check check (field in ('name','address','images','team','logo','cover'));

-- ---------------------------------------------------------------- valid_change, okidač
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
    when 'cover'   then jsonb_typeof(v) = 'object'
                        and jsonb_typeof(v -> 'path') = 'string'
                        and (v ->> 'path') ~ '^[A-Za-z0-9._-]+/cover-[A-Za-z0-9._-]+\.(jpe?g|png|webp)$'
                        and not exists (select 1 from jsonb_object_keys(v) k where k <> 'path')
    else false end;
$$;

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
  if new.field in ('name','address','team','logo','cover') then
    delete from public.pending_changes
     where clinic_id = new.clinic_id and field = new.field and status = 'pending';
  end if;
  return new;
end;
$$;
revoke all on function public.pending_changes_before_insert() from public, anon, authenticated;

-- ---------------------------------------------------------------- admin / vlasnik
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
  if r.field = 'cover' then raise exception 'use_admin_review_cover' using errcode = 'P0001'; end if;

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

create or replace function public.admin_review_cover(p_id uuid, p_approve boolean, p_note text default null)
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

  select * into r from public.pending_changes where id = p_id and status = 'pending' and field = 'cover' for update;
  if not found then raise exception 'change_not_found' using errcode = 'P0001'; end if;
  v_path := r.new_value ->> 'path';

  if p_approve then
    if not exists (select 1 from public.claims
                    where clinic_id = r.clinic_id and user_id = r.user_id and status = 'verified') then
      raise exception 'owner_not_verified' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.clinic_images
                    where clinic_id = r.clinic_id and kind = 'cover' and status = 'pending' and storage_path = v_path) then
      raise exception 'no_pending_images' using errcode = 'P0001';
    end if;
    -- prvo stari odobreni -> replaced (indeks dozvoljava samo jedan odobren), pa novi -> approved
    with old as (
      update public.clinic_images set status = 'replaced'
       where clinic_id = r.clinic_id and kind = 'cover' and status = 'approved'
      returning storage_path)
    select coalesce(array_agg(storage_path), '{}') into v_old from old;
    update public.clinic_images set status = 'approved'
     where clinic_id = r.clinic_id and kind = 'cover' and status = 'pending' and storage_path = v_path;
  else
    update public.clinic_images set status = 'rejected'
     where clinic_id = r.clinic_id and kind = 'cover' and status = 'pending' and storage_path = v_path;
    v_old := array[v_path];
  end if;

  update public.pending_changes
     set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_at = now(), review_note = v_note
   where id = r.id;
  return v_old;
end;
$$;
revoke all on function public.admin_review_cover(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_review_cover(uuid, boolean, text) to authenticated;

create or replace function public.owner_remove_cover(p_clinic_id text)
returns text[]
language plpgsql security definer
set search_path = public
as $$
declare v_paths text[];
begin
  if not public.is_verified_owner(p_clinic_id) then raise exception 'not_owner' using errcode = 'P0001'; end if;
  with gone as (
    update public.clinic_images set status = 'removed'
     where clinic_id = p_clinic_id and kind = 'cover' and status in ('pending','approved')
    returning storage_path)
  select coalesce(array_agg(storage_path), '{}') into v_paths from gone;
  delete from public.pending_changes where clinic_id = p_clinic_id and field = 'cover' and status = 'pending';
  return v_paths;
end;
$$;
revoke all on function public.owner_remove_cover(text) from public, anon, authenticated;
grant execute on function public.owner_remove_cover(text) to authenticated;


-- ================================================================ TEST PLAN (posle primene)
-- Isti scenariji kao za logo (migracija 70), sa kind 'cover' / field 'cover' / putanjom '<clinic_id>/cover-*.webp':
--  1) vlasnik A ubacuje naslovnu (pending); druga na čekanju => 23505 (clinic_images_one_pending_cover); putanja bez 'cover-' sa kind 'cover' => CHECK greška.
--  2) pending_changes field 'cover' sa ispravnom putanjom prolazi; sa putanjom 'X/a.webp' ili dodatnim ključem => CHECK greška.
--  3) anon ne vidi pending; admin_list_changes() ima red sa field 'cover'; admin_review_change => 'use_admin_review_cover'.
--  4) admin_review_cover(id, true) => vraća {} (nema stare); javno se vidi (dok je profil aktivan).
--  5) zamena: nova pending, stara i dalje javna; odobravanje vraća {stara putanja}, stara je 'replaced'; odbijanje radi i bez napomene.
--  6) profil istekao => anon ne vidi naslovnu; vlasnik B ne dira tuđu (RLS, 'not_owner'); owner_remove_cover uklanja approved i pending.
--  7) logo i naslovna ne smetaju jedno drugom (po jedan approved i pending svakog); 8 fotografija + logo + naslovna prolaze; galerija (kind='photo') ih ne sadrži.
