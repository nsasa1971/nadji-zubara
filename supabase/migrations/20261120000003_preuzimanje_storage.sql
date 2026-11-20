-- Storage bucket za slike ordinacija. NIJE primenjeno.
-- Putanja objekta: '<clinic_id>/<naziv-fajla>'. Bucket je PRIVATAN: neodobrene
-- slike nisu javne. Odobrene slike se služe preko potpisanih URL-ova ili se
-- kasnije premeštaju u javni bucket (odluka za kasniji korak).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clinic-images', 'clinic-images', false, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- (storage.objects već ima uključen RLS)

-- čitanje: verifikovan vlasnik vidi fajlove svoje ordinacije
create policy "clinic-images: owner select" on storage.objects
  for select to authenticated
  using (bucket_id = 'clinic-images'
         and public.is_verified_owner((storage.foldername(name))[1]));

-- upload: samo u folder svoje (verifikovane) ordinacije
create policy "clinic-images: owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'clinic-images'
              and public.is_verified_owner((storage.foldername(name))[1]));

-- brisanje: samo vlasnik, samo sopstveni upload
create policy "clinic-images: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'clinic-images'
         and owner_id = (select auth.uid())::text
         and public.is_verified_owner((storage.foldername(name))[1]));

-- UPDATE (prepisivanje) nije dozvoljen klijentu.
