/* Dodajte ordinaciju: izbor paketa, polja po paketu, provera pre slanja, naslov mejla. */
(function () {
  var form = document.getElementById('addForm');
  if (!form) return;
  var $ = function (id) { return document.getElementById(id); };
  var plus = $('plusFields'), subj = $('f-subject'), naziv = $('f-naziv'), err = $('formErr'), opis = $('f-opis'), cnt = $('opisCount');
  var radios = form.querySelectorAll('input[name=paket]');

  function pkg() { var r = form.querySelector('input[name=paket]:checked'); return r ? r.value : 'profil-plus'; }
  function label(p) { return p === 'osnovni' ? 'Osnovni' : 'Profil+'; }

  function apply() {
    var p = pkg(), isPlus = p === 'profil-plus';
    plus.hidden = !isPlus;
    // polja koja ne pripadaju izabranom paketu su onemogućena, pa se ne šalju
    form.querySelectorAll('[data-p=plus]').forEach(function (el) { el.disabled = !isPlus; });
    var n = naziv.value.trim().replace(/\s+/g, ' ').slice(0, 80);
    subj.value = 'Nova ordinacija (' + label(p) + ')' + (n ? ': ' + n : '');
    err.hidden = true;
    try { sessionStorage.setItem('nz_paket', p); } catch (e) {}
  }

  // ?paket=osnovni|profil-plus (podrazumevano Profil+)
  var q = new URLSearchParams(location.search).get('paket');
  if (q === 'osnovni') $('pk-osn').checked = true; else $('pk-plus').checked = true;
  radios.forEach(function (r) { r.addEventListener('change', apply); });
  naziv.addEventListener('input', apply);
  opis.addEventListener('input', function () { cnt.textContent = opis.value.length + ' / 600'; });
  apply();

  var LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|rs|net|org|info|me)\b)/i;
  function bad(el, msg) { err.textContent = msg; err.hidden = false; try { el.focus(); } catch (e) {} return false; }

  form.addEventListener('submit', function (e) {
    var p = pkg(), v = function (id) { return $(id).value.trim(); };
    var ok = true;
    if (v('f-naziv').length < 2) ok = bad($('f-naziv'), 'Unesite naziv ordinacije (najmanje 2 znaka).');
    else if (v('f-grad').length < 2) ok = bad($('f-grad'), 'Unesite grad.');
    else if (v('f-adresa').length < 3) ok = bad($('f-adresa'), 'Unesite adresu (ulica i broj).');
    else if (v('f-telefon').replace(/\D/g, '').length < 6) ok = bad($('f-telefon'), 'Unesite ispravan broj telefona ordinacije.');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('f-email'))) ok = bad($('f-email'), 'Unesite ispravnu e-adresu za kontakt.');
    else if (v('f-osoba').length < 2) ok = bad($('f-osoba'), 'Unesite ime i prezime osobe za kontakt.');
    else if (p === 'profil-plus' && v('f-opis').length > 600) ok = bad($('f-opis'), 'Opis može imati najviše 600 znakova.');
    else if (p === 'profil-plus' && v('f-sajt') && !/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(v('f-sajt'))) ok = bad($('f-sajt'), 'Sajt unesite u obliku https://primer.rs');
    else if (!form.elements.saglasnost.checked) ok = bad(form.elements.saglasnost, 'Potrebna je saglasnost da bismo obradili zahtev.');
    if (!ok) { e.preventDefault(); return; }
    // upozorenje (ne blokira): linkovi u opisu se ne objavljuju
    if (p === 'profil-plus' && LINK.test(opis.value)) {
      err.textContent = 'Napomena: linkovi u opisu se ne objavljuju. Sajt upišite u polje „Sajt“.';
      err.hidden = false;
    }
    apply();
  });
})();
