-- Zahtevi za preuzimanje na čekanju (kod za proveru čitaš vlasniku pri pozivu)
select c.id, c.clinic_id, u.email, c.verification_code, c.requested_at, c.notes
from public.claims c join auth.users u on u.id = c.user_id
where c.status = 'pending' order by c.requested_at;

-- Izmene na čekanju (naziv, adresa, tim, slike)
select p.id, p.clinic_id, u.email, p.field, p.new_value, p.created_at
from public.pending_changes p join auth.users u on u.id = p.user_id
where p.status = 'pending' order by p.created_at;

-- Slike na čekanju (storage_path = bucket clinic-images)
select i.id, i.clinic_id, i.storage_path, i.created_at
from public.clinic_images i
where i.status = 'pending' order by i.created_at;
