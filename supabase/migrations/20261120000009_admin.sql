-- Administratorska stranica: admin_users, is_admin(), admin RPC funkcije, storage politike,
-- claims.admin_note. Primenjeno 20. 11. 2026. Pokreće se posle migracija 1-8.
--
-- Posle primene upiši sebe RUČNO u SQL editoru (adresa ide samo tamo, nikad u repo):
--   insert into public.admin_users (user_id) select id from auth.users where email = '<tvoja e-adresa>';

-- ------------------------------------------------------------- admin_users
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admin_users enable row level security;
-- bez politika + bez prava: klijent nema nikakav direktan pristup tabeli
revoke all on public.admin_users from public, anon, authenticated;

-- ---------------------------------------------------------------- is_admin()
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;   -- potrebno i politikama u storage-u

-- ------------------------------------------------- claims.admin_note (razlog)
-- Upisuje je samo admin_set_claim_status; podnosilac je čita (SELECT nad tabelom već postoji),
-- ali je ne može pisati (INSERT grant je po kolonama, UPDATE grant ne postoji).
alter table public.claims
  add column admin_note text
  check (admin_note is null or char_length(admin_note) <= 500);

-- =================================================================== RPC ====
-- Svaka funkcija: security definer, set search_path = public, prva naredba proverava is_admin().
-- Execute: samo authenticated (anon i public nemaju pravo).

-- 1) zahtevi sa e-adresom podnosioca (naziv i telefon ordinacije dolaze iz imenika u pregledaču)
create or replace function public.admin_list_claims(p_status text default null)
returns table (
  id uuid, clinic_id text, user_id uuid, email text, status text, method text,
  verification_code text, notes text, admin_note text,
  requested_at timestamptz, claimed_at timestamptz, decided_at timestamptz
)
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  if p_status is not null and p_status not in ('pending','verified','rejected','revoked') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  return query
    select c.id, c.clinic_id, c.user_id, u.email::text, c.status, c.method,
           c.verification_code, c.notes, c.admin_note, c.requested_at, c.claimed_at, c.decided_at
      from public.claims c
      join auth.users u on u.id = c.user_id
     where p_status is null or c.status = p_status
     order by c.requested_at desc
     limit 500;
end;
$$;

-- 2) promena statusa zahteva; triggeri rade ostalo (decided_at, claimed_at, limit 5, profil hidden pri revoked)
create or replace function public.admin_set_claim_status(p_id uuid, p_status text, p_note text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  r public.claims%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  if p_status not in ('verified','rejected','revoked') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'note_too_long' using errcode = 'P0001';
  end if;
  if p_status in ('rejected','revoked') and v_note is null then
    raise exception 'note_required' using errcode = 'P0001';
  end if;

  select * into r from public.claims where id = p_id for update;
  if not found then raise exception 'claim_not_found' using errcode = 'P0001'; end if;
  if not ((r.status = 'pending' and p_status in ('verified','rejected'))
       or (r.status = 'verified' and p_status = 'revoked')) then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  update public.claims set status = p_status, admin_note = v_note where id = p_id;
end;
$$;

-- 3) izmene na čekanju (uz trenutnu javnu vrednost radi poređenja)
create or replace function public.admin_list_changes()
returns table (
  id uuid, clinic_id text, user_id uuid, email text, field text,
  new_value jsonb, current_value jsonb, owner_verified boolean, created_at timestamptz
)
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  return query
    select p.id, p.clinic_id, p.user_id, u.email::text, p.field, p.new_value,
           case p.field when 'name'    then to_jsonb(po.name)
                        when 'address' then to_jsonb(po.address)
                        when 'team'    then po.team_public
                        else null end,
           exists (select 1 from public.claims c
                    where c.clinic_id = p.clinic_id and c.user_id = p.user_id and c.status = 'verified'),
           p.created_at
      from public.pending_changes p
      join auth.users u on u.id = p.user_id
      left join public.profile_overrides po on po.clinic_id = p.clinic_id
     where p.status = 'pending'
     order by p.created_at
     limit 500;
end;
$$;

-- 4) odobravanje / odbijanje izmene (ista logika kao supabase/admin/02 i 03)
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
       where clinic_id = r.clinic_id and status = 'pending'
         and storage_path in (select jsonb_array_elements_text(r.new_value -> 'paths'));
      get diagnostics v_n = row_count;
      if v_n = 0 then raise exception 'no_pending_images' using errcode = 'P0001'; end if;
    end if;
  elsif r.field = 'images' then
    update public.clinic_images set status = 'rejected'
     where clinic_id = r.clinic_id and status = 'pending'
       and storage_path in (select jsonb_array_elements_text(r.new_value -> 'paths'));
  end if;

  update public.pending_changes
     set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_at = now(), review_note = v_note
   where id = r.id;
end;
$$;

-- 5) objavi / sakrij profil
create or replace function public.admin_set_profile_status(p_clinic_id text, p_status text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  if p_status not in ('published','hidden') then raise exception 'invalid_status' using errcode = 'P0001'; end if;
  update public.profile_overrides set status = p_status where clinic_id = p_clinic_id;
  if not found then raise exception 'profile_not_found' using errcode = 'P0001'; end if;
end;
$$;

-- 6) skidanje odobrene slike sa prikaza (kao supabase/admin/05); fajl briše admin.js (politika niže)
create or replace function public.admin_remove_image(p_storage_path text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  update public.clinic_images set status = 'rejected'
   where storage_path = p_storage_path and status = 'approved';
  if not found then raise exception 'image_not_found' using errcode = 'P0001'; end if;
end;
$$;

-- 7) lista profila sa statusom i verifikovanim vlasnikom
create or replace function public.admin_list_profiles()
returns table (
  clinic_id text, status text, name text, address text, phones text[],
  owner_email text, approved_images int, updated_at timestamptz
)
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  return query
    select po.clinic_id, po.status, po.name, po.address, po.phones,
           (select u.email::text from public.claims c join auth.users u on u.id = c.user_id
             where c.clinic_id = po.clinic_id and c.status = 'verified' limit 1),
           (select count(*)::int from public.clinic_images i
             where i.clinic_id = po.clinic_id and i.status = 'approved'),
           po.updated_at
      from public.profile_overrides po
     order by po.updated_at desc
     limit 1000;
end;
$$;

-- ----------------------------------------------- EXECUTE: samo authenticated
revoke all on function
  public.admin_list_claims(text), public.admin_set_claim_status(uuid, text, text),
  public.admin_list_changes(), public.admin_review_change(uuid, boolean, text),
  public.admin_set_profile_status(text, text), public.admin_remove_image(text),
  public.admin_list_profiles()
  from public, anon, authenticated;
grant execute on function
  public.admin_list_claims(text), public.admin_set_claim_status(uuid, text, text),
  public.admin_list_changes(), public.admin_review_change(uuid, boolean, text),
  public.admin_set_profile_status(text, text), public.admin_remove_image(text),
  public.admin_list_profiles()
  to authenticated;

-- ------------------------------------------------ storage: admin vidi i briše
-- SELECT: potpisani URL-ovi za slike na čekanju. DELETE: brisanje fajla posle admin_remove_image.
create policy "clinic-images: admin select" on storage.objects
  for select to authenticated
  using (bucket_id = 'clinic-images' and public.is_admin());
create policy "clinic-images: admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'clinic-images' and public.is_admin());
