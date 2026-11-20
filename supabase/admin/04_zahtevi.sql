-- Pokreni SAMO jedan od blokova (ostale ostavi zakomentarisane).
-- ZAMENI: id zahteva iz tabele claims.

-- A) VERIFIKUJ zahtev (claimed_at = sada; od tada teče 6 besplatnih meseci; max 5 ordinacija po nalogu)
-- update public.claims set status = 'verified'
--  where id = '00000000-0000-0000-0000-000000000000' and status = 'pending';

-- B) ODBIJ zahtev (podnosilac može ponovo posle 30 dana)
-- update public.claims set status = 'rejected', notes = 'Razlog odbijanja'
--  where id = '00000000-0000-0000-0000-000000000000' and status = 'pending';

-- C) OPOZOVI pristup (profil se automatski sakriva: status 'hidden')
-- update public.claims set status = 'revoked', notes = 'Razlog'
--  where id = '00000000-0000-0000-0000-000000000000' and status = 'verified';

-- D) Vrati profil ordinacije na 'published' (npr. posle verifikacije novog vlasnika)
-- update public.profile_overrides set status = 'published' where clinic_id = 'imp-...';  -- ZAMENI clinic_id
