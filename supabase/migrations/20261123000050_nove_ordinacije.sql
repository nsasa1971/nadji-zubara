-- Nove ordinacije (prijave iz forme "Dodajte ordinaciju"). NIJE PRIMENJENO. Pokreće se posle migracija 1-9, 10, 20, 30 i 40,
-- ručno u Supabase SQL editoru, na pregled. Ne koristi se nikakav tajni ključ u klijentu.
--
-- Šta se pravi:
--   1) tabela public.new_clinics: prijava nove ordinacije (pending -> published | rejected). Kontakt podaci
--      (contact_email, contact_person) NIKAD ne izlaze iz baze osim adminu.
--   2) RLS uključen; anon i authenticated nemaju direktan pristup (revoke all), samo admin ima SELECT/UPDATE/DELETE.
--   3) RPC (security definer, search_path = public):
--        submit_new_clinic(p jsonb)           anon + authenticated; vraća samo {clinic_id, preview_token}
--        get_new_clinic_preview(p_token uuid) anon + authenticated; javni podaci, samo status pending/published
--        list_published_new_clinics()         anon + authenticated; javni podaci objavljenih
--        admin_list_new_clinics()             samo admin
--        admin_set_new_clinic_status(...)     samo admin
--        admin_update_new_clinic(...)         samo admin
--   4) dodatne pomoćne funkcije: clean_free_text (opis: dozvoljava godine i brojeve, odbija link/e-adresu/telefon),
--      valid_new_clinic_services (fiksna lista 9 grupa usluga), new_clinic_slug.
-- Zavisi od: clean_text (migracija 30), valid_hours / valid_socials (migracija 7), is_admin (migracija 9).
--
-- ODSTUPANJA OD NACRTA (traže tvoju odluku, vidi izveštaj):
--   * hours_text i socials_text: forma ima jedno slobodno polje za radno vreme i jedno za mreže, a hours/socials su
--     strukturirani (mon..sun / ključevi sa http adresama). Zato se čuva i originalni tekst (hours_text, socials_text);
--     admin ga pretvara u hours/socials pre objave (ili ostavlja samo tekst).
--   * adresa ne ide kroz clean_text: ona odbija 6+ cifara, a adresa sa poštanskim brojem ("Bulevar 23. oktobra 12/4, 21000")
--     to ima. Za adresu važi samo "bez linka i @". Isto važi za opis (clean_free_text).

-- ---------------------------------------------------------------- pomoćne funkcije
-- Tekst bez linka i e-adrese, ali sa dozvoljenim brojevima (adresa, opis). Odbija i niz od 7+ cifara (telefon).
create or replace function public.clean_free_text(t text) returns boolean
language sql immutable
set search_path = public as $$
  select t is not null
     and t !~* 'https?:|www\.|\.(com|rs|net|org|info|biz|eu|co|me|io|app|shop|online|site)(\y|/)'
     and t !~ '@'
     and t !~ '[0-9][0-9 ./()-]{5,}[0-9]'   -- 7+ cifara u nizu (telefon); godine i kućni brojevi prolaze
     ;
$$;

-- usluge: niz stringova, samo ključevi 9 grupa usluga iz kataloga (js/services.js), bez duplikata
create or replace function public.valid_new_clinic_services(j jsonb) returns boolean
language sql immutable
set search_path = public as $$
  select j is not null and jsonb_typeof(j) = 'array'
    and jsonb_array_length(j) <= 9
    and not exists (
      select 1 from jsonb_array_elements(j) s
      where jsonb_typeof(s) <> 'string'
         or (s #>> '{}') not in ('dijagnostika-preventiva','bolesti-zuba-endodoncija','parodontologija','oralna-hirurgija',
                                 'implantologija','stomatoloska-protetika','ortodoncija','estetska-stomatologija','decija-stomatologija'))
    and (select count(distinct x) = jsonb_array_length(j) from jsonb_array_elements_text(j) x);
$$;

-- slug za clinic_id: mala slova, bez dijakritika, samo a-z 0-9 i crtice
create or replace function public.new_clinic_slug(t text) returns text
language sql immutable
set search_path = public as $$
  select trim(both '-' from regexp_replace(
    translate(lower(coalesce(t, '')), 'šđčćžäöüéèàâêîôûñ', 'sdcczaoueeaaeioun'),
    '[^a-z0-9]+', '-', 'g'));
$$;

-- ---------------------------------------------------------------- tabela
create table public.new_clinics (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        text unique not null,
  preview_token    uuid unique not null default gen_random_uuid(),
  status           text not null default 'pending' check (status in ('pending','published','rejected')),
  paket            text not null check (paket in ('osnovni','profil-plus')),
  naziv            text not null check (char_length(naziv) between 2 and 120 and public.clean_text(naziv)),
  grad             text not null check (char_length(grad) between 2 and 80 and public.clean_text(grad)),
  adresa           text not null check (char_length(adresa) between 3 and 160 and public.clean_free_text(adresa)),
  telefon          text not null check (char_length(telefon) between 6 and 40 and telefon ~ '^[0-9 +()/-]+$'
                                        and char_length(regexp_replace(telefon, '[^0-9]', '', 'g')) between 6 and 15),
  contact_email    text not null check (char_length(contact_email) <= 160
                                        and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'),
  contact_person   text not null check (char_length(contact_person) between 2 and 100 and public.clean_text(contact_person)),
  hours            jsonb check (public.valid_hours(hours)),
  hours_text       text check (hours_text is null or (char_length(hours_text) <= 200 and hours_text !~* 'https?:|www\.' and hours_text !~ '@')),
  description      text check (description is null or (char_length(description) <= 600 and public.clean_free_text(description))),
  services         jsonb not null default '[]'::jsonb check (public.valid_new_clinic_services(services)),
  custom_services  jsonb not null default '[]'::jsonb check (public.valid_custom_services(custom_services)),
  website          text check (website is null or website = '' or (char_length(website) <= 300 and website ~ '^https?://[^[:space:]]+$')),
  socials          jsonb check (public.valid_socials(socials)),
  socials_text     text check (socials_text is null or (char_length(socials_text) <= 200 and socials_text !~ '@')),
  consent_version  text not null check (char_length(consent_version) between 1 and 40),
  lat              numeric check (lat is null or lat between -90 and 90),
  lng              numeric check (lng is null or lng between -180 and 180),
  admin_note       text check (admin_note is null or char_length(admin_note) <= 500),
  created_at       timestamptz not null default now(),
  published_at     timestamptz,
  updated_at       timestamptz not null default now(),
  -- osnovni paket nema Profil+ polja
  constraint new_clinics_osnovni_bez_profila check (
    paket = 'profil-plus'
    or (hours is null and hours_text is null and description is null and services = '[]'::jsonb
        and custom_services = '[]'::jsonb and website is null and socials is null and socials_text is null))
);
comment on table public.new_clinics is 'Prijave novih ordinacija (forma "Dodajte ordinaciju"). Kontakt podaci samo za admina.';

create index new_clinics_status_idx on public.new_clinics (status, created_at desc);
create index new_clinics_email_idx  on public.new_clinics (lower(contact_email), created_at desc);

create or replace function public.new_clinics_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := now();
  end if;
  return new;
end;
$$;
create trigger new_clinics_touch before insert or update on public.new_clinics
  for each row execute function public.new_clinics_touch();

-- ---------------------------------------------------------------- RLS
alter table public.new_clinics enable row level security;
revoke all on public.new_clinics from public, anon, authenticated;
grant select, update, delete on public.new_clinics to authenticated;   -- dalje ih sužavaju politike (samo admin)

create policy new_clinics_admin_select on public.new_clinics
  for select to authenticated using (public.is_admin());
create policy new_clinics_admin_update on public.new_clinics
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy new_clinics_admin_delete on public.new_clinics
  for delete to authenticated using (public.is_admin());
-- INSERT nema ni grant ni politiku: prijava ide samo kroz submit_new_clinic.

-- ---------------------------------------------------------------- javni oblik (bez kontakt podataka)
create or replace function public.new_clinic_public(r public.new_clinics) returns jsonb
language sql immutable
set search_path = public as $$
  select jsonb_build_object(
    'clinic_id', r.clinic_id, 'status', r.status, 'paket', r.paket,
    'naziv', r.naziv, 'grad', r.grad, 'adresa', r.adresa, 'telefon', r.telefon,
    'hours', r.hours, 'hours_text', r.hours_text, 'description', r.description,
    'services', r.services, 'custom_services', r.custom_services,
    'website', r.website, 'socials', r.socials, 'socials_text', r.socials_text,
    'lat', r.lat, 'lng', r.lng, 'published_at', r.published_at);
$$;
revoke all on function public.new_clinic_public(public.new_clinics) from public, anon, authenticated;

-- ---------------------------------------------------------------- prijava (anon)
create or replace function public.submit_new_clinic(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_paket    text := p ->> 'paket';
  v_email    text := lower(btrim(coalesce(p ->> 'contact_email', '')));
  v_plus     boolean := (p ->> 'paket') = 'profil-plus';
  v_naziv    text := btrim(regexp_replace(coalesce(p ->> 'naziv', ''), '\s+', ' ', 'g'));
  v_grad     text := btrim(regexp_replace(coalesce(p ->> 'grad', ''), '\s+', ' ', 'g'));
  v_id       text;
  v_token    uuid;
  v_try      int := 0;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  if v_paket is null or v_paket not in ('osnovni','profil-plus') then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  if v_email = '' then raise exception 'invalid_input' using errcode = 'P0001'; end if;

  -- ograničenja: 3 prijave na čekanju po e-adresi u 24 h, ukupno 300 na čekanju
  if (select count(*) from public.new_clinics
       where status = 'pending' and lower(contact_email) = v_email and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'rate_limit' using errcode = 'P0001';
  end if;
  if (select count(*) from public.new_clinics where status = 'pending') >= 300 then
    raise exception 'queue_full' using errcode = 'P0001';
  end if;

  loop
    v_try := v_try + 1;
    v_id := 'nova-' || public.new_clinic_slug(v_naziv) || '-' || public.new_clinic_slug(v_grad) || '-'
            || substr(md5(gen_random_uuid()::text), 1, 4);
    begin
      insert into public.new_clinics(
        clinic_id, paket, naziv, grad, adresa, telefon, contact_email, contact_person,
        hours, hours_text, description, services, custom_services, website, socials, socials_text, consent_version)
      values (
        v_id, v_paket, v_naziv, v_grad,
        btrim(regexp_replace(coalesce(p ->> 'adresa', ''), '\s+', ' ', 'g')),
        btrim(coalesce(p ->> 'telefon', '')), v_email,
        btrim(regexp_replace(coalesce(p ->> 'contact_person', ''), '\s+', ' ', 'g')),
        case when v_plus then p -> 'hours' end,
        case when v_plus then nullif(btrim(p ->> 'hours_text'), '') end,
        case when v_plus then nullif(btrim(p ->> 'description'), '') end,
        case when v_plus then coalesce(p -> 'services', '[]'::jsonb) else '[]'::jsonb end,
        case when v_plus then coalesce(p -> 'custom_services', '[]'::jsonb) else '[]'::jsonb end,
        case when v_plus then nullif(btrim(p ->> 'website'), '') end,
        case when v_plus then p -> 'socials' end,
        case when v_plus then nullif(btrim(p ->> 'socials_text'), '') end,
        coalesce(p ->> 'consent_version', ''))
      returning preview_token into v_token;
      exit;
    exception
      when unique_violation then
        if v_try >= 5 then raise exception 'try_again' using errcode = 'P0001'; end if;   -- slug se sudario, probaj ponovo
      when check_violation or not_null_violation or invalid_text_representation or data_exception then
        raise exception 'invalid_input' using errcode = 'P0001';
    end;
  end loop;

  return jsonb_build_object('clinic_id', v_id, 'preview_token', v_token);
end;
$$;
revoke all on function public.submit_new_clinic(jsonb) from public, anon, authenticated;
grant execute on function public.submit_new_clinic(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------- pregled po tokenu (anon)
create or replace function public.get_new_clinic_preview(p_token uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select public.new_clinic_public(n)
    from public.new_clinics n
   where n.preview_token = p_token and n.status in ('pending','published');
$$;
revoke all on function public.get_new_clinic_preview(uuid) from public, anon, authenticated;
grant execute on function public.get_new_clinic_preview(uuid) to anon, authenticated;

-- ---------------------------------------------------------------- objavljene (anon)
create or replace function public.list_published_new_clinics()
returns setof jsonb
language sql stable security definer
set search_path = public
as $$
  select public.new_clinic_public(n)
    from public.new_clinics n
   where n.status = 'published'
   order by n.published_at desc
   limit 2000;
$$;
revoke all on function public.list_published_new_clinics() from public, anon, authenticated;
grant execute on function public.list_published_new_clinics() to anon, authenticated;

-- ---------------------------------------------------------------- admin
create or replace function public.admin_list_new_clinics()
returns setof jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  return query
    select to_jsonb(n)
      from public.new_clinics n
     order by (n.status = 'pending') desc, n.created_at desc
     limit 1000;
end;
$$;
revoke all on function public.admin_list_new_clinics() from public, anon, authenticated;
grant execute on function public.admin_list_new_clinics() to authenticated;

create or replace function public.admin_set_new_clinic_status(p_id uuid, p_status text, p_note text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  if p_status is null or p_status not in ('pending','published','rejected') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  update public.new_clinics
     set status = p_status,
         admin_note = case when p_note is null then admin_note else nullif(btrim(p_note), '') end
   where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
exception
  when check_violation then raise exception 'invalid_input' using errcode = 'P0001';
end;
$$;
revoke all on function public.admin_set_new_clinic_status(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_new_clinic_status(uuid, text, text) to authenticated;

-- Izmena polja pre objave: menjaju se samo ključevi prisutni u p (null briše vrednost gde je dozvoljeno).
create or replace function public.admin_update_new_clinic(p_id uuid, p jsonb)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = 'P0001'; end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'invalid_input' using errcode = 'P0001'; end if;
  update public.new_clinics n set
    paket           = case when p ? 'paket'           then p ->> 'paket' else n.paket end,
    naziv           = case when p ? 'naziv'           then btrim(p ->> 'naziv') else n.naziv end,
    grad            = case when p ? 'grad'            then btrim(p ->> 'grad') else n.grad end,
    adresa          = case when p ? 'adresa'          then btrim(p ->> 'adresa') else n.adresa end,
    telefon         = case when p ? 'telefon'         then btrim(p ->> 'telefon') else n.telefon end,
    contact_email   = case when p ? 'contact_email'   then lower(btrim(p ->> 'contact_email')) else n.contact_email end,
    contact_person  = case when p ? 'contact_person'  then btrim(p ->> 'contact_person') else n.contact_person end,
    hours           = case when p ? 'hours'           then nullif(p -> 'hours', 'null'::jsonb) else n.hours end,
    hours_text      = case when p ? 'hours_text'      then nullif(btrim(p ->> 'hours_text'), '') else n.hours_text end,
    description     = case when p ? 'description'     then nullif(btrim(p ->> 'description'), '') else n.description end,
    services        = case when p ? 'services'        then coalesce(p -> 'services', '[]'::jsonb) else n.services end,
    custom_services = case when p ? 'custom_services' then coalesce(p -> 'custom_services', '[]'::jsonb) else n.custom_services end,
    website         = case when p ? 'website'         then nullif(btrim(p ->> 'website'), '') else n.website end,
    socials         = case when p ? 'socials'         then nullif(p -> 'socials', 'null'::jsonb) else n.socials end,
    socials_text    = case when p ? 'socials_text'    then nullif(btrim(p ->> 'socials_text'), '') else n.socials_text end,
    lat             = case when p ? 'lat'             then (p ->> 'lat')::numeric else n.lat end,
    lng             = case when p ? 'lng'             then (p ->> 'lng')::numeric else n.lng end,
    admin_note      = case when p ? 'admin_note'      then nullif(btrim(p ->> 'admin_note'), '') else n.admin_note end
  where n.id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
exception
  when check_violation or not_null_violation or invalid_text_representation or data_exception then
    raise exception 'invalid_input' using errcode = 'P0001';
end;
$$;
revoke all on function public.admin_update_new_clinic(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_update_new_clinic(uuid, jsonb) to authenticated;

-- ================================================================ TEST PLAN (posle primene)
-- Potrebna su 3 uloge: anon (publishable ključ), običan authenticated, admin (u admin_users).
--  1) Direktan pristup tabeli: anon i običan authenticated: GET /rest/v1/new_clinics => 401/permission denied (anon),
--     prazan niz (authenticated, RLS); POST/PATCH/DELETE => odbijeno. Admin: select vidi sve.
--  2) submit_new_clinic (anon): rpc sa {paket:'profil-plus', naziv:'Dental Test', grad:'Ada', adresa:'Glavna 12, 24430 Ada',
--     telefon:'024 123 456', contact_email:'a@b.rs', contact_person:'Pera Perić', consent_version:'2026-11',
--     hours_text:'pon–pet 08–15', description:'Osnovana 1998.', services:['implantologija'], website:'https://x.rs'}
--     => vraća SAMO {clinic_id:'nova-dental-test-ada-xxxx', preview_token}. Isto sa paket:'osnovni' => Profil+ polja se ignorišu (null).
--  3) get_new_clinic_preview(token) => javni podaci bez contact_email/contact_person; nepoznat token => null;
--     posle status 'rejected' => null.
--  4) list_published_new_clinics(): pending i rejected se ne vide; posle admin_set_new_clinic_status(id,'published') se vide
--     (published_at postavljen); ni u jednom odgovoru nema contact_email, contact_person, admin_note, preview_token, id.
--  5) Neadmin / anon: admin_list_new_clinics, admin_set_new_clinic_status, admin_update_new_clinic => 'not_admin' / permission denied.
--  6) Ograničenje: 4. prijava iste e-adrese (pending) u 24 h => 'rate_limit'. 300 na čekanju => 'queue_full'.
--  7) Odbijanje: naziv 'Dental www.test.rs', naziv sa 'x@y.rs', naziv 'Dental 011 123 4567'; telefon 'abc'; telefon sa 16+ cifara;
--     e-adresa bez @; opis sa linkom ili telefonom; usluga van liste ili duplikat; custom_services > 10 ili > 60 znakova;
--     paket 'xyz'; prazan consent_version => 'invalid_input'.
--  8) admin_update_new_clinic(id, '{"lat":45.8,"lng":20.1,"naziv":"Novi naziv"}') menja samo ta polja; nevažeća vrednost => 'invalid_input'.
