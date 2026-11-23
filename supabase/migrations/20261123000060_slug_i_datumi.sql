-- Sitne ispravke uz migraciju 50 (nove ordinacije). NIJE PRIMENJENO. Pokreće se posle migracije 50,
-- ručno u Supabase SQL editoru, na pregled. Ne menja tabele ni podatke; samo zamenjuje dve funkcije.
--
-- 1) public.clean_free_text (adresa, opis): do sada je odbijala datume i godine sa crticom (12.03.1998, 1998-2005),
--    jer je u njima 7+ cifara u nizu, što liči na telefon. Sada se pre provere telefona maskiraju:
--      * datumi: d.m.gggg, d/m/gggg, d-m-gggg (sa tačkom na kraju ili bez) i gggg-m-d
--      * rasponi godina: 1998-2005, 1998–05, 1998 - 2005 (samo godine 19xx i 20xx, crtica, en-crtica ili em-crtica)
--    Link i znak @ se i dalje odbijaju; telefon (7+ cifara u nizu, npr. 064 123 4567) se i dalje odbija.
--    Poznato ograničenje: broj koji ceo liči na raspon godina ili datum (npr. "1998-2005") prolazi; admin ionako
--    pregleda svaku prijavu pre objave.
-- 2) public.new_clinic_slug (clinic_id): sada transliteruje i srpsku ćirilicu (uključujući ђ→dj, љ→lj, њ→nj, џ→dz)
--    i dijakritike mađarskog i drugih jezika (á é í ó ö ő ú ü ű ä ë ï ç ñ ß ł ...). đ se sada piše kao "dj" (kao u pretrazi
--    na sajtu), ne više "d". Ako posle čišćenja ostane prazan tekst (npr. naziv samo od znakova van latinice i ćirilice),
--    vraća se 'x', pa clinic_id ostaje ispravan ('nova-x-grad-ab12'). Već upisani clinic_id se ne menjaju.

-- ---------------------------------------------------------------- clean_free_text
create or replace function public.clean_free_text(t text) returns boolean
language sql immutable
set search_path = public as $$
  select t is not null
     and t !~* 'https?:|www\.|\.(com|rs|net|org|info|biz|eu|co|me|io|app|shop|online|site)(\y|/)'
     and t !~ '@'
     and regexp_replace(
           regexp_replace(
             regexp_replace(t,
               '\y[0-9]{1,2}[./-][0-9]{1,2}[./-](19|20)[0-9]{2}\.?', ' ', 'g'),          -- 12.03.1998 / 12.3.1998. / 12-03-1998
             '\y(19|20)[0-9]{2}-[0-9]{1,2}-[0-9]{1,2}\y', ' ', 'g'),                      -- 1998-03-12
           '\y(19|20)[0-9]{2}\s?[-–—]\s?((19|20)[0-9]{2}|[0-9]{2})\y', ' ', 'g')          -- 1998-2005 / 1998–05
         !~ '[0-9][0-9 ./()-]{5,}[0-9]';
$$;

-- ---------------------------------------------------------------- new_clinic_slug
create or replace function public.new_clinic_slug(t text) returns text
language sql immutable
set search_path = public as $$
  select coalesce(nullif(trim(both '-' from regexp_replace(
    -- 1) višeslovne zamene (đ→dj, љ→lj, њ→nj, џ→dz, ß→ss), 2) jednoslovne preko translate (š→s, ć→c, ő→o, ж→z...), 3) sve van a-z0-9 postaje crtica
    translate(
      replace(replace(replace(replace(replace(replace(
        lower(coalesce(t, '')),
        'đ', 'dj'), 'ђ', 'dj'), 'љ', 'lj'), 'њ', 'nj'), 'џ', 'dz'), 'ß', 'ss'),
      'šćčžáàâäãåéèêëíìîïóòôöõőúùûüűñçłřěňťďýÿабвгдежзијклмнопрстћуфхцчш',
      'scczaaaaaaeeeeiiiioooooouuuuunclrentdyyabvgdezzijklmnoprstcufhccs'),
    '[^a-z0-9]+', '-', 'g')), ''), 'x');
$$;

-- ================================================================ TEST PLAN (posle primene)
--  1) clean_free_text (true = prolazi):
--       select public.clean_free_text('Osnovana 12.03.1998. godine');           -- true  (pre: false)
--       select public.clean_free_text('Radimo 1998-2005 i od 2010');            -- true  (pre: false)
--       select public.clean_free_text('Radimo od 1998–05, adresa Glavna 12');   -- true
--       select public.clean_free_text('Datum 1998-03-12');                      -- true
--       select public.clean_free_text('Bulevar 23. oktobra 12/4, 21000 Ada');   -- true
--       select public.clean_free_text('Zovite 064 123 4567');                   -- false (telefon)
--       select public.clean_free_text('Zovite 0641234567 posle 12.03.1998');    -- false (telefon ostaje)
--       select public.clean_free_text('www.test.rs');                           -- false
--       select public.clean_free_text('pisite na a@b.rs');                      -- false
--       select public.clean_free_text('Tel 011/123-4567');                      -- false
--  2) new_clinic_slug:
--       select public.new_clinic_slug('Стоматолошка ординација Ђорђе');         -- 'stomatoloska-ordinacija-djordje'
--       select public.new_clinic_slug('Šćepanović đurđevak');                   -- 'scepanovic-djurdjevak'
--       select public.new_clinic_slug('Szőke Árpád Fogászat, Újvidék');         -- 'szoke-arpad-fogaszat-ujvidek'
--       select public.new_clinic_slug('Љиљана Њего Џ');                         -- 'ljiljana-njego-dz'
--       select public.new_clinic_slug('牙科');                                   -- 'x'
--       select public.new_clinic_slug(null);                                    -- 'x'
--  3) submit_new_clinic (anon): prijava sa opisom 'Osnovana 12.03.1998.' i nazivom 'Ординација Ђорђе' => uspeh, clinic_id
--     počinje sa 'nova-ordinacija-djordje-'. Opis 'Zovite 064 123 4567' i dalje => 'invalid_input'.
--  4) Postojeći redovi u new_clinics (clinic_id) nisu promenjeni.
