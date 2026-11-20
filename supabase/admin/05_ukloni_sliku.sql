-- Uklanja ODOBRENU sliku sa javnog prikaza (status -> 'rejected'; ne računa se u limit od 8).
-- Fajl u bucketu clinic-images ostaje: obriši ga ručno (Storage -> clinic-images -> folder ordinacije).
update public.clinic_images
   set status = 'rejected'
 where storage_path = 'imp-...../00000000-0000-0000-0000-000000000000.webp'   -- ZAMENI: putanja slike
   and status = 'approved';

-- Opciono: redosled slika (prva po 'position' je naslovna; manji broj = ranije)
-- update public.clinic_images set position = 0 where storage_path = '...';
