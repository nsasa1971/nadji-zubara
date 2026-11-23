-- Cenovnik ordinacije i sopstvene usluge (Profil+). NIJE PRIMENJENO. Pokreće se posle migracija 1-9, 10 i 20,
-- ručno u Supabase SQL editoru, na pregled. Ne koristi se nikakav tajni ključ u klijentu.
--
-- Obrazac je isti kao za ostala polja profila (migracije 2 i 7): vlasnik piše DIREKTNO u profile_overrides
-- (INSERT/UPDATE), ograničen kolonskim grantovima i RLS politikama (is_verified_owner); oblik i veličina se
-- proveravaju CHECK ograničenjima preko immutable funkcija; updated_at vodi postojeći trigger
-- profile_overrides_touch. Nema RPC-a niti odobravanja: čuva se odmah, kao opis i radno vreme.
--
-- Nove kolone:
--   price_list            jsonb  [{kategorija, naziv, cena, od}]   (cena: ceo broj ili null = "na upit")
--   custom_services       jsonb  ["usluga", ...]                    (niz stringova)
--   price_list_updated_at timestamptz  datum poslednje izmene cenovnika; puni ga SAMO trigger
--                                      (klijent nema grant), prikazuje se javno ("Cenovnik ažuriran: ...").
--
-- Javno čitanje: politika profile_select_public (status = 'published' AND profile_is_active(clinic_id), migracija 10)
-- je politika na nivou REDA, pa pokriva i nove kolone; zato se ovde samo dodaje kolonski SELECT grant.
-- Posle isteka roka ili za nepotvrđen profil anon ne dobija nijedan red, pa ni cenovnik ni usluge.

-- ------------------------------------------------------------------ kolone
alter table public.profile_overrides
  add column price_list            jsonb not null default '[]'::jsonb,
  add column custom_services       jsonb not null default '[]'::jsonb,
  add column price_list_updated_at timestamptz;

-- ------------------------------------------- tekst bez kontakt podataka (URL, e-adresa, telefon)
-- true = tekst je u redu. Odbija: http(s):, www., adrese sa čestim domenima (.com .rs .net ...), znak @,
-- i brojeve sa 6 ili više cifara (telefoni). Cene se unose u posebno polje "cena", ne u naziv.
create or replace function public.clean_text(t text) returns boolean
language sql immutable
set search_path = public as $$
  select t is not null
     and t !~* 'https?:|www\.|\.(com|rs|net|org|info|biz|eu|co|me|io|app|shop|online|site)(\y|/)'
     and t !~ '@'
     and char_length(regexp_replace(t, '[^0-9]', '', 'g')) < 6;
$$;

-- --------------------------------------------------------------- cenovnik
create or replace function public.valid_price_list(j jsonb) returns boolean
language sql immutable
set search_path = public as $$
  select j is not null and jsonb_typeof(j) = 'array'
    and jsonb_array_length(j) <= 100
    and pg_column_size(j) <= 32768
    and not exists (
      select 1 from jsonb_array_elements(j) it
      where jsonb_typeof(it) <> 'object'
         or exists (select 1 from jsonb_object_keys(it) k where k not in ('kategorija','naziv','cena','od'))
         -- kategorija: tačno jedna iz fiksne liste
         or jsonb_typeof(it -> 'kategorija') <> 'string'
         or (it ->> 'kategorija') not in ('Opšta stomatologija','Dečja stomatologija','Ortodoncija','Protetika','Hirurgija',
              'Implantologija','Parodontologija','Endodoncija','Estetska stomatologija','Preventiva i higijena','Ostalo')
         -- naziv: 1-80 znakova, ne samo razmaci, bez URL-a / e-adrese / telefona
         or jsonb_typeof(it -> 'naziv') <> 'string'
         or char_length(it ->> 'naziv') not between 1 and 80
         or btrim(it ->> 'naziv') = ''
         or not public.clean_text(it ->> 'naziv')
         -- cena: ceo broj 0-10.000.000 ili null / izostavljena (= "na upit")
         or (it ? 'cena' and jsonb_typeof(it -> 'cena') not in ('number','null'))
         or (jsonb_typeof(it -> 'cena') = 'number'
             and ((it ->> 'cena')::numeric <> trunc((it ->> 'cena')::numeric)
                  or (it ->> 'cena')::numeric not between 0 and 10000000))
         -- od: boolean (ili izostavljeno / null)
         or (it ? 'od' and jsonb_typeof(it -> 'od') not in ('boolean','null')));
$$;

-- ---------------------------------------------------------- sopstvene usluge
create or replace function public.valid_custom_services(j jsonb) returns boolean
language sql immutable
set search_path = public as $$
  select j is not null and jsonb_typeof(j) = 'array'
    and jsonb_array_length(j) <= 10
    and pg_column_size(j) <= 4096
    and not exists (
      select 1 from jsonb_array_elements(j) s
      where jsonb_typeof(s) <> 'string'
         or char_length(s #>> '{}') not between 1 and 60
         or btrim(s #>> '{}') = ''
         or not public.clean_text(s #>> '{}'));
$$;

alter table public.profile_overrides
  add constraint profile_price_list_valid      check (public.valid_price_list(price_list)),
  add constraint profile_custom_services_valid check (public.valid_custom_services(custom_services));

-- --------------------------------------------- datum izmene cenovnika (samo trigger)
create or replace function public.profile_overrides_price_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.price_list <> '[]'::jsonb then new.price_list_updated_at := now(); end if;
  elsif new.price_list is distinct from old.price_list then
    new.price_list_updated_at := now();
  else
    new.price_list_updated_at := old.price_list_updated_at;   -- klijent ga ionako ne može pisati
  end if;
  return new;
end;
$$;
create trigger profile_overrides_price_touch before insert or update on public.profile_overrides
  for each row execute function public.profile_overrides_price_touch();

-- -------------------------------------------------------------------- grantovi
-- vlasnik piše price_list i custom_services (isti obrazac kao phones, hours, services...); price_list_updated_at NE.
grant insert (price_list, custom_services) on public.profile_overrides to authenticated;
grant update (price_list, custom_services) on public.profile_overrides to authenticated;
-- javno čitanje (RLS politike reda ostaju iste: profile_select_public i profile_select_owner)
grant select (price_list, custom_services, price_list_updated_at) on public.profile_overrides to anon, authenticated;

-- admin_list_profiles se ne menja: za zloupotrebu je dovoljno admin_set_profile_status(hidden), koje sakriva ceo profil.

-- ================================================================ TEST PLAN (posle primene)
-- Probna ordinacija X sa verifikovanim zahtevom, rokom u budućnosti i objavljenim profilom. Kao vlasnik (prijavljen):
--  1) Ispravan zapis prolazi (PostgREST ili SQL kao authenticated sa jwt sub vlasnika):
--       update profile_overrides set price_list = '[{"kategorija":"Endodoncija","naziv":"Endodontska terapija - 2 kanala","cena":8000,"od":false},
--                                                   {"kategorija":"Ortodoncija","naziv":"Fiksni aparat - obe vilice","cena":140000,"od":true},
--                                                   {"kategorija":"Ostalo","naziv":"Konsultacija","cena":null}]',
--              custom_services = '["Izbeljivanje zuba","Sanacija pod anestezijom"]' where clinic_id = 'X';
--     => uspeh; price_list_updated_at je sada postavljen, updated_at takođe.
--  2) Odbija se (svaki od ovih daje grešku "violates check constraint profile_price_list_valid" / "...custom_services_valid"):
--       - 101 stavka; naziv od 81 znaka; naziv '' ili samo razmaci
--       - kategorija koje nema u listi ('Kozmetika')
--       - cena -1, 10000001, 1.5, "3000" (string); nepoznat ključ u stavci ({"x":1})
--       - naziv sa URL-om: 'Pogledaj www.moja-ordinacija.rs', 'http://x.rs', 'ordinacija.com/cene'
--       - naziv sa e-adresom: 'pitajte a@b.rs'; naziv sa telefonom: 'Pozovite 064 123 4567', 'tel 011/123-456'
--       - custom_services sa 11 stavki; stavka od 61 znaka; stavka sa URL-om / telefonom / e-adresom
--  3) Vlasnik ne može da upiše datum: update profile_overrides set price_list_updated_at = now() ... => permission denied.
--  4) Javno (anon, publishable ključ):
--       curl "$SUPABASE_URL/rest/v1/profile_overrides?clinic_id=eq.X&select=price_list,custom_services,price_list_updated_at" -H "apikey: $PUBLISHABLE"
--       => 1 red sa cenovnikom, dok je profil aktivan.
--  5) Istekao profil (update claims set valid_until = now() - interval '1 day', paid_until = null where clinic_id='X' and status='verified'):
--       isti anon upit => [] (nijedan red, dakle ni cenovnik ni usluge); vlasnik i dalje vidi svoj red.
--       Vrati rok: update claims set valid_until = now() + interval '6 months' where ...
--  6) Tuđa ordinacija: vlasnik Y ne može da upiše price_list za ordinaciju X (RLS: nijedan red nije izmenjen).
--  7) Postojeći profili: select count(*) from profile_overrides where price_list <> '[]' or custom_services <> '[]'  => 0 posle primene.
