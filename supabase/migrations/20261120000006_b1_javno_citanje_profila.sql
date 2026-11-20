-- Javno čitanje objavljenih profila (status = 'published'). NIJE primenjeno.
-- Bez pogleda: RLS politika + kolonska prava. Kolone team i status NISU čitljive klijentu.

-- Javni tim: puni ga isključivo administrator (klijent nema INSERT/UPDATE pravo na ovu kolonu).
alter table public.profile_overrides add column team_public jsonb;

-- Politika: svako (i anon) vidi samo objavljene profile; vlasnik i dalje vidi svoj red.
create policy profile_select_public on public.profile_overrides
  for select to anon, authenticated
  using (status = 'published');

-- Kolonska prava za čitanje: samo javne kolone.
revoke select on public.profile_overrides from anon, authenticated;
grant select (clinic_id, phones, hours, services, description, website, socials, team_public, updated_at)
  on public.profile_overrides to anon, authenticated;
-- (INSERT/UPDATE grantovi iz migracije 2 ostaju: nema team, team_public ni status.)
