-- B3a: javni prikaz odobrenih slika (privatni bucket + potpisani URL-ovi) i ispravka
-- kolonskih prava na clinic_images. NIJE primenjeno. Pokreće se posle migracija 1-7.

-- ---------------------------------------- 1) kolone clinic_images (curenje uploaded_by)
-- Migracija 2 je dala SELECT nad celom tabelom pa je anon mogao da pročita uploaded_by
-- (UUID korisnika) odobrenih slika. Sada: SELECT samo nad eksplicitnim kolonama.
revoke select on public.clinic_images from anon, authenticated;
grant select (id, clinic_id, storage_path, position, status, created_at)
  on public.clinic_images to anon, authenticated;
-- Posledica: select('*') nad clinic_images više ne radi; kolone se uvek nabrajaju.

-- Politike koje su čitale uploaded_by pod ovlašćenjima klijenta (sada bez prava na tu kolonu):
-- a) INSERT politika: uploaded_by se ionako ne može poslati (INSERT grant nema tu kolonu,
--    vrednost je uvek auth.uid() iz DEFAULT-a), pa je poređenje suvišno.
drop policy if exists images_insert_owner on public.clinic_images;
create policy images_insert_owner on public.clinic_images
  for insert to authenticated
  with check (status = 'pending' and public.is_verified_owner(clinic_id));

-- b) storage INSERT politika: provera "postoji moj pending red" ide kroz security definer funkciju.
create or replace function public.owns_pending_image(p_path text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.clinic_images ci
     where ci.storage_path = p_path
       and ci.uploaded_by = (select auth.uid())
       and ci.status = 'pending'
  );
$$;
revoke all on function public.owns_pending_image(text) from public, anon;
grant execute on function public.owns_pending_image(text) to authenticated;

drop policy if exists "clinic-images: owner insert" on storage.objects;
create policy "clinic-images: owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'clinic-images'
    and public.is_verified_owner((storage.foldername(name))[1])
    and public.owns_pending_image(name)
  );

-- ------------------------------------- 2) javno čitanje ODOBRENIH slika (potpisani URL-ovi)
-- Bucket ostaje privatan. Anon može da napravi potpisani URL (i pročita objekat) samo za
-- fajl čiji je red u clinic_images 'approved'. Pending i odbijene slike nisu dostupne.
create policy "clinic-images: public approved" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'clinic-images'
    and exists (select 1 from public.clinic_images ci
                 where ci.storage_path = name and ci.status = 'approved')
  );
