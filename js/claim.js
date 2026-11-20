/* preuzmi.html — zahtev za preuzimanje profila ordinacije. */
(function(){
  const app = document.getElementById('claimApp');
  if(!app) return;
  const params = new URLSearchParams(location.search);
  const clinicId = params.get('id') || '';
  const clinic = clinicId ? getClinicById(clinicId) : null;

  const ERRORS = {
    claim_limit_24h:'Poslali ste previše zahteva u poslednja 24 sata. Pokušajte ponovo kasnije.',
    claim_limit_pending:'Imate previše otvorenih zahteva. Sačekajte da se neki reši ili povucite postojeći.',
    claim_rejected_wait:'Zahtev za ovu ordinaciju je nedavno odbijen. Novi zahtev možete poslati posle 30 dana.',
    claim_already_verified:'Vi ste već verifikovani vlasnik ove ordinacije.'
  };
  function errorText(error){
    const m = (error && error.message) || '';
    for(const k in ERRORS) if(m.indexOf(k) >= 0) return ERRORS[k];
    if(/duplicate key/i.test(m)) return 'Već imate otvoren zahtev za ovu ordinaciju.';
    return 'Slanje nije uspelo. Pokušajte ponovo kasnije.';
  }

  function card(title, children){
    app.textContent = '';
    app.appendChild(el('div', {class:'info-card'}, [el('h3', {}, title)].concat(children)));
  }
  function para(t, style){ return el('p', {style: style || 'margin:0 0 12px;'}, t); }
  function fmtDate(d){ return new Date(d).toLocaleDateString('sr-Latn-RS', {day:'numeric', month:'long', year:'numeric'}).replace(/\.$/, ''); }

  function clinicBox(){
    return el('div', {style:'background:var(--primary-light);border-radius:12px;padding:14px 16px;margin:0 0 18px;'}, [
      el('strong', {}, clinic.name),
      el('div', {style:'color:var(--muted);font-size:14px;'}, clinic.address || '')
    ]);
  }

  async function render(){
    if(!clinic){
      card('Ordinacija nije pronađena', [para('Otvorite stranicu ordinacije i kliknite „Ovo je moja ordinacija“.'), el('a', {class:'btn btn-primary', href:'pretraga.html'}, 'Pronađi ordinaciju')]);
      return;
    }
    if(!sb){ card('Preuzimanje profila', [para('Ova funkcija trenutno nije dostupna.')]); return; }

    const user = await getOwnerUser();
    if(!user){
      app.textContent = '';
      const box = el('div', {class:'info-card'}, [el('h3', {}, 'Preuzmite profil ordinacije'), clinicBox(), el('div', {id:'loginBox'})]);
      app.appendChild(box);
      renderLoginForm(box.querySelector('#loginBox'), 'preuzmi.html?id=' + encodeURIComponent(clinicId),
        'Unesite e-adresu na koju ćete dobiti link za prijavu. Lozinka nije potrebna.');
      return;
    }

    const { data, error } = await sb.from('claims')
      .select('id, status, requested_at, decided_at, notes')
      .eq('clinic_id', clinicId).order('requested_at', {ascending:false}).limit(1);
    if(error){ card('Preuzimanje profila', [para('Podaci trenutno nisu dostupni. Pokušajte ponovo kasnije.')]); return; }
    const last = data && data[0];

    if(last && last.status === 'pending') return renderPending(last);
    if(last && last.status === 'verified') {
      return card('Profil je preuzet', [clinicBox(), para('Vaš zahtev je verifikovan.'), el('a', {class:'btn btn-primary', href:'moj-nalog.html'}, 'Idi na Moj nalog')]);
    }
    renderForm(user, last);
  }

  function renderPending(row){
    card('Zahtev je na čekanju', [
      clinicBox(),
      para('Primili smo vaš zahtev od ' + fmtDate(row.requested_at) + '. Pozvaćemo vas na broj iz imenika radi provere' +
           (safePhone(clinic.phone) ? ' (' + safePhone(clinic.phone) + ')' : '') + '.'),
      para('Kod za proveru nalazi se u odeljku „Moj nalog“. Pročitajte ga kad vas pozovemo.'),
      el('div', {style:'display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;'}, [
        el('a', {class:'btn btn-primary', href:'moj-nalog.html'}, 'Moj nalog'),
        (function(){
          const b = el('button', {type:'button', class:'btn btn-outline-navy'}, 'Povuci zahtev');
          b.addEventListener('click', async () => {
            if(!confirm('Povući zahtev za preuzimanje?')) return;
            b.disabled = true;
            const { error } = await sb.from('claims').delete().eq('id', row.id);
            if(error){ b.disabled = false; alert('Povlačenje nije uspelo.'); return; }
            render();
          });
          return b;
        })()
      ])
    ]);
  }

  function renderForm(user, last){
    const children = [clinicBox()];
    if(last && last.status === 'rejected'){
      children.push(para('Prethodni zahtev je odbijen' + (last.decided_at ? ' (' + fmtDate(last.decided_at) + ')' : '') +
        '. Novi zahtev možete poslati posle 30 dana od odbijanja.', 'margin:0 0 12px;color:var(--closed);'));
    }
    if(last && last.status === 'revoked'){
      children.push(para('Prethodni pristup ovom profilu je ukinut. Možete poslati novi zahtev.', 'margin:0 0 12px;color:var(--muted);'));
    }
    children.push(para('Prijavljeni ste kao ' + (user.email || '') + '.', 'margin:0 0 12px;color:var(--muted);font-size:14px;'));
    children.push(para('Kad pošaljete zahtev, pozvaćemo vas na broj iz imenika da proverimo da ste vlasnik ili ovlašćeno lice. Do tada profil ostaje nepromenjen.'));

    const note = el('textarea', {id:'claimNote', maxlength:'500', rows:'3', placeholder:'Npr. kada vas je najlakše pozvati (nije obavezno)'});
    const agree = el('input', {type:'checkbox', id:'claimAgree'});
    const msg = el('p', {id:'claimMsg', role:'status', style:'margin:12px 0 0;font-size:14px;'});
    const btn = el('button', {type:'submit', class:'btn btn-primary'}, 'Pošalji zahtev');
    const form = el('form', {novalidate:''}, [
      el('div', {class:'form-field'}, [el('label', {for:'claimNote'}, 'Napomena'), note,
        el('span', {class:'hint'}, 'Napomenu vidite i vi; ne upisujte lične podatke osim potrebnih.')]),
      el('label', {style:'display:flex;gap:10px;align-items:flex-start;margin:16px 0;font-size:14px;'}, [
        agree,
        el('span', {}, ['Slažem se sa ', el('a', {href:'uslovi.html'}, 'uslovima korišćenja'), ' i ', el('a', {href:'privatnost.html'}, 'obaveštenjem o privatnosti'), ' (nacrt).'])
      ]),
      btn, msg
    ]);
    children.push(form);
    card('Zahtev za preuzimanje profila', children);

    form.addEventListener('submit', async e => {
      e.preventDefault();
      msg.style.color = 'var(--closed)';
      if(!agree.checked){ msg.textContent = 'Morate prihvatiti uslove i obaveštenje o privatnosti.'; return; }
      btn.disabled = true;
      const row = { clinic_id: clinicId, method:'phone', consent_version: OWNER_CONSENT_VERSION };
      const n = note.value.trim();
      if(n) row.notes = n.slice(0, 500);
      const { error } = await sb.from('claims').insert(row);
      if(error){ msg.textContent = errorText(error); btn.disabled = false; return; }
      render();
    });
  }

  if(sb) sb.auth.onAuthStateChange((evt) => { if(evt === 'SIGNED_IN' || evt === 'SIGNED_OUT') setTimeout(render, 0); });
  render();
})();
