-- Preuzimanje profila ordinacija: tabele i pomoćne funkcije.
-- NIJE primenjeno. Primenjuje se ručno (SQL editor ili `supabase db push`).
-- clinic_id je tekstualni id iz js/imported-clinics.js (npr. 'imp-stomatoloska-...'),
-- jer ordinacije ne žive u bazi.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- claims
create table public.claims (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     text not null,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status        text not null default 'pending'
                check (status in ('pending','verified','rejected','revoked')),
  method        text not null default 'email'
                check (method in ('email','phone','document','manual')),
  requested_at  timestamptz not null default now(),
  claimed_at    timestamptz,                 -- kad je zahtev verifikovan
  notes         text                          -- napomena (vidi je i podnosilac zahteva)
);
-- jedan verifikovan vlasnik po ordinaciji
create unique index claims_one_verified_per_clinic on public.claims (clinic_id) where status = 'verified';
-- jedan otvoren zahtev po korisniku i ordinaciji
create unique index claims_one_pending_per_user on public.claims (clinic_id, user_id) where status = 'pending';
create index claims_user_idx on public.claims (user_id);

-- Pomoćna funkcija: da li je trenutni korisnik verifikovan vlasnik ordinacije.
-- security definer: čita claims mimo RLS, ali samo za auth.uid().
create or replace function public.is_verified_owner(p_clinic_id text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.claims c
    where c.clinic_id = p_clinic_id
      and c.user_id = (select auth.uid())
      and c.status = 'verified'
  );
$$;
revoke all on function public.is_verified_owner(text) from public;
grant execute on function public.is_verified_owner(text) to authenticated;

-- --------------------------------------------------------- profile_overrides
-- Podaci koje verifikovan vlasnik menja direktno. Naziv, adresa, slike i tim
-- ne menjaju se ovde nego preko pending_changes (čeka odobrenje).
create table public.profile_overrides (
  clinic_id    text primary key,
  phones       text[]  not null default '{}',
  hours        jsonb,
  services     text[]  not null default '{}',
  description  text,
  website      text,
  socials      jsonb,
  team         jsonb,                         -- samo odobren tim (puni ga admin iz pending_changes)
  status       text not null default 'published'
               check (status in ('published','hidden')),   -- 'hidden' postavlja samo admin
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------- pending_changes
create table public.pending_changes (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    text not null,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  field        text not null check (field in ('name','address','images','team')),
  new_value    jsonb not null,
  status       text not null default 'pending'
               check (status in ('pending','approved','rejected')),
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  review_note  text
);
create index pending_changes_clinic_idx on public.pending_changes (clinic_id, status);
create index pending_changes_user_idx on public.pending_changes (user_id);

-- ------------------------------------------------------------ clinic_images
create table public.clinic_images (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     text not null,
  uploaded_by   uuid default auth.uid() references auth.users(id) on delete set null,
  storage_path  text not null unique,         -- putanja u bucketu clinic-images: '<clinic_id>/<fajl>'
  position      int  not null default 0,
  status        text not null default 'pending'
                check (status in ('pending','approved','rejected')),
  created_at    timestamptz not null default now(),
  check (split_part(storage_path, '/', 1) = clinic_id)
);
create index clinic_images_clinic_idx on public.clinic_images (clinic_id, status);

-- ------------------------------------------------------------ clinic_emails
-- Samo za server (service role). Klijent nema nikakav pristup.
create table public.clinic_emails (
  clinic_id  text primary key,
  email      text not null
);

-- ---------------------------------------------------------------- audit_log
create table public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor      uuid,                             -- auth.uid(); null = admin/SQL editor/service role
  action     text not null,
  table_name text not null,
  clinic_id  text,
  details    jsonb
);
create index audit_log_clinic_idx on public.audit_log (clinic_id, at desc);

-- Trigeri za audit: beleže svaku izmenu, bez obzira ko je radi.
create or replace function public.audit_trigger()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare r record;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  insert into public.audit_log(actor, action, table_name, clinic_id, details)
  values (
    (select auth.uid()),
    tg_op,
    tg_table_name,
    r.clinic_id,
    case tg_op
      when 'INSERT' then jsonb_build_object('new', to_jsonb(new))
      when 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
      else jsonb_build_object('old', to_jsonb(old))
    end
  );
  return r;
end;
$$;
revoke all on function public.audit_trigger() from public;

create trigger claims_audit           after insert or update or delete on public.claims
  for each row execute function public.audit_trigger();
create trigger profile_overrides_audit after insert or update or delete on public.profile_overrides
  for each row execute function public.audit_trigger();
create trigger pending_changes_audit  after insert or update or delete on public.pending_changes
  for each row execute function public.audit_trigger();
create trigger clinic_images_audit    after insert or update or delete on public.clinic_images
  for each row execute function public.audit_trigger();

-- updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profile_overrides_touch before update on public.profile_overrides
  for each row execute function public.touch_updated_at();
