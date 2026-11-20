-- B1: verifikacioni kod, saglasnost, ograničenja zahteva, trigeri. NIJE primenjeno.
-- Pokreće se posle migracija 1-4.

-- ------------------------------------------------------------------ kolone
-- 4-cifreni nasumični kod; podnosilac ga vidi u "Moj nalog" (select na tabeli već postoji),
-- a ne može da ga menja: INSERT grant ne uključuje ovu kolonu, UPDATE grant ne postoji.
alter table public.claims
  add column verification_code text not null
    default ((1000 + floor(random() * 9000))::int)::text
    check (verification_code ~ '^[0-9]{4}$');

-- Kad je zahtev rešen (verified/rejected/revoked) — za pravilo "30 dana posle odbijanja".
alter table public.claims add column decided_at timestamptz;

-- Verzija teksta uslova/privatnosti koju je podnosilac prihvatio (obavezno za nove zahteve).
alter table public.claims add column consent_version text;
alter table public.claims add constraint claims_consent_required
  check (consent_version is not null and char_length(consent_version) <= 40) not valid;  -- važi samo za nove redove
grant insert (consent_version) on public.claims to authenticated;

alter table public.claims add constraint claims_notes_len check (notes is null or char_length(notes) <= 500);

-- ----------------------------------------------- ograničenja pri podnošenju
create or replace function public.claims_before_insert()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_recent int;
  v_pending int;
begin
  -- najviše 5 zahteva u 24 h po korisniku
  select count(*) into v_recent from public.claims
   where user_id = new.user_id and requested_at > now() - interval '24 hours';
  if v_recent >= 5 then
    raise exception 'claim_limit_24h' using errcode = 'P0001';
  end if;

  -- najviše 10 otvorenih zahteva po korisniku
  select count(*) into v_pending from public.claims
   where user_id = new.user_id and status = 'pending';
  if v_pending >= 10 then
    raise exception 'claim_limit_pending' using errcode = 'P0001';
  end if;

  -- 30 dana čekanja posle odbijanja iste ordinacije
  if exists (select 1 from public.claims
              where user_id = new.user_id and clinic_id = new.clinic_id
                and status = 'rejected' and decided_at > now() - interval '30 days') then
    raise exception 'claim_rejected_wait' using errcode = 'P0001';
  end if;

  -- već si verifikovan vlasnik ove ordinacije
  if exists (select 1 from public.claims
              where user_id = new.user_id and clinic_id = new.clinic_id and status = 'verified') then
    raise exception 'claim_already_verified' using errcode = 'P0001';
  end if;

  return new;
end;
$$;
revoke all on function public.claims_before_insert() from public, anon, authenticated;
create trigger claims_before_insert before insert on public.claims
  for each row execute function public.claims_before_insert();

-- ------------------------------------------------- promena statusa (admin)
create or replace function public.claims_before_update()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare v_verified int;
begin
  if new.status is distinct from old.status then
    new.decided_at := now();
    if new.status = 'verified' then
      -- najviše 5 verifikovanih ordinacija po nalogu
      select count(*) into v_verified from public.claims
       where user_id = new.user_id and status = 'verified' and id <> new.id;
      if v_verified >= 5 then
        raise exception 'claim_limit_verified' using errcode = 'P0001';
      end if;
      new.claimed_at := coalesce(new.claimed_at, now());   -- od tada teče besplatnih 6 meseci
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.claims_before_update() from public, anon, authenticated;
create trigger claims_before_update before update on public.claims
  for each row execute function public.claims_before_update();

-- ------------------------------------------- revoked -> profil se sakriva
create or replace function public.claims_after_revoke()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status = 'revoked' and old.status is distinct from 'revoked' then
    update public.profile_overrides set status = 'hidden' where clinic_id = new.clinic_id;
  end if;
  return new;
end;
$$;
revoke all on function public.claims_after_revoke() from public, anon, authenticated;
create trigger claims_after_revoke after update of status on public.claims
  for each row execute function public.claims_after_revoke();
-- Napomena: kad kasnije verifikuješ novog vlasnika iste ordinacije, status profila
-- ('hidden' -> 'published') vraćaš ručno.
