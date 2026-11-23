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


  function list(v){ return v.split(/[,;\n]+/).map(function(x){ return x.trim(); }).filter(Boolean); }
  function buildPayload(p){
    var v = function(id){ return $(id).value.trim(); };
    var plus = p === 'profil-plus';
    var d = {paket:p, naziv:v('f-naziv'), grad:v('f-grad'), adresa:v('f-adresa'), telefon:v('f-telefon'),
      contact_email:v('f-email'), contact_person:v('f-osoba'), consent_version:'nacrt-2026-11-20'};
    if(!/^[0-9 +()\/-]+$/.test(d.telefon)) return {error:'Telefon sme da sadrži samo cifre, razmake i znakove + - / ( ).', el:$('f-telefon')};
    if(!NEWC.cleanText(d.naziv)) return {error:'Naziv ne sme sadržati link, e-adresu ni broj telefona.', el:$('f-naziv')};
    if(!NEWC.cleanText(d.grad)) return {error:'Grad ne sme sadržati link, e-adresu ni broj telefona.', el:$('f-grad')};
    if(!NEWC.cleanFreeText(d.adresa)) return {error:'Adresa ne sme sadržati link ni e-adresu.', el:$('f-adresa')};
    if(!NEWC.cleanText(d.contact_person)) return {error:'Ime osobe za kontakt ne sme sadržati link, e-adresu ni broj telefona.', el:$('f-osoba')};
    if(plus){
      d.hours_text = v('f-radno'); d.description = v('f-opis'); d.website = v('f-sajt'); d.socials_text = v('f-mreze');
      d.services = Array.prototype.map.call(form.querySelectorAll('input[name=usluge]:checked'), function(i){ return i.value; });
      var cs = list($('f-druge').value);
      if(cs.length > 10) return {error:'Druge usluge: najviše 10, odvojenih zarezom.', el:$('f-druge')};
      for(var i = 0; i < cs.length; i++){
        if(cs[i].length > 60) return {error:'Svaka druga usluga može imati najviše 60 znakova.', el:$('f-druge')};
        if(!NEWC.cleanText(cs[i])) return {error:'Druge usluge ne smeju sadržati link, e-adresu ni broj telefona.', el:$('f-druge')};
      }
      d.custom_services = cs;
      if(d.hours_text && (LINK.test(d.hours_text) || d.hours_text.indexOf('@') >= 0)) return {error:'Radno vreme ne sme sadržati link ni e-adresu.', el:$('f-radno')};
      if(d.description && !NEWC.cleanFreeText(d.description)) return {error:'Opis ne sme sadržati linkove, e-adrese ni brojeve telefona. Sajt upišite u polje „Sajt“.', el:$('f-opis')};
      if(d.socials_text && d.socials_text.indexOf('@') >= 0) return {error:'Društvene mreže upišite kao adresu profila (bez znaka @).', el:$('f-mreze')};
    }
    return {data:d};
  }
  function notifyNetlify(){
    try{
      fetch('/', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams(new FormData(form)).toString()}).catch(function(){});
    }catch(e){}
  }
  function showResult(p, token){
    var url = NEWC.previewUrl(token);
    $('resOpen').href = url; $('resLink').value = url;
    $('resPlus').hidden = p !== 'profil-plus';
    form.hidden = true;
    var note = document.querySelector('.form-note'); if(note) note.hidden = true;
    var box = $('addResult'); box.hidden = false; box.focus();
    window.scrollTo(0, 0);
    $('resCopy').addEventListener('click', function(){
      var b = $('resCopy'), old = b.textContent;
      function ok(){ b.textContent = 'Kopirano ✓'; setTimeout(function(){ b.textContent = old; }, 2200); }
      function fallback(){ var i = $('resLink'); i.focus(); i.select(); try{ document.execCommand('copy') ? ok() : (b.textContent = 'Označeno: pritisnite Ctrl+C'); }catch(e){ b.textContent = 'Označeno: pritisnite Ctrl+C'; } }
      if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok, fallback); else fallback();
    });
  }

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
    e.preventDefault();
    apply();
    // slanje u bazu (preko RPC-a); Netlify obrazac ostaje rezerva i obaveštenje adminu na mejl
    var payload = buildPayload(p);
    var msg = payload.error;
    if(msg){ bad(payload.el, msg); return; }
    var btn = form.querySelector('button[type=submit]');
    btn.disabled = true; err.hidden = true;
    NEWC.submit(payload.data).then(function(res){
      if(res.ok){ notifyNetlify(); showResult(p, res.token); return; }
      btn.disabled = false;
      if(res.network || res.code === 'config'){ form.submit(); return; }   // baza nedostupna: obični Netlify obrazac (stranica "hvala")
      err.textContent = res.message; err.hidden = false;
    });
  });
})();
