/* Prozor "Ovo je moja ordinacija" na stranici ordinacije: e-adresa + saglasnost -> kod iz e-pošte -> zahtev za potvrdu
   profila se šalje automatski (isti INSERT u claims kao na preuzmi.html). Biblioteka za prijavu se učitava tek na klik.
   Zavisi od: safe.js (el), supabase-config.js. Bez ovog fajla ili uz grešku, dugme vodi na preuzmi.html. */
(function(){
  const SB_SRC = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js';
  const SB_SRI = 'sha384-TcHRA3zBbn+Lexh5n+Oil4guNPOS3rjNDpGRAN46u/s/mB2IZ50ceC6TYDU2yvgK';
  const ERRORS = {
    claim_limit_24h:'Poslali ste previše zahteva u poslednja 24 sata. Pokušajte ponovo kasnije.',
    claim_limit_pending:'Imate previše otvorenih zahteva. Sačekajte da se neki reši ili povucite postojeći u odeljku „Moj nalog“.',
    claim_rejected_wait:'Zahtev za ovu ordinaciju je nedavno odbijen. Novi zahtev možete poslati posle 30 dana.',
    claim_already_verified:'Vi ste već potvrđeni vlasnik ove ordinacije.'
  };
  function claimErrorText(error){
    const m = (error && error.message) || '';
    for(const k in ERRORS) if(m.indexOf(k) >= 0) return ERRORS[k];
    if(/duplicate key/i.test(m)) return 'Već imate otvoren zahtev za ovu ordinaciju. Status vidite u odeljku „Moj nalog“.';
    return 'Slanje zahteva nije uspelo. Pokušajte ponovo kasnije.';
  }

  function loadScript(src, attrs){
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = false;
      Object.keys(attrs || {}).forEach(k => s.setAttribute(k, attrs[k]));
      s.onload = res; s.onerror = () => rej(new Error('load ' + src));
      document.head.appendChild(s);
    });
  }
  let libs = null;
  function loadLibs(){
    if(typeof sb !== 'undefined' && sb && typeof ownerLoginFlow === 'function') return Promise.resolve();
    if(libs) return libs;
    libs = (typeof supabase !== 'undefined' ? Promise.resolve() : loadScript(SB_SRC, {integrity: SB_SRI, crossorigin:'anonymous'}))
      .then(() => loadScript('js/supabase-client.js'))
      .then(() => loadScript('js/owner-auth.js'))
      .then(() => { if(typeof sb === 'undefined' || !sb) throw new Error('sb'); });
    libs.catch(() => { libs = null; });
    return libs;
  }

  let overlay = null, lastFocus = null;
  function close(){
    if(!overlay) return;
    document.removeEventListener('keydown', onKey);
    overlay.remove(); overlay = null;
    if(lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function onKey(e){ if(e.key === 'Escape') close(); }

  function open(clinic){
    lastFocus = document.activeElement;
    const body = el('div', {class:'cm-body'});
    const closeBtn = el('button', {type:'button', class:'cm-close', 'aria-label':'Zatvori'}, '×');
    const box = el('div', {class:'cm-box', role:'dialog', 'aria-modal':'true', 'aria-labelledby':'cmTitle'}, [
      closeBtn,
      el('h2', {id:'cmTitle', class:'cm-title'}, 'Potvrdite profil ordinacije'),
      el('div', {class:'cm-clinic'}, [el('strong', {}, clinic.name), el('div', {class:'cm-addr'}, clinic.address || '')]),
      body
    ]);
    overlay = el('div', {class:'cm-overlay'}, [box]);
    overlay.addEventListener('click', e => { if(e.target === overlay) close(); });
    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    body.appendChild(el('p', {class:'cm-note'}, 'Učitavanje…'));

    loadLibs().then(() => start(clinic, body)).catch(() => {
      // rezerva: stara stranica sa istim tokom
      location.href = 'preuzmi.html?id=' + encodeURIComponent(clinic.id);
    });
  }

  async function start(clinic, body){
    const user = await getOwnerUser();
    if(!overlay) return;
    if(user) return confirmStep(clinic, body, user);
    body.textContent = '';
    ownerLoginFlow(body, {
      redirectPath: 'preuzmi.html?id=' + encodeURIComponent(clinic.id),
      intro: 'Unesite e-adresu na koju ćemo poslati kod za prijavu. Lozinka nije potrebna.',
      requireConsent: true,
      sendLabel: 'Pošalji kod',
      onVerified: u => submitClaim(clinic, body, u)
    });
  }

  // već prijavljen: samo saglasnost i slanje
  function confirmStep(clinic, body, user){
    body.textContent = '';
    const agree = el('input', {type:'checkbox'});
    const msg = el('p', {class:'hint', role:'status', style:'margin:12px 0 0;font-size:14px;'});
    const btn = el('button', {type:'button', class:'btn btn-primary'}, 'Pošalji zahtev');
    body.appendChild(el('p', {style:'margin:0 0 12px;color:var(--muted);font-size:14px;'}, 'Prijavljeni ste kao ' + (user.email || '') + '.'));
    body.appendChild(el('label', {style:'display:flex;gap:10px;align-items:flex-start;margin:0 0 14px;font-size:14px;'}, [
      agree, el('span', {}, ['Slažem se sa ', el('a', {href:'uslovi.html', target:'_blank', rel:'noopener'}, 'uslovima korišćenja'), ' i ',
        el('a', {href:'privatnost.html', target:'_blank', rel:'noopener'}, 'obaveštenjem o privatnosti'), ' (nacrt).'])
    ]));
    body.appendChild(btn); body.appendChild(msg);
    btn.addEventListener('click', () => {
      if(!agree.checked){ msg.style.color = 'var(--closed)'; msg.textContent = 'Morate prihvatiti uslove i obaveštenje o privatnosti.'; return; }
      btn.disabled = true;
      submitClaim(clinic, body, user);
    });
  }

  function done(body, title, text, isError){
    body.textContent = '';
    body.appendChild(el('p', {class:'cm-result' + (isError ? ' cm-err' : ''), role:'status'}, [el('strong', {}, title), el('br'), text]));
    body.appendChild(el('div', {class:'cm-actions'}, [
      el('a', {class:'btn btn-primary', href:'moj-nalog.html'}, 'Idi na Moj nalog'),
      (function(){ const b = el('button', {type:'button', class:'btn btn-outline-navy'}, 'Zatvori'); b.addEventListener('click', close); return b; })()
    ]));
  }

  async function submitClaim(clinic, body, user){
    body.textContent = '';
    body.appendChild(el('p', {class:'cm-note'}, 'Šaljemo zahtev…'));
    // postojeći zahtev za ovu ordinaciju (RLS vraća samo korisnikove)
    const { data: last } = await sb.from('claims').select('status').eq('clinic_id', clinic.id).order('requested_at', {ascending:false}).limit(1);
    const st = last && last[0] && last[0].status;
    if(st === 'pending') return done(body, 'Zahtev je već poslat.', 'Zvaćemo vas na broj iz imenika. Kod za proveru videćete u „Moj nalog“.');
    if(st === 'verified') return done(body, 'Profil je već potvrđen.', 'Izmene možete da radite u „Moj nalog“.');
    const { error } = await sb.from('claims').insert({clinic_id: clinic.id, method:'phone', consent_version: OWNER_CONSENT_VERSION});
    if(error) return done(body, 'Zahtev nije poslat.', claimErrorText(error), true);
    done(body, 'Zahtev je poslat.', 'Zvaćemo vas na broj iz imenika. Kod za proveru videćete u Moj nalog.');
  }

  window.openClaimModal = open;
})();
