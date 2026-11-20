-- Odobrava izmenu iz pending_changes.
--   name    -> profile_overrides.name        (javno)
--   address -> profile_overrides.address     (javno)
--   team    -> profile_overrides.team_public (javno) i team
--   images  -> clinic_images.status = 'approved' za sve putanje iz izmene
do $$
declare
  v_id   uuid := '00000000-0000-0000-0000-000000000000';  -- ZAMENI: id iz pending_changes
  v_note text := null;                                    -- ZAMENI: opciona napomena (vlasnik je vidi)
  r public.pending_changes%rowtype;
begin
  select * into r from public.pending_changes where id = v_id and status = 'pending' for update;
  if not found then raise exception 'Izmena ne postoji ili nije na čekanju'; end if;
  if not exists (select 1 from public.claims where clinic_id = r.clinic_id and user_id = r.user_id and status = 'verified') then
    raise exception 'Podnosilac više nije verifikovan vlasnik ordinacije %', r.clinic_id;
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
  end if;

  update public.pending_changes
     set status = 'approved', reviewed_at = now(), review_note = v_note
   where id = r.id;
end $$;
