-- Javna provera stanja potvrde profila ordinacije. NIJE PRIMENJENO. Pokreće se posle migracije 10
-- (20261123000010_istek_profila.sql, koja pravi public.profile_is_active), ručno u Supabase SQL editoru.
--
-- Zašto: stranica ordinacije mora da zna da li je profil (a) nikad potvrđen, (b) potvrđen i aktivan ili
-- (c) potvrđen ali istekao, da bi za (b) i (c) sakrila dugme "Ovo je moja ordinacija", a za (c) prikazala osnovni
-- prikaz bez napomene o isteku. Tabela claims nije javno čitljiva (RLS), pa to ide kroz ovu funkciju.
--
-- Funkcija vraća ISKLJUČIVO jednu od tri reči: 'none', 'active', 'expired'. Nikakav user_id, e-adresu, datum
-- ni drugi podatak. Zahtevi sa statusom pending, rejected i revoked računaju se kao 'none'.
-- (Napomena: profile_is_active već vraća false kad nema verifikovanog zahteva, pa se 'none' proverava prvo.)
--
-- Bez begin/commit: jedna naredba create + grantovi.

create or replace function public.clinic_claim_state(p_clinic_id text)
returns text
language sql stable security definer
set search_path = public
as $$
  select case
    when not exists (select 1 from public.claims c
                      where c.clinic_id = p_clinic_id and c.status = 'verified') then 'none'
    when public.profile_is_active(p_clinic_id) then 'active'
    else 'expired'
  end;
$$;

revoke all on function public.clinic_claim_state(text) from public;
grant execute on function public.clinic_claim_state(text) to anon, authenticated;

-- ================================================================ TEST PLAN (posle primene)
-- Poziv kao anon (bez prijave, publishable ključ), npr. preko PostgREST-a:
--   curl -X POST "$SUPABASE_URL/rest/v1/rpc/clinic_claim_state" \
--     -H "apikey: $PUBLISHABLE" -H "Content-Type: application/json" -d '{"p_clinic_id":"<ID>"}'
-- Odgovor je JSON string, npr. "none".
--  1) Nepoznat ili nikad potvrđen clinic_id (npr. "nepostoji-123"):            => "none"
--  2) Ordinacija samo sa pending/rejected/revoked zahtevom:                     => "none"
--  3) Ordinacija sa verifikovanim zahtevom i valid_until/paid_until u budućnosti => "active"
--  4) Isto, ali istekao rok (SQL editor):
--       update public.claims set valid_until = now() - interval '1 day', paid_until = null
--        where clinic_id = '<ID>' and status = 'verified';
--     ponovi poziv                                                              => "expired"
--  5) Admin označi plaćeno (admin_mark_paid) ili vrati valid_until u budućnost    => ponovo "active"
--  6) Provera da ne curi ništa: odgovor je uvek tačno jedan string od tri reči (nikad objekat, datum, UUID ni e-adresa);
--     poziv bez apikey zaglavlja se odbija (401), a rola anon i dalje NEMA direktan SELECT nad public.claims.
