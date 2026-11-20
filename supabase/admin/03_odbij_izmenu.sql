-- Odbija izmenu iz pending_changes. Za 'images' odbija i same slike (ne računaju se u limit od 8).
do $$
declare
  v_id   uuid := '00000000-0000-0000-0000-000000000000';  -- ZAMENI: id iz pending_changes
  v_note text := 'Razlog odbijanja';                      -- ZAMENI: vlasnik vidi ovu napomenu
  r public.pending_changes%rowtype;
begin
  select * into r from public.pending_changes where id = v_id and status = 'pending' for update;
  if not found then raise exception 'Izmena ne postoji ili nije na čekanju'; end if;

  if r.field = 'images' then
    update public.clinic_images set status = 'rejected'
     where clinic_id = r.clinic_id and status = 'pending'
       and storage_path in (select jsonb_array_elements_text(r.new_value -> 'paths'));
  end if;

  update public.pending_changes
     set status = 'rejected', reviewed_at = now(), review_note = v_note
   where id = r.id;
end $$;
