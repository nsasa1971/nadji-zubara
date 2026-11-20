-- Row Level Security. Primenjeno na Supabase projekat nadji-zubara (20. 11. 2026).
-- Princip: klijent (anon/authenticated) vidi i menja samo svoje, a profil i
-- izmene samo dok mu je zahtev 'verified'. ODOBRAVANJE (status -> verified,
-- approved, ...) radi isključivo administrator iz SQL editora / service role
-- (oni zaobilaze RLS). Nijedna politika ne dozvoljava klijentu da menja status.

alter table public.claims            enable row level security;
alter table public.profile_overrides enable row level security;
alter table public.pending_changes   enable row level security;
alter table public.clinic_images     enable row level security;
alter table public.clinic_emails     enable row level security;
alter table public.audit_log         enable row level security;

-- Oduzmi sve podrazumevane privilegije, pa dodeli samo ono što treba (po kolonama).
revoke all on public.claims, public.profile_overrides, public.pending_changes,
              public.clinic_images, public.clinic_emails, public.audit_log
  from anon, authenticated;

-- ------------------------------------------------------------------ claims
-- vidi samo svoje zahteve
create policy claims_select_own on public.claims
  for select to authenticated
  using (user_id = (select auth.uid()));
-- podnosi samo svoj zahtev, uvek kao 'pending' (nikad verified)
create policy claims_insert_own on public.claims
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending' and claimed_at is null);
-- može da povuče svoj zahtev dok je pending
create policy claims_delete_own_pending on public.claims
  for delete to authenticated
  using (user_id = (select auth.uid()) and status = 'pending');
-- UPDATE politike nema: klijent ne može da menja status.
grant select on public.claims to authenticated;
grant insert (clinic_id, method, notes) on public.claims to authenticated;
grant delete on public.claims to authenticated;

-- -------------------------------------------------------- profile_overrides
-- samo verifikovan vlasnik te ordinacije
create policy profile_select_owner on public.profile_overrides
  for select to authenticated
  using (public.is_verified_owner(clinic_id));
create policy profile_insert_owner on public.profile_overrides
  for insert to authenticated
  with check (public.is_verified_owner(clinic_id));
create policy profile_update_owner on public.profile_overrides
  for update to authenticated
  using (public.is_verified_owner(clinic_id))
  with check (public.is_verified_owner(clinic_id));
-- kolone: team i status klijent NE sme da piše (team ide preko pending_changes).
grant select on public.profile_overrides to authenticated;
grant insert (clinic_id, phones, hours, services, description, website, socials)
  on public.profile_overrides to authenticated;
grant update (phones, hours, services, description, website, socials)
  on public.profile_overrides to authenticated;
-- Javno čitanje objavljenih profila na sajtu NIJE uključeno; dodaje se posebnom migracijom.

-- ---------------------------------------------------------- pending_changes
create policy pending_select_own on public.pending_changes
  for select to authenticated
  using (user_id = (select auth.uid()) and public.is_verified_owner(clinic_id));
create policy pending_insert_owner on public.pending_changes
  for insert to authenticated
  with check (user_id = (select auth.uid())
              and status = 'pending'
              and public.is_verified_owner(clinic_id));
create policy pending_delete_own_pending on public.pending_changes
  for delete to authenticated
  using (user_id = (select auth.uid()) and status = 'pending'
         and public.is_verified_owner(clinic_id));
grant select on public.pending_changes to authenticated;
grant insert (clinic_id, field, new_value) on public.pending_changes to authenticated;
grant delete on public.pending_changes to authenticated;

-- ------------------------------------------------------------ clinic_images
-- odobrene slike može da vidi svako (javne slike na sajtu); sve svoje vlasnik
create policy images_select_approved on public.clinic_images
  for select to anon, authenticated
  using (status = 'approved');
create policy images_select_owner on public.clinic_images
  for select to authenticated
  using (public.is_verified_owner(clinic_id));
create policy images_insert_owner on public.clinic_images
  for insert to authenticated
  with check (uploaded_by = (select auth.uid())
              and status = 'pending'
              and public.is_verified_owner(clinic_id));
create policy images_delete_owner_pending on public.clinic_images
  for delete to authenticated
  using (status = 'pending' and public.is_verified_owner(clinic_id));
grant select on public.clinic_images to anon, authenticated;
grant insert (clinic_id, storage_path, position) on public.clinic_images to authenticated;
grant delete on public.clinic_images to authenticated;

-- ------------------------------------------------- clinic_emails, audit_log
-- RLS je uključen, politika NEMA i privilegije su oduzete: klijent ne vidi ništa.
-- Čita ih samo service role / SQL editor.
