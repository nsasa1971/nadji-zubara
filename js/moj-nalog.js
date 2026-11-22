/* moj-nalog.html — moji zahtevi i verifikovane ordinacije. */
(function(){
  const app = document.getElementById('accountApp');
  if(!app) return;
  const STATUS = {
    pending:{label:'Na čekanju', cls:'chip-pending'},
    verified:{label:'Verifikovano', cls:'chip-open'},
    rejected:{label:'Odbijeno', cls:'chip-closed'},
    revoked:{label:'Pristup ukinut', cls:'chip-closed'}
  };
  function fmtDate(d){ return new Date(d).toLocaleDateString('sr-Latn-RS', {day:'numeric', month:'long', year:'numeric'}).replace(/\.$/, ''); }
  function addMonths(d, n){ const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }

  function claimCard(c){
    const clinic = getClinicById(c.clinic_id);
    const st = STATUS[c.status] || {label:c.status, cls:''};
    const kids = [
      el('div', {style:'display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;'}, [
        el('div', {}, [el('strong', {}, clinic ? clinic.name : c.clinic_id), el('div', {style:'color:var(--muted);font-size:14px;'}, clinic ? (clinic.address || '') : '')]),
        el('span', {class:'chip ' + st.cls}, st.label)
      ]),
      el('p', {style:'margin:10px 0 0;font-size:13.5px;color:var(--muted);'}, 'Zahtev poslat: ' + fmtDate(c.requested_at))
    ];
    if(c.status === 'pending'){
      kids.push(el('div', {style:'background:var(--primary-light);border-radius:12px;padding:14px 16px;margin-top:14px;'}, [
        el('div', {style:'font-size:13px;color:var(--muted);'}, 'Vaš kod za proveru'),
        el('div', {style:'font-size:30px;font-weight:700;letter-spacing:.2em;color:var(--navy);'}, c.verification_code || ''),
        el('div', {style:'font-size:14px;margin-top:4px;'}, 'Pročitajte ovaj kod kad vas pozovemo.')
      ]));
      kids.push(el('p', {style:'margin:12px 0 0;font-size:14px;'}, 'Zvaćemo vas na broj iz imenika' + (clinic && safePhone(clinic.phone) ? ' (' + safePhone(clinic.phone) + ')' : '') + '.'));
    }
    if(c.status === 'verified' && c.claimed_at){
      kids.push(el('p', {style:'margin:12px 0 0;font-size:14px;'}, 'Verifikovano: ' + fmtDate(c.claimed_at) + '. Besplatno do ' + fmtDate(addMonths(c.claimed_at, 6)) + '.'));
      kids.push(el('p', {style:'margin:12px 0 0;'}, [el('a', {class:'btn btn-primary btn-sm', href:'izmena-profila.html?id=' + encodeURIComponent(c.clinic_id)}, 'Izmeni profil')]));
    }
    if(c.status === 'rejected'){
      kids.push(el('p', {style:'margin:12px 0 0;font-size:14px;'}, 'Zahtev je odbijen' + (c.decided_at ? ' ' + fmtDate(c.decided_at) : '') + '. Novi zahtev možete poslati posle 30 dana.'));
    }
    if(c.status === 'revoked'){
      kids.push(el('p', {style:'margin:12px 0 0;font-size:14px;'}, 'Pristup profilu je ukinut. Za pitanja nas kontaktirajte.'));
    }
    if((c.status === 'rejected' || c.status === 'revoked') && c.admin_note){
      kids.push(el('div', {style:'background:#FEF2F2;border-radius:12px;padding:12px 14px;margin-top:12px;font-size:14px;'}, [el('strong', {}, 'Razlog: '), c.admin_note]));
    }
    if(c.notes) kids.push(el('p', {style:'margin:10px 0 0;font-size:13.5px;color:var(--muted);'}, 'Napomena: ' + c.notes));
    if(clinic) kids.push(el('p', {style:'margin:12px 0 0;font-size:14px;'}, [el('a', {href:'ordinacija.html?id=' + encodeURIComponent(c.clinic_id)}, 'Stranica ordinacije')]));
    return el('div', {class:'info-card'}, kids);
  }

  // render() se može pozvati više puta istovremeno (odmah pri učitavanju i ponovo kad Supabase javi
  // SIGNED_IN, npr. pri povratku sa magic linka). Svaki poziv gradi sadržaj odvojeno (u fragmentu) i
  // upisuje ga samo ako je i dalje najnoviji; stariji pozivi se odbacuju, pa nema dupliranih kartica.
  let renderSeq = 0;
  async function render(){
    const seq = ++renderSeq;
    const out = document.createDocumentFragment();
    const commit = () => { if(seq === renderSeq){ app.textContent = ''; app.appendChild(out); } };
    if(!sb){ out.appendChild(el('div', {class:'info-card'}, 'Ova funkcija trenutno nije dostupna.')); commit(); return; }
    const user = await getOwnerUser();
    if(seq !== renderSeq) return;
    if(!user){
      const box = el('div', {class:'info-card'}, [el('h3', {}, 'Prijava'), el('div', {id:'loginBox'})]);
      out.appendChild(box);
      renderLoginForm(box.querySelector('#loginBox'), 'moj-nalog.html', 'Unesite e-adresu — poslaćemo vam link za prijavu. Lozinka nije potrebna.');
      commit();
      return;
    }
    const logout = el('button', {type:'button', class:'btn btn-outline-navy btn-sm'}, 'Odjavi se');
    logout.addEventListener('click', async () => { await ownerSignOut(); render(); });
    out.appendChild(el('div', {style:'display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px;'}, [
      el('div', {}, ['Prijavljeni ste kao ', el('strong', {}, user.email || '')]), logout
    ]));
    const { data, error } = await sb.from('claims')
      .select('id, clinic_id, status, requested_at, claimed_at, decided_at, notes, admin_note, verification_code')
      .order('requested_at', {ascending:false});
    if(seq !== renderSeq) return;
    if(error){ out.appendChild(el('div', {class:'info-card'}, 'Podaci trenutno nisu dostupni. Pokušajte ponovo kasnije.')); commit(); return; }
    if(!data.length){
      out.appendChild(el('div', {class:'info-card'}, [el('p', {style:'margin:0 0 12px;'}, 'Nemate nijedan zahtev. Pronađite svoju ordinaciju i kliknite „Ovo je moja ordinacija“.'), el('a', {class:'btn btn-primary', href:'pretraga.html'}, 'Pronađi ordinaciju')]));
      commit();
      return;
    }
    data.forEach(c => out.appendChild(claimCard(c)));
    commit();
  }

  if(sb) sb.auth.onAuthStateChange((evt) => { if(evt === 'SIGNED_IN') setTimeout(render, 0); });
  render();
})();
