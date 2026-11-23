/* admin.html — administratorska stranica (skrivena, noindex). Sve radnje idu kroz RPC funkcije u bazi
   (security definer, proveravaju is_admin()); ovde nema nikakvog tajnog ključa, samo publishable.
   Podaci iz baze se prikazuju isključivo preko textContent (el()). Naziv, adresa i telefon ordinacije
   iz imenika (imported-clinics.js) spajaju se u pregledaču. */
(function(){
  const app = document.getElementById('adminApp');
  if(!app) return;
  const BUCKET = 'clinic-images';

  const ERRORS = {
    not_admin:'Nemate administratorski pristup.',
    invalid_transition:'Taj prelaz statusa nije dozvoljen (zahtev je u drugom stanju nego što prikaz pokazuje; osvežite listu).',
    invalid_status:'Nedozvoljen status.',
    note_required:'Napomena je obavezna.',
    note_too_long:'Napomena je predugačka (najviše 500 znakova).',
    claim_not_found:'Zahtev ne postoji.',
    claim_limit_verified:'Taj nalog već ima 5 verifikovanih ordinacija (najviše je 5).',
    change_not_found:'Izmena ne postoji ili je već obrađena.',
    owner_not_verified:'Podnosilac izmene nije (više) verifikovan vlasnik ove ordinacije.',
    no_pending_images:'Nijedna slika iz izmene više ne čeka (vlasnik ih je uklonio).',
    profile_not_found:'Profil ne postoji.',
    image_not_found:'Slika nije pronađena među odobrenima.',
    invalid_period:'Nedozvoljen period (mesec ili godina).'
  };
  function errText(error){
    const m = (error && error.message) || '';
    for(const k in ERRORS) if(m.indexOf(k) >= 0) return ERRORS[k];
    return 'Radnja nije uspela: ' + (m || 'nepoznata greška');
  }
  function fmtDate(d){ return d ? new Date(d).toLocaleString('sr-Latn-RS', {day:'numeric', month:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit'}) : ''; }
  function fmtDay(d){ return d ? new Date(d).toLocaleDateString('sr-Latn-RS', {day:'numeric', month:'numeric', year:'numeric'}) : ''; }
  const FIELD = {name:'Naziv', address:'Adresa', team:'Tim', images:'Slike'};
  const CLAIM_STATUS = {pending:['Na čekanju','chip-pending'], verified:['Verifikovano','chip-open'], rejected:['Odbijeno','chip-closed'], revoked:['Opozvano','chip-closed']};

  let tab = 'claims';
  let claimFilter = 'pending';
  let flash = null;     // {text, ok}
  const content = el('div', {id:'adminContent'});

  /* ------------------------------------------------------------- dijalog potvrde */
  // Vraća Promise<{ok, note}>. noteMode: 'none' | 'optional' | 'required'
  function confirmDialog(opts){
    return new Promise(resolve => {
      const note = el('textarea', {rows:'3', maxlength:'500', placeholder: opts.notePlaceholder || 'Napomena', id:'dlgNote'});
      const err = el('p', {style:'color:var(--closed);font-size:13.5px;margin:6px 0 0;min-height:18px;', role:'alert'});
      const ok = el('button', {type:'button', class:'btn btn-primary'}, opts.confirmLabel || 'Potvrdi');
      const cancel = el('button', {type:'button', class:'btn btn-outline-navy'}, 'Otkaži');
      const kids = [el('h3', {id:'dlgTitle', style:'margin:0 0 8px;'}, opts.title), el('p', {style:'margin:0 0 12px;'}, opts.text)];
      let choice = null;
      if(opts.choices){
        choice = el('select', {id:'dlgChoice'}, opts.choices.map(c => el('option', {value:c.value}, c.label)));
        kids.push(el('div', {class:'form-field'}, [el('label', {for:'dlgChoice'}, opts.choiceLabel || 'Izbor'), choice]));
      }
      if(opts.noteMode && opts.noteMode !== 'none'){
        kids.push(el('div', {class:'form-field'}, [el('label', {for:'dlgNote'}, opts.noteMode === 'required' ? 'Napomena (obavezna)' : 'Napomena (nije obavezna)'), note]));
      }
      kids.push(err, el('div', {style:'display:flex;gap:10px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap;'}, [cancel, ok]));
      const box = el('div', {class:'admin-dialog', role:'dialog', 'aria-modal':'true', 'aria-labelledby':'dlgTitle'}, kids);
      const overlay = el('div', {class:'admin-overlay'}, [box]);
      function close(v){ document.removeEventListener('keydown', onKey); overlay.remove(); resolve(v); }
      function onKey(e){ if(e.key === 'Escape') close({ok:false}); }
      document.addEventListener('keydown', onKey);
      cancel.addEventListener('click', () => close({ok:false}));
      overlay.addEventListener('click', e => { if(e.target === overlay) close({ok:false}); });
      ok.addEventListener('click', () => {
        const v = note.value.trim();
        if(opts.noteMode === 'required' && !v){ err.textContent = 'Napomena je obavezna.'; note.focus(); return; }
        close({ok:true, note: v || null, choice: choice ? choice.value : null});
      });
      document.body.appendChild(overlay);
      (opts.noteMode && opts.noteMode !== 'none' ? note : (choice || cancel)).focus();
    });
  }

  /* ------------------------------------------------------------ pomoćni elementi */
  function clinicInfo(clinicId){
    const c = typeof getClinicById === 'function' ? getClinicById(clinicId) : null;
    return c ? {name:c.name, address:c.address || '', phone:c.phone || ''} : {name:clinicId, address:'', phone:''};
  }
  function telHref(p){ const d = String(p || '').replace(/[^0-9+]/g, ''); return /^\+?[0-9]{5,20}$/.test(d) ? 'tel:' + d : null; }
  function chip(label, cls){ return el('span', {class:'chip ' + cls}, label); }
  function row(label, value, big){
    return el('div', {style:'margin:6px 0;'}, [el('span', {style:'color:var(--muted);font-size:13px;display:block;'}, label), el('span', {style: big ? 'font-size:22px;font-weight:700;color:var(--navy);' : 'font-size:14.5px;'}, value)]);
  }
  function actionBtn(label, cls, handler){
    const b = el('button', {type:'button', class:'btn ' + cls + ' btn-sm'}, label);
    b.addEventListener('click', async () => { b.disabled = true; try{ await handler(); } finally { b.disabled = false; } });
    return b;
  }
  async function run(promiseFactory, okText){
    const { error } = await promiseFactory();
    flash = error ? {text: errText(error), ok:false} : {text: okText, ok:true};
    await render();
  }

  /* ---------------------------------------------------------------- Zahtevi */
  async function viewClaims(){
    const sel = el('select', {id:'claimFilter', 'aria-label':'Status zahteva'},
      [['pending','Na čekanju'],['verified','Verifikovani'],['rejected','Odbijeni'],['revoked','Opozvani'],['','Svi']].map(([v,l]) => {
        const o = el('option', {value:v}, l); if(v === claimFilter) o.selected = true; return o; }));
    sel.addEventListener('change', () => { claimFilter = sel.value; render(); });
    const out = [el('div', {style:'margin-bottom:14px;'}, [sel])];
    const { data, error } = await sb.rpc('admin_list_claims', {p_status: claimFilter || null});
    if(error){ out.push(el('div', {class:'info-card'}, errText(error))); return out; }
    if(!data.length) out.push(el('div', {class:'info-card'}, 'Nema zahteva u ovom statusu.'));
    data.forEach(c => {
      const info = clinicInfo(c.clinic_id);
      const [lbl, cls] = CLAIM_STATUS[c.status] || [c.status, ''];
      const tel = telHref(info.phone);
      const kids = [
        el('div', {style:'display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;'}, [
          el('div', {}, [el('strong', {}, info.name), el('div', {style:'color:var(--muted);font-size:14px;'}, info.address)]), chip(lbl, cls)]),
        row('Broj iz imenika (zovem)', tel ? el('a', {href:tel}, info.phone) : (info.phone || 'Nema broja'), true),
        row('Kod za proveru', c.verification_code, true),
        row('E-adresa podnosioca', c.email || ''),
        row('Poslato', fmtDate(c.requested_at))
      ];
      if(c.notes) kids.push(row('Napomena podnosioca', c.notes));
      if(c.admin_note) kids.push(row('Naša napomena (vidi je podnosilac)', c.admin_note));
      if(c.decided_at) kids.push(row('Rešeno', fmtDate(c.decided_at)));
      const btns = [];
      const label = info.name;
      if(c.status === 'pending'){
        btns.push(actionBtn('Verifikuj', 'btn-primary', async () => {
          const r = await confirmDialog({title:'Verifikovati zahtev?', text:'Ordinacija „' + label + '“ — ' + c.email + '. Od tog trenutka teče 6 besplatnih meseci, a vlasnik dobija pristup formi za izmenu profila.', noteMode:'optional', confirmLabel:'Verifikuj'});
          if(r.ok) await run(() => sb.rpc('admin_set_claim_status', {p_id:c.id, p_status:'verified', p_note:r.note}), 'Zahtev je verifikovan.');
        }));
        btns.push(actionBtn('Odbij', 'btn-outline-navy', async () => {
          const r = await confirmDialog({title:'Odbiti zahtev?', text:'Ordinacija „' + label + '“ — ' + c.email + '. Podnosilac vidi napomenu kao razlog i može ponovo da se prijavi tek posle 30 dana.', noteMode:'required', confirmLabel:'Odbij'});
          if(r.ok) await run(() => sb.rpc('admin_set_claim_status', {p_id:c.id, p_status:'rejected', p_note:r.note}), 'Zahtev je odbijen.');
        }));
      }
      if(c.status === 'verified'){
        btns.push(actionBtn('Opozovi', 'btn-outline-navy', async () => {
          const r = await confirmDialog({title:'Opozvati pristup?', text:'Ordinacija „' + label + '“ — ' + c.email + '. Vlasnik odmah gubi pristup, a javni profil se sakriva.', noteMode:'required', confirmLabel:'Opozovi'});
          if(r.ok) await run(() => sb.rpc('admin_set_claim_status', {p_id:c.id, p_status:'revoked', p_note:r.note}), 'Pristup je opozvan, profil je sakriven.');
        }));
      }
      if(btns.length) kids.push(el('div', {style:'display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;'}, btns));
      out.push(el('div', {class:'info-card'}, kids));
    });
    return out;
  }

  /* ----------------------------------------------------------------- Izmene */
  async function viewChanges(){
    const out = [];
    const { data, error } = await sb.rpc('admin_list_changes');
    if(error){ out.push(el('div', {class:'info-card'}, errText(error))); return out; }
    if(!data.length) out.push(el('div', {class:'info-card'}, 'Nema izmena na čekanju.'));

    // potpisani URL-ovi za sve slike na čekanju (admin ima SELECT politiku nad bucketom)
    const paths = [];
    data.forEach(c => { if(c.field === 'images' && c.new_value && Array.isArray(c.new_value.paths)) c.new_value.paths.forEach(p => paths.push(p)); });
    const urls = {};
    if(paths.length){
      const { data: signed } = await sb.storage.from(BUCKET).createSignedUrls(paths, 3600);
      (signed || []).forEach(s => { if(s && s.signedUrl) urls[s.path] = s.signedUrl; });
    }

    data.forEach(c => {
      const info = clinicInfo(c.clinic_id);
      const kids = [
        el('div', {style:'display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;'}, [
          el('div', {}, [el('strong', {}, (FIELD[c.field] || c.field) + ' — ' + info.name), el('div', {style:'color:var(--muted);font-size:14px;'}, info.address)]),
          chip(c.owner_verified ? 'Vlasnik verifikovan' : 'Vlasnik NIJE verifikovan', c.owner_verified ? 'chip-open' : 'chip-closed')]),
        row('Podnosilac', c.email || ''), row('Poslato', fmtDate(c.created_at))
      ];
      if(c.field === 'name' || c.field === 'address'){
        const cur = c.current_value != null ? String(c.current_value) : (c.field === 'name' ? info.name : info.address);
        kids.push(row('Sada javno', cur), row('Predloženo', String(c.new_value), true));
      } else if(c.field === 'team'){
        const fmt = list => (Array.isArray(list) && list.length) ? list.map(m => m.name + (m.role ? ' (' + m.role + ')' : '')).join(', ') : '— (nema)';
        kids.push(row('Sada javno', fmt(c.current_value)), row('Predloženo', fmt(c.new_value), true));
      } else if(c.field === 'images'){
        const ps = (c.new_value && c.new_value.paths) || [];
        const grid = el('div', {class:'owner-thumbs'}, ps.map(p => {
          if(!urls[p]) return el('div', {class:'owner-thumb'}, [el('div', {class:'owner-thumb-empty'}, 'Nedostupna')]);
          const im = el('img', {alt:'', loading:'lazy'}); im.src = urls[p];
          return el('div', {class:'owner-thumb'}, [el('a', {href:urls[p], target:'_blank', rel:'noopener'}, [im])]);
        }));
        kids.push(row('Slike na čekanju (' + ps.length + ')', ''), grid);
      }
      kids.push(el('div', {style:'display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;'}, [
        actionBtn('Odobri', 'btn-primary', async () => {
          const r = await confirmDialog({title:'Odobriti izmenu?', text:(FIELD[c.field] || c.field) + ' za „' + info.name + '“ postaje javno vidljivo.', noteMode:'optional', confirmLabel:'Odobri'});
          if(r.ok) await run(() => sb.rpc('admin_review_change', {p_id:c.id, p_approve:true, p_note:r.note}), 'Izmena je odobrena.');
        }),
        actionBtn('Odbij', 'btn-outline-navy', async () => {
          const r = await confirmDialog({title:'Odbiti izmenu?', text:(FIELD[c.field] || c.field) + ' za „' + info.name + '“ se ne objavljuje. Vlasnik vidi napomenu kao razlog.', noteMode:'required', confirmLabel:'Odbij'});
          if(r.ok) await run(() => sb.rpc('admin_review_change', {p_id:c.id, p_approve:false, p_note:r.note}), 'Izmena je odbijena.');
        })
      ]));
      out.push(el('div', {class:'info-card'}, kids));
    });
    return out;
  }

  /* ------------------------------------------------------ Objavljeni profili */
  const openImages = {};   // clinic_id -> true (prikazane slike)
  async function approvedImagesBlock(clinicId, info){
    const { data, error } = await sb.from('clinic_images').select('storage_path, position, created_at').eq('clinic_id', clinicId).eq('status', 'approved').order('position', {ascending:true}).order('created_at', {ascending:true});
    if(error) return el('p', {}, 'Slike nisu dostupne.');
    if(!data.length) return el('p', {style:'font-size:14px;color:var(--muted);'}, 'Nema odobrenih slika.');
    const ps = data.map(i => i.storage_path);
    const { data: signed } = await sb.storage.from(BUCKET).createSignedUrls(ps, 3600);
    const urls = {}; (signed || []).forEach(s => { if(s && s.signedUrl) urls[s.path] = s.signedUrl; });
    return el('div', {class:'owner-thumbs'}, ps.map(p => {
      const kids = [];
      if(urls[p]){ const im = el('img', {alt:'', loading:'lazy'}); im.src = urls[p]; kids.push(im); } else kids.push(el('div', {class:'owner-thumb-empty'}, 'Nedostupna'));
      kids.push(actionBtn('Ukloni', 'btn-outline-navy', async () => {
        const r = await confirmDialog({title:'Ukloniti sliku?', text:'Slika se skida sa javnog prikaza ordinacije „' + info.name + '“, a fajl se briše iz skladišta.', noteMode:'none', confirmLabel:'Ukloni'});
        if(!r.ok) return;
        const rpc = await sb.rpc('admin_remove_image', {p_storage_path:p});
        if(rpc.error){ flash = {text: errText(rpc.error), ok:false}; return render(); }
        const del = await sb.storage.from(BUCKET).remove([p]);
        flash = del.error ? {text:'Slika je skinuta sa prikaza, ali brisanje fajla nije uspelo (obriši ga ručno u Storage-u).', ok:false} : {text:'Slika je uklonjena.', ok:true};
        await render();
      }));
      return el('div', {class:'owner-thumb'}, kids);
    }));
  }
  // rok profila: filter i sortiranje (stanje se pamti dok je stranica otvorena)
  let profFilter = 'all', profSort = 'recent';
  const DAY_MS = 86400000;
  function daysLeft(exp){ return Math.ceil((new Date(exp).getTime() - Date.now()) / DAY_MS); }
  function expiryText(exp){
    if(!exp) return '— (nema verifikovanog zahteva)';
    const d = daysLeft(exp);
    return fmtDay(exp) + (d > 0 ? ' (za ' + d + (d === 1 ? ' dan)' : ' dana)') : ' (istekao pre ' + Math.max(1, -d) + (Math.max(1, -d) === 1 ? ' dan)' : ' dana)'));
  }
  async function viewProfiles(){
    const out = [];
    const { data, error } = await sb.rpc('admin_list_profiles');
    if(error){ out.push(el('div', {class:'info-card'}, errText(error))); return out; }
    if(!data.length){ out.push(el('div', {class:'info-card'}, 'Još nijedan profil nije objavljen.')); return out; }
    const mkSel = (id, label, cur, opts, set) => {
      const sel = el('select', {id, 'aria-label':label}, opts.map(([v, l]) => { const o = el('option', {value:v}, l); if(v === cur) o.selected = true; return o; }));
      sel.addEventListener('change', () => { set(sel.value); render(); });
      return sel;
    };
    out.push(el('div', {style:'display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;'}, [
      mkSel('profFilter', 'Filter roka', profFilter, [['all','Svi profili'],['soon','Ističu u narednih 30 dana'],['expired','Istekli']], v => { profFilter = v; }),
      mkSel('profSort', 'Sortiranje', profSort, [['recent','Poslednja izmena'],['expiry','Najpre ističu (po isteku)']], v => { profSort = v; })
    ]));
    const now = Date.now();
    let list = data.slice();
    if(profFilter === 'soon') list = list.filter(p => p.expires_at && new Date(p.expires_at).getTime() > now && new Date(p.expires_at).getTime() <= now + 30 * DAY_MS);
    if(profFilter === 'expired') list = list.filter(p => p.expires_at && new Date(p.expires_at).getTime() <= now);
    if(profSort === 'expiry') list.sort((a, b) => (a.expires_at ? new Date(a.expires_at).getTime() : Infinity) - (b.expires_at ? new Date(b.expires_at).getTime() : Infinity));
    if(!list.length) out.push(el('div', {class:'info-card'}, 'Nema profila za izabrani filter.'));
    for(const p of list){
      const info = clinicInfo(p.clinic_id);
      const published = p.status === 'published';
      const expired = !!p.expires_at && new Date(p.expires_at).getTime() <= now;
      const soon = !!p.expires_at && !expired && daysLeft(p.expires_at) <= 30;
      const kids = [
        el('div', {style:'display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;'}, [
          el('div', {}, [el('strong', {}, p.name || info.name), el('div', {style:'color:var(--muted);font-size:14px;'}, p.address || info.address)]),
          el('div', {style:'display:flex;gap:6px;flex-wrap:wrap;'}, [
            chip(published ? 'Objavljen' : 'Sakriven', published ? 'chip-open' : 'chip-closed'),
            expired ? chip('Istekao', 'chip-closed') : (soon ? chip('Ističe uskoro', 'chip-pending') : null)].filter(Boolean))]),
        row('Vlasnik', p.owner_email || '— (nema verifikovanog)'),
        row('Ističe', expiryText(p.expires_at)),
        row('Besplatno do / plaćeno do', (p.valid_until ? fmtDay(p.valid_until) : '—') + ' / ' + (p.paid_until ? fmtDay(p.paid_until) : '—')),
        row('Odobrene slike', String(p.approved_images)), row('Poslednja izmena', fmtDate(p.updated_at))
      ];
      const btns = [
        actionBtn(published ? 'Sakrij' : 'Objavi', published ? 'btn-outline-navy' : 'btn-primary', async () => {
          const r = await confirmDialog({title: published ? 'Sakriti profil?' : 'Objaviti profil?', text: published ? 'Profil „' + info.name + '“ se skriva sa sajta (prikazuju se uvezeni podaci).' : 'Profil „' + info.name + '“ postaje javno vidljiv.', noteMode:'none', confirmLabel: published ? 'Sakrij' : 'Objavi'});
          if(r.ok) await run(() => sb.rpc('admin_set_profile_status', {p_clinic_id:p.clinic_id, p_status: published ? 'hidden' : 'published'}), published ? 'Profil je sakriven.' : 'Profil je objavljen.');
        })
      ];
      if(p.expires_at){
        btns.push(actionBtn('Označi plaćeno', 'btn-primary', async () => {
          const r = await confirmDialog({title:'Označiti kao plaćeno?', text:'Profil „' + info.name + '“ ostaje potpun do izabranog roka. Period se računa od trenutnog isteka (ili od danas ako je već istekao).',
            noteMode:'none', confirmLabel:'Označi plaćeno', choiceLabel:'Period', choices:[{value:'month', label:'Mesec dana'},{value:'year', label:'Godinu dana'}]});
          if(r.ok) await run(() => sb.rpc('admin_mark_paid', {p_clinic_id:p.clinic_id, p_period:r.choice === 'year' ? 'year' : 'month'}), 'Plaćanje je evidentirano.');
        }));
      }
      btns.push(actionBtn(openImages[p.clinic_id] ? 'Sakrij slike' : 'Slike (' + p.approved_images + ')', 'btn-outline-navy', async () => { openImages[p.clinic_id] = !openImages[p.clinic_id]; await render(); }));
      kids.push(el('div', {style:'display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;'}, btns));
      if(openImages[p.clinic_id]) kids.push(await approvedImagesBlock(p.clinic_id, info));
      out.push(el('div', {class:'info-card'}, kids));
    }
    return out;
  }

  /* ------------------------------------------------------------------ okvir */
  // render() se može pozvati istovremeno više puta (odmah i ponovo na SIGNED_IN pri povratku sa magic linka):
  // stariji pozivi se posle svakog čekanja odbacuju, pa se prikaz ne duplira.
  let renderSeq = 0;
  async function render(){
    const seq = ++renderSeq;
    app.textContent = '';
    if(!sb){ app.appendChild(el('div', {class:'info-card'}, 'Nedostupno.')); return; }
    const user = await getOwnerUser();
    if(seq !== renderSeq) return;
    if(!user){
      const box = el('div', {class:'info-card'}, [el('h3', {}, 'Prijava'), el('div', {id:'loginBox'})]);
      app.appendChild(box);
      renderLoginForm(box.querySelector('#loginBox'), 'admin.html', 'Prijavite se linkom iz e-pošte.');
      return;
    }
    const out = el('button', {type:'button', class:'btn btn-outline-navy btn-sm'}, 'Odjavi se');
    out.addEventListener('click', async () => { await ownerSignOut(); render(); });
    const head = el('div', {style:'display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px;'}, [
      el('div', {}, ['Prijavljeni ste kao ', el('strong', {}, user.email || '')]), out]);
    const { data: isAdmin, error } = await sb.rpc('is_admin');
    if(seq !== renderSeq) return;
    if(error || isAdmin !== true){
      app.appendChild(head);
      app.appendChild(el('div', {class:'info-card'}, [el('h3', {}, 'Nemate pristup'), el('p', {style:'margin:0;'}, 'Ovaj nalog nije administratorski.')]));
      return;
    }
    app.appendChild(head);
    const tabs = el('div', {class:'admin-tabs', role:'tablist'}, [['claims','Zahtevi'],['changes','Izmene'],['profiles','Objavljeni profili']].map(([k, l]) => {
      const b = el('button', {type:'button', class:'admin-tab' + (tab === k ? ' active' : ''), role:'tab', 'aria-selected': tab === k ? 'true' : 'false'}, l);
      b.addEventListener('click', () => { tab = k; flash = null; render(); });
      return b;
    }));
    app.appendChild(tabs);
    if(flash){
      app.appendChild(el('div', {class:'info-card', role:'status', style:'padding:12px 16px;color:' + (flash.ok ? 'var(--open)' : 'var(--closed)') + ';font-weight:600;'}, flash.text));
      flash = null;
    }
    app.appendChild(content);
    content.textContent = 'Učitavanje…';
    const view = tab === 'claims' ? viewClaims : tab === 'changes' ? viewChanges : viewProfiles;
    const nodes = await view();
    if(seq !== renderSeq) return;
    content.textContent = '';
    nodes.forEach(n => content.appendChild(n));
  }

  if(sb) sb.auth.onAuthStateChange(evt => { if(evt === 'SIGNED_IN') setTimeout(render, 0); });
  render();
})();
