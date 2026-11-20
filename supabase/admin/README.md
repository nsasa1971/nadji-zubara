# Administratorski SQL šabloni

Pokreću se **ručno u Supabase SQL editoru** (uloga `postgres`, zaobilazi RLS). Nikada iz sajta, i u sajtu ne
postoji nijedan ključ koji bi to omogućio. U svakom fajlu izmeni vrednosti označene sa `-- ZAMENI` pa pokreni.
Svaka radnja ostavlja trag u `audit_log` (actor = null, jer radi administrator).

| Fajl | Čemu služi |
|------|------------|
| `01_pregled_na_cekanju.sql` | Šta čeka: zahtevi, izmene (naziv/adresa/tim/slike) i slike |
| `02_odobri_izmenu.sql` | Odobrava jednu izmenu iz `pending_changes` (upisuje vrednost u profil) |
| `03_odbij_izmenu.sql` | Odbija jednu izmenu (uz napomenu koju vlasnik vidi) |
| `04_zahtevi.sql` | Verifikuje / odbija / opoziva zahtev, vraća profil na 'published' |
| `05_ukloni_sliku.sql` | Skida odobrenu sliku sa javnog prikaza; menja redosled (naslovna) |

Posle odbijanja ili brisanja slike, fajl ostaje u bucketu `clinic-images`: obriši ga ručno
(Storage → clinic-images → folder ordinacije) ako ne treba.
