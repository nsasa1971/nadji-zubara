/* admin.html — administratorska stranica (skrivena, noindex). Sve radnje idu kroz RPC funkcije u bazi
   (security definer, proveravaju is_admin()); ovde nema nikakvog tajnog ključa, samo publishable.
   Podaci iz baze se prikazuju isključivo preko textContent (el()). Naziv, adresa i telefon ordinacije
   iz imenika (imported-clinics.js) spajaju se u pregledaču. */
(function(){
  const app = document.getElementById('adminApp');
  if(!app) return;
  const BUCKET = 'clinic-images';
  // link za oporavak lozinke: hash ima type=recovery (Supabase ga čisti sam, zato se čita odmah pri učitavanju)
  let recovery = window.NZ_RECOVERY === true || /(^#|&)type=recovery(&|$)/.test(location.hash);
  const linkExpired = window.NZ_LINK_EXPIRED === true || /(^#|&)error_code=otp_expired(&|$)/.test(location.hash);
  if(linkExpired) { try{ history.replaceState(null, '', location.pathname + location.search); }catch(e){} }

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
    invalid_period:'Nedozvoljen period (mesec ili godina).',
    outreach_note:'Beleška je predugačka (najviše 1000 znakova).',
    invalid_input:'Neki podatak nije prihvaćen (naziv, adresa i opis ne smeju sadržati linkove, e-adrese ni brojeve telefona; proverite i dužine i koordinate).',
    not_found:'Ordinacija ne postoji (osvežite listu).',
    use_admin_review_logo:'Logo se odobrava preko posebne radnje (osvežite listu).',
    use_admin_review_cover:'Naslovna slika se odobrava preko posebne radnje (osvežite listu).'
  };
  function errText(error){
    const m = (error && error.message) || '';
    for(const k in ERRORS) if(m.indexOf(k) >= 0) return ERRORS[k];
    return 'Radnja nije uspela: ' + (m || 'nepoznata greška');
  }
  function fmtDate(d){ return d ? new Date(d).toLocaleString('sr-Latn-RS', {day:'numeric', month:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit'}) : ''; }
  function fmtDay(d){ return d ? new Date(d).toLocaleDateString('sr-Latn-RS', {day:'numeric', month:'numeric', year:'numeric'}) : ''; }
  const FIELD = {name:'Naziv', address:'Adresa', team:'Tim', images:'Slike', logo:'Logo', cover:'Naslovna slika'};
  const CLAIM_STATUS = {pending:['Na čekanju','chip-pending'], verified:['Verifikovano','chip-open'], rejected:['Odbijeno','chip-closed'], revoked:['Opozvano','chip-closed']};

  let tab = 'overview';
  let claimFilter = 'pending';
  let counts = {claims:0, changes:0, expiring:0, expired:0, due:0, newc:0, loaded:false};
  let newFilter = 'pending';
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
        tel ? el('a', {class:'btn btn-primary adm-call', href:tel}, '☎ Pozovi ' + info.phone) : null,
        row('Broj iz imenika (zovem)', tel ? el('a', {href:tel}, info.phone) : (info.phone || 'Nema broja'), true),
        row('Kod za proveru', c.verification_code, true),
        row('E-adresa podnosioca', c.email || ''),
        row('Poslato', fmtDate(c.requested_at))
      ].filter(Boolean);
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
  // Logo: odobri/odbij; baza vraća putanje fajlova koje treba obrisati iz bucket-a (stari zamenjeni logo, odnosno odbijeni fajl)
  async function reviewLogo(c, info, approve, note){
    const what = c.field === 'cover' ? 'Naslovna slika' : 'Logo';
    const { data, error } = await sb.rpc(c.field === 'cover' ? 'admin_review_cover' : 'admin_review_logo', {p_id:c.id, p_approve:approve, p_note:note});
    if(error){ flash = {text: errText(error), ok:false}; return render(); }
    let delFailed = false;
    if(Array.isArray(data) && data.length){ const del = await sb.storage.from(BUCKET).remove(data); delFailed = !!del.error; }
    const f = c.field === 'cover';
    flash = {text: what + (approve ? (f ? ' je odobrena (' : ' je odobren (') : (f ? ' je odbijena (' : ' je odbijen (')) + info.name + ').' + (delFailed ? ' Brisanje starog fajla iz skladišta nije uspelo (obriši ga ručno u Storage-u).' : ''), ok: !delFailed};
    await render();
  }

  async function viewChanges(){
    const out = [];
    const { data, error } = await sb.rpc('admin_list_changes');
    if(error){ out.push(el('div', {class:'info-card'}, errText(error))); return out; }
    if(!data.length) out.push(el('div', {class:'info-card'}, 'Nema izmena na čekanju.'));

    // potpisani URL-ovi za sve slike na čekanju (admin ima SELECT politiku nad bucketom)
    const paths = [];
    data.forEach(c => { if(c.field === 'images' && c.new_value && Array.isArray(c.new_value.paths)) c.new_value.paths.forEach(p => paths.push(p)); });
    data.forEach(c => { if((c.field === 'logo' || c.field === 'cover') && c.new_value && typeof c.new_value.path === 'string') paths.push(c.new_value.path); });
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
      if(c.field === 'logo' || c.field === 'cover'){
        const u = c.new_value && urls[c.new_value.path];
        const cover = c.field === 'cover';
        const frame = (cls, size) => { const f = el('div', {class:(cover ? 'cover-frame' : 'logo-frame') + (cls ? ' ' + cls : '')}); if(u){ const im = el('img', {alt:(cover ? 'Naslovna slika' : 'Logo') + ' na čekanju: ' + info.name, width:String(cover ? 300 : size), height:String(cover ? 110 : size)}); im.src = u; f.appendChild(im); } else f.textContent = 'Nedostupna'; return f; };
        kids.push(row((cover ? 'Naslovna slika' : 'Logo') + ' na čekanju', ''));
        if(cover) kids.push(el('div', {class:'logo-meta'}, [el('span', {class:'hint'}, 'Ovako izgleda na kartici:'), frame('card'), el('span', {class:'hint'}, 'Ovako izgleda u zaglavlju stranice:'), frame('head'), el('strong', {}, info.name)]));
        else kids.push(el('div', {class:'logo-row'}, [frame('', 96), el('div', {class:'logo-meta'}, [el('span', {class:'hint'}, 'Ovako izgleda na kartici:'), frame('sm', 44), el('strong', {}, info.name)])]));
      }
      kids.push(el('div', {style:'display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;'}, [
        actionBtn('Odobri', 'btn-primary', async () => {
          if(c.field === 'logo' || c.field === 'cover') return reviewLogo(c, info, true, null);
          await run(() => sb.rpc('admin_review_change', {p_id:c.id, p_approve:true, p_note:null}), 'Izmena je odobrena (' + (FIELD[c.field] || c.field) + ' — ' + info.name + ').');
        }),
        actionBtn('Odbij', 'btn-outline-navy', async () => {
          const isLogo = c.field === 'logo' || c.field === 'cover';
          const r = await confirmDialog({title: isLogo ? 'Odbiti sliku?' : 'Odbiti izmenu?', text:(FIELD[c.field] || c.field) + ' za „' + info.name + '“ se ne objavljuje. Vlasnik vidi napomenu kao razlog.', noteMode: isLogo ? 'optional' : 'required', confirmLabel:'Odbij', notePlaceholder:'Razlog (vlasnik ga vidi)'});
          if(!r.ok) return;
          if(isLogo) return reviewLogo(c, info, false, r.note);
          await run(() => sb.rpc('admin_review_change', {p_id:c.id, p_approve:false, p_note:r.note}), 'Izmena je odbijena.');
        })
      ]));
      out.push(el('div', {class:'info-card'}, kids));
    });
    return out;
  }

  /* ------------------------------------------------------ Objavljeni profili */
  const openImages = {};   // clinic_id -> true (prikazane slike)
  async function approvedImagesBlock(clinicId, info){
    let { data, error } = await sb.from('clinic_images').select('storage_path, position, created_at, kind').eq('clinic_id', clinicId).eq('status', 'approved').order('position', {ascending:true}).order('created_at', {ascending:true});
    if(error) ({ data, error } = await sb.from('clinic_images').select('storage_path, position, created_at').eq('clinic_id', clinicId).eq('status', 'approved').order('position', {ascending:true}).order('created_at', {ascending:true}));   // pre migracije 70
    if(error) return el('p', {}, 'Slike nisu dostupne.');
    const logo = data.find(i => i.kind === 'logo');
    const cover = data.find(i => i.kind === 'cover');
    const photos = data.filter(i => i.kind !== 'logo' && i.kind !== 'cover');
    if(!data.length) return el('p', {style:'font-size:14px;color:var(--muted);'}, 'Nema odobrenih slika.');
    const ps = photos.map(i => i.storage_path);
    const { data: signed } = await sb.storage.from(BUCKET).createSignedUrls(ps.concat(logo ? [logo.storage_path] : [], cover ? [cover.storage_path] : []), 3600);
    const urls = {}; (signed || []).forEach(s => { if(s && s.signedUrl) urls[s.path] = s.signedUrl; });
    const removeImage = (path, what) => actionBtn('Ukloni', 'btn-outline-navy', async () => {
      const r = await confirmDialog({title:'Ukloniti ' + what + '?', text:what.charAt(0).toUpperCase() + what.slice(1) + ' se skida sa javnog prikaza ordinacije „' + info.name + '“, a fajl se briše iz skladišta.', noteMode:'none', confirmLabel:'Ukloni'});
      if(!r.ok) return;
      const rpc = await sb.rpc('admin_remove_image', {p_storage_path:path});
      if(rpc.error){ flash = {text: errText(rpc.error), ok:false}; return render(); }
      const del = await sb.storage.from(BUCKET).remove([path]);
      flash = del.error ? {text:'Uklonjeno sa prikaza, ali brisanje fajla nije uspelo (obriši ga ručno u Storage-u).', ok:false} : {text:'Uklonjeno.', ok:true};
      await render();
    });
    const out = [];
    if(logo){
      const f = el('div', {class:'logo-frame'});
      if(urls[logo.storage_path]){ const im = el('img', {alt:'Logo: ' + info.name, width:'96', height:'96'}); im.src = urls[logo.storage_path]; f.appendChild(im); } else f.textContent = 'Nedostupan';
      out.push(el('div', {class:'logo-row'}, [f, el('div', {class:'logo-meta'}, [el('strong', {}, 'Logo'), removeImage(logo.storage_path, 'logo')])]));
    }
    if(cover){
      const f = el('div', {class:'cover-frame card'});
      if(urls[cover.storage_path]){ const im = el('img', {alt:'Naslovna slika: ' + info.name, width:'300', height:'110'}); im.src = urls[cover.storage_path]; f.appendChild(im); } else f.textContent = 'Nedostupna';
      out.push(el('div', {class:'logo-row'}, [f, el('div', {class:'logo-meta'}, [el('strong', {}, 'Naslovna slika'), removeImage(cover.storage_path, 'naslovnu sliku')])]));
    }
    if(ps.length){
      out.push(el('div', {class:'owner-thumbs'}, ps.map(p => {
        const kids = [];
        if(urls[p]){ const im = el('img', {alt:'', loading:'lazy'}); im.src = urls[p]; kids.push(im); } else kids.push(el('div', {class:'owner-thumb-empty'}, 'Nedostupna'));
        kids.push(removeImage(p, 'sliku'));
        return el('div', {class:'owner-thumb'}, kids);
      })));
    }
    return el('div', {}, out);
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
      mkSel('profFilter', 'Filter roka', profFilter, [['all','Svi profili'],['d30','Ističe u 30 dana'],['d7','Ističe u 7 dana'],['expired','Isteklo']], v => { profFilter = v; }),
      mkSel('profSort', 'Sortiranje', profSort, [['recent','Poslednja izmena'],['expiry','Najpre ističu (po isteku)']], v => { profSort = v; })
    ]));
    const now = Date.now();
    let list = data.slice();
    if(profFilter === 'd30') list = list.filter(p => p.expires_at && new Date(p.expires_at).getTime() > now && new Date(p.expires_at).getTime() <= now + 30 * DAY_MS);
    if(profFilter === 'd7') list = list.filter(p => p.expires_at && new Date(p.expires_at).getTime() > now && new Date(p.expires_at).getTime() <= now + 7 * DAY_MS);
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
      if(p.expires_at){
        const cp = el('button', {type:'button', class:'btn btn-outline-navy btn-sm'}, 'Kopiraj podsetnik');
        cp.addEventListener('click', async () => {
          const ok = await copyText(reminderText(p.name || info.name, p.expires_at));
          cp.textContent = ok ? 'Kopirano ✓' : 'Kopiranje nije uspelo';
          setTimeout(() => { cp.textContent = 'Kopiraj podsetnik'; }, 2200);
        });
        btns.push(cp);
      }
      btns.push(actionBtn(openImages[p.clinic_id] ? 'Sakrij slike' : 'Slike (' + p.approved_images + ')', 'btn-outline-navy', async () => { openImages[p.clinic_id] = !openImages[p.clinic_id]; await render(); }));
      kids.push(el('div', {style:'display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;'}, btns));
      if(openImages[p.clinic_id]) kids.push(await approvedImagesBlock(p.clinic_id, info));
      out.push(el('div', {class:'info-card'}, kids));
    }
    return out;
  }

  /* ----------------------------------------------------------------- Kampanja */
  const OUT_STATUS = {nije_kontaktirana:'Nije kontaktirana', kontaktirana:'Kontaktirana', zainteresovana:'Zainteresovana', nema_odgovora:'Nema odgovora', odbila:'Odbila'};
  const OUT_ORDER = ['nije_kontaktirana','kontaktirana','zainteresovana','nema_odgovora','odbila'];
  const OUT_CHIP = {nije_kontaktirana:'chip-closed', kontaktirana:'chip-pending', zainteresovana:'chip-open', nema_odgovora:'chip-pending', odbila:'chip-closed'};
  const PAGE = 40;
  let campCity = '', campStatus = '', campLimit = PAGE, campQuery = '';

  // šabloni poruka ({naziv}, {grad}, {link_stranice})
  const MSG = {
    prvi: 'Poštovani,\n\n' +
      'javljamo se iz Nađi Zubara (nadjizubara.rs), imenika stomatoloških ordinacija u Srbiji. Vaša ordinacija, {naziv} ({grad}), već je upisana u imenik: {link_stranice}\n\n' +
      'Ako su podaci tačni, ne morate ništa da radite. Ako želite da ih sami ispravite i dopunite (radno vreme, usluge, opis, cenovnik, fotografije) i dobijete oznaku „Potvrđen profil“, to možete na stranici ordinacije klikom na „Ovo je moja ordinacija“. ' +
      'Prvih 6 meseci je besplatno, a zatim 500 RSD mesečno ili 5.000 RSD godišnje; osnovni prikaz ordinacije je uvek besplatan.\n\n' +
      'Slobodno nam se javite ako imate pitanja.\n\nSrdačan pozdrav,\nNađi Zubara\ninfo@nadjizubara.rs',
    podsetnik: 'Poštovani,\n\n' +
      'samo kratak podsetnik u vezi sa vašom ordinacijom, {naziv} ({grad}), na Nađi Zubara: {link_stranice}\n\n' +
      'Ako vam odgovara, profil možete da potvrdite i dopunite za nekoliko minuta (dugme „Ovo je moja ordinacija“ na toj stranici). Prvih 6 meseci je besplatno. ' +
      'Ako vas ne zanima, nema potrebe da odgovarate: ordinacija ostaje u imeniku u osnovnom prikazu (naziv, adresa i telefon), a ako želite da bude uklonjena, javite nam.\n\n' +
      'Hvala vam i srdačan pozdrav,\nNađi Zubara\ninfo@nadjizubara.rs'
  };
  function fillMsg(tpl, c){
    return tpl.replace(/\{naziv\}/g, c.name).replace(/\{grad\}/g, c.city || '').replace(/\{link_stranice\}/g, 'https://nadjizubara.rs/ordinacija.html?id=' + encodeURIComponent(c.id));
  }
  // izvedeni status iz zahteva: Poslala zahtev / Potvrđena / Plaća
  function claimBadge(o){
    if(!o || !o.claim_status) return null;
    if(o.claim_status === 'pending') return ['Poslala zahtev', 'chip-pending'];
    if(o.claim_status === 'verified'){
      const now = Date.now();
      const paid = o.paid_until && new Date(o.paid_until).getTime() > now && (!o.valid_until || new Date(o.paid_until).getTime() > new Date(o.valid_until).getTime());
      if(paid) return ['Plaća (do ' + fmtDay(o.paid_until) + ')', 'chip-open'];
      const exp = o.paid_until && o.valid_until ? Math.max(new Date(o.paid_until), new Date(o.valid_until)) : (o.valid_until ? new Date(o.valid_until).getTime() : null);
      return exp && exp <= now ? ['Potvrđena (istekla)', 'chip-closed'] : ['Potvrđena' + (exp ? ' (do ' + fmtDay(exp) + ')' : ''), 'chip-open'];
    }
    return null;   // odbijen ili opozvan zahtev ne prikazuje se kao status
  }

  async function viewCampaign(){
    const out = [];
    const { data, error } = await sb.rpc('admin_list_outreach');
    if(error){ out.push(el('div', {class:'info-card'}, errText(error))); return out; }
    const byId = {}; (data || []).forEach(o => { byId[o.clinic_id] = o; });
    const all = (typeof getAllPublicListings === 'function' ? getAllPublicListings() : []).filter(c => c.city && c.city !== 'Nepoznato');
    const cities = Array.from(new Set(all.map(c => c.city))).sort((a, b) => a.localeCompare(b, 'sr'));
    const rowFor = c => Object.assign({status:'nije_kontaktirana', note:null, next_contact_at:null, last_contact_at:null}, byId[c.id] || {});

    // brojači po statusu (za izabrani grad)
    const inCity = all.filter(c => !campCity || c.city === campCity);
    const cnt = {}; OUT_ORDER.forEach(k => { cnt[k] = 0; });
    inCity.forEach(c => { cnt[rowFor(c).status]++; });

    const citySel = el('select', {id:'campCity', 'aria-label':'Grad'}, [el('option', {value:''}, 'Svi gradovi (' + all.length + ')')].concat(cities.map(g => { const o = el('option', {value:g}, g); if(g === campCity) o.selected = true; return o; })));
    citySel.addEventListener('change', () => { campCity = citySel.value; campLimit = PAGE; render(); });
    const q = el('input', {type:'search', id:'campQ', placeholder:'Naziv ordinacije…', 'aria-label':'Pretraga po nazivu', value:campQuery, maxlength:'60'});
    q.addEventListener('keydown', e => { if(e.key === 'Enter'){ campQuery = q.value.trim(); campLimit = PAGE; render(); } });
    q.addEventListener('change', () => { campQuery = q.value.trim(); campLimit = PAGE; render(); });
    out.push(el('div', {class:'camp-filters'}, [citySel, q]));
    out.push(el('div', {class:'camp-chips', role:'group', 'aria-label':'Status'}, [['', 'Svi (' + inCity.length + ')']].concat(OUT_ORDER.map(k => [k, OUT_STATUS[k] + ' (' + cnt[k] + ')'])).map(([k, l]) => {
      const b = el('button', {type:'button', class:'camp-chip' + (campStatus === k ? ' active' : ''), 'aria-pressed': campStatus === k ? 'true' : 'false'}, l);
      b.addEventListener('click', () => { campStatus = k; campLimit = PAGE; render(); });
      return b;
    })));

    let list = inCity.filter(c => !campStatus || rowFor(c).status === campStatus);
    if(campQuery){ const nq = normalizeText(campQuery); list = list.filter(c => normalizeText(c.name).indexOf(nq) >= 0); }
    // sortiranje: sledeći kontakt (najraniji prvi, bez datuma na kraju), pa po nazivu
    list.sort((a, b) => {
      const da = rowFor(a).next_contact_at || '9999', db = rowFor(b).next_contact_at || '9999';
      return da < db ? -1 : da > db ? 1 : a.name.localeCompare(b.name, 'sr');
    });
    out.push(el('p', {class:'adm-hint'}, 'Prikazano ' + Math.min(campLimit, list.length) + ' od ' + list.length + ' ordinacija, sortirano po datumu sledećeg kontakta.'));
    if(!list.length) out.push(el('div', {class:'info-card'}, 'Nema ordinacija za izabrane filtere.'));

    list.slice(0, campLimit).forEach(c => out.push(campCard(c, rowFor(c), byId[c.id])));
    if(list.length > campLimit){
      const more = el('button', {type:'button', class:'btn btn-outline-navy adm-wide'}, 'Prikaži još (' + (list.length - campLimit) + ')');
      more.addEventListener('click', () => { campLimit += PAGE; const y = window.scrollY; render().then(() => window.scrollTo(0, y)); });
      out.push(more);
    }
    return out;
  }

  function campCard(c, row, joined){
    const st = {status: row.status, note: row.note || '', next: row.next_contact_at || ''};
    const tel = telHref(c.phone);
    const msg = el('span', {class:'camp-saved', role:'status'});
    let timer = null;
    async function save(){
      if(st.note.length > 1000){ msg.style.color = 'var(--closed)'; msg.textContent = ERRORS.outreach_note; return; }
      msg.style.color = 'var(--muted)'; msg.textContent = 'Čuvanje…';
      const { error } = await sb.from('clinic_outreach').upsert({clinic_id: c.id, status: st.status, note: st.note.trim() || null, next_contact_at: st.next || null}, {onConflict:'clinic_id'});
      if(error){ msg.style.color = 'var(--closed)'; msg.textContent = errText(error); return; }
      msg.style.color = 'var(--open)'; msg.textContent = 'Sačuvano ✓';
      clearTimeout(timer); timer = setTimeout(() => { msg.textContent = ''; }, 2500);
      chipEl.textContent = OUT_STATUS[st.status]; chipEl.className = 'chip ' + OUT_CHIP[st.status];
    }
    const chipEl = el('span', {class:'chip ' + OUT_CHIP[st.status]}, OUT_STATUS[st.status]);
    const sel = el('select', {'aria-label':'Status kontakta'}, OUT_ORDER.map(k => { const o = el('option', {value:k}, OUT_STATUS[k]); if(k === st.status) o.selected = true; return o; }));
    sel.addEventListener('change', () => { st.status = sel.value; save(); });
    const date = el('input', {type:'date', 'aria-label':'Datum sledećeg kontakta', value: st.next});
    date.addEventListener('change', () => { st.next = date.value; save(); });
    const note = el('textarea', {rows:'2', maxlength:'1000', placeholder:'Beleška (npr. „zvati posle 15h“)', 'aria-label':'Beleška'}); note.value = st.note;
    note.addEventListener('change', () => { st.note = note.value; save(); });
    const badge = claimBadge(joined);
    const head = el('div', {class:'camp-head'}, [
      el('div', {}, [el('strong', {}, c.name), el('div', {class:'camp-addr'}, c.address || c.city)]),
      el('div', {class:'camp-chips-row'}, [chipEl].concat(badge ? [chip(badge[0], badge[1])] : []))
    ]);
    const copy = which => {
      const b = el('button', {type:'button', class:'btn btn-outline-navy btn-sm'}, which === 'prvi' ? 'Kopiraj: prvi kontakt' : 'Kopiraj: podsetnik');
      b.addEventListener('click', async () => {
        const ok = await copyText(fillMsg(MSG[which], c));
        const old = b.textContent; b.textContent = ok ? 'Kopirano ✓' : 'Kopiranje nije uspelo';
        setTimeout(() => { b.textContent = old; }, 2200);
      });
      return b;
    };
    const last = row.last_contact_at ? el('div', {class:'camp-last'}, 'Poslednji kontakt: ' + fmtDay(row.last_contact_at)) : null;
    return el('div', {class:'info-card camp-card'}, [
      head,
      tel ? el('a', {class:'btn btn-primary adm-call', href:tel}, '☎ Pozovi ' + c.phone) : el('p', {class:'adm-hint'}, 'Nema ispravnog broja telefona.'),
      el('div', {class:'camp-grid'}, [
        el('label', {class:'camp-fld'}, [el('span', {}, 'Status'), sel]),
        el('label', {class:'camp-fld'}, [el('span', {}, 'Sledeći kontakt'), date])
      ]),
      el('label', {class:'camp-fld'}, [el('span', {}, 'Beleška'), note])
    ].concat(last ? [last] : []).concat([el('div', {class:'camp-actions'}, [copy('prvi'), copy('podsetnik'), msg])]));
  }


  /* ---------------------------------------------------------- Nove ordinacije */
  const NC_STATUS = {pending:['Na čekanju','chip-pending'], published:['Objavljena','chip-open'], rejected:['Odbijena','chip-closed']};
  const NC_PAKET = {osnovni:'Osnovni', 'profil-plus':'Profil+'};
  async function viewNewClinics(){
    const out = [el('h2', {style:'margin:0 0 6px;font-size:20px;'}, 'Nove ordinacije')];
    const { data, error } = await sb.rpc('admin_list_new_clinics');
    if(error){ out.push(el('div', {class:'info-card'}, errText(error))); return out; }
    const all = Array.isArray(data) ? data : [];
    const cnt = {pending:0, published:0, rejected:0}; all.forEach(n => { if(cnt[n.status] != null) cnt[n.status]++; });
    counts.newc = cnt.pending; updateBadges();
    out.push(el('div', {class:'camp-chips', role:'group', 'aria-label':'Status'}, [['pending','Na čekanju (' + cnt.pending + ')'], ['published','Objavljene (' + cnt.published + ')'], ['rejected','Odbijene (' + cnt.rejected + ')'], ['', 'Sve (' + all.length + ')']].map(([k, l]) => {
      const b = el('button', {type:'button', class:'camp-chip' + (newFilter === k ? ' active' : ''), 'aria-pressed': newFilter === k ? 'true' : 'false'}, l);
      b.addEventListener('click', () => { newFilter = k; render(); });
      return b;
    })));
    const list = all.filter(n => !newFilter || n.status === newFilter);
    out.push(el('p', {class:'adm-hint'}, 'Ništa se ne objavljuje bez vašeg klika na „Objavi“.'));
    if(!list.length) out.push(el('div', {class:'info-card'}, 'Nema ordinacija za izabrani filter.'));
    list.forEach(n => out.push(newClinicCard(n)));
    return out;
  }

  function newClinicCard(n){
    const tel = telHref(n.telefon);
    const link = location.origin + '/ordinacija.html?pregled=' + encodeURIComponent(n.preview_token);
    const st = NC_STATUS[n.status] || [n.status, 'chip-pending'];
    const kv = (k, v) => v ? el('div', {class:'nc-kv'}, [el('span', {}, k), el('b', {}, String(v))]) : null;
    const svc = (Array.isArray(n.services) ? n.services : []).map(k => (typeof serviceName === 'function' ? serviceName(k) : k)).join(', ');
    const custom = (Array.isArray(n.custom_services) ? n.custom_services : []).join(', ');
    const details = [
      kv('Kontakt osoba', n.contact_person), kv('E-adresa (ne prikazuje se javno)', n.contact_email),
      kv('Radno vreme', n.hours_text), kv('Opis', n.description), kv('Usluge', svc), kv('Druge usluge', custom),
      kv('Sajt', n.website), kv('Mreže', n.socials_text), kv('Koordinate', (n.lat != null && n.lng != null) ? n.lat + ', ' + n.lng : ''), kv('Napomena admina', n.admin_note)
    ].filter(Boolean);
    const head = el('div', {class:'camp-head'}, [
      el('div', {}, [el('strong', {}, n.naziv), el('div', {class:'camp-addr'}, n.adresa + ', ' + n.grad), el('div', {class:'camp-last'}, 'Prijavljeno: ' + fmtDate(n.created_at))]),
      el('div', {class:'camp-chips-row'}, [chip(st[0], st[1]), chip(NC_PAKET[n.paket] || n.paket, 'chip-open')])
    ]);
    const msg = el('span', {class:'camp-saved', role:'status'});
    const flashMsg = (t, ok) => { msg.style.color = ok ? 'var(--open)' : 'var(--closed)'; msg.textContent = t; };
    const preview = el('a', {class:'btn btn-outline-navy btn-sm', href:link, target:'_blank', rel:'noopener'}, 'Pregled');
    const copy = el('button', {type:'button', class:'btn btn-outline-navy btn-sm'}, 'Kopiraj link za pregled');
    copy.addEventListener('click', async () => {
      const ok = await copyText(link);
      const old = copy.textContent; copy.textContent = ok ? 'Kopirano ✓' : 'Kopiranje nije uspelo';
      setTimeout(() => { copy.textContent = old; }, 2200);
    });
    const actions = [preview, copy];
    const editBox = el('div', {class:'nc-edit', hidden:''});
    const editBtn = el('button', {type:'button', class:'btn btn-outline-navy btn-sm'}, 'Izmeni');
    editBtn.addEventListener('click', () => { if(editBox.hidden){ buildNewEdit(editBox, n, flashMsg); } editBox.hidden = !editBox.hidden; });
    actions.push(editBtn);
    if(n.status !== 'published'){
      actions.push(actionBtn('Objavi', 'btn-primary', async () => {
        const r = await confirmDialog({title:'Objaviti ordinaciju?', text: n.naziv + ' (' + n.grad + ') će postati javno vidljiva u pretrazi i na početnoj. Kontakt podaci podnosioca se ne objavljuju.', confirmLabel:'Objavi', noteMode:'none'});
        if(r.ok) await run(() => sb.rpc('admin_set_new_clinic_status', {p_id:n.id, p_status:'published', p_note:null}), 'Ordinacija je objavljena.');
      }));
    }
    if(n.status === 'pending'){
      actions.push(actionBtn('Odbij', 'btn-outline-navy', async () => {
        const r = await confirmDialog({title:'Odbiti prijavu?', text:'Prijava za ' + n.naziv + ' će biti odbijena i neće se objaviti.', confirmLabel:'Odbij', noteMode:'required', notePlaceholder:'Razlog (vidi samo admin)'});
        if(r.ok) await run(() => sb.rpc('admin_set_new_clinic_status', {p_id:n.id, p_status:'rejected', p_note:r.note}), 'Prijava je odbijena.');
      }));
    }
    if(n.status === 'published'){
      actions.push(actionBtn('Skini sa sajta', 'btn-outline-navy', async () => {
        const r = await confirmDialog({title:'Skinuti sa sajta?', text:n.naziv + ' više neće biti javno vidljiva (vraća se na čekanje).', confirmLabel:'Skini', noteMode:'optional'});
        if(r.ok) await run(() => sb.rpc('admin_set_new_clinic_status', {p_id:n.id, p_status:'pending', p_note:r.note}), 'Ordinacija je vraćena na čekanje.');
      }));
    }
    if(n.status === 'rejected'){
      actions.push(actionBtn('Vrati na čekanje', 'btn-outline-navy', async () => {
        await run(() => sb.rpc('admin_set_new_clinic_status', {p_id:n.id, p_status:'pending', p_note:null}), 'Prijava je vraćena na čekanje.');
      }));
    }
    return el('div', {class:'info-card camp-card nc-card'}, [head,
      tel ? el('a', {class:'btn btn-primary adm-call', href:tel}, '☎ Pozovi ' + n.telefon) : el('p', {class:'adm-hint'}, 'Nema ispravnog broja telefona.'),
      el('div', {class:'nc-details'}, details),
      el('div', {class:'camp-actions'}, actions.concat([msg])), editBox]);
  }

  function buildNewEdit(box, n, flashMsg){
    box.textContent = '';
    const fld = (label, node) => el('label', {class:'camp-fld'}, [el('span', {}, label), node]);
    const inp = (v, max, type) => { const i = el('input', {type: type || 'text', maxlength:String(max)}); i.value = v == null ? '' : v; return i; };
    const f = {
      naziv: inp(n.naziv, 120), grad: inp(n.grad, 80), adresa: inp(n.adresa, 160), telefon: inp(n.telefon, 40),
      hours_text: inp(n.hours_text, 200), website: inp(n.website, 300), socials_text: inp(n.socials_text, 200),
      lat: inp(n.lat, 20), lng: inp(n.lng, 20),
      custom: inp((n.custom_services || []).join(', '), 600)
    };
    f.lat.setAttribute('inputmode', 'decimal'); f.lng.setAttribute('inputmode', 'decimal');
    const desc = el('textarea', {rows:'4', maxlength:'600'}); desc.value = n.description || '';
    const note = el('textarea', {rows:'2', maxlength:'500'}); note.value = n.admin_note || '';
    const plusOnly = n.paket === 'profil-plus';
    const groups = (typeof SERVICE_CATALOG !== 'undefined' ? SERVICE_CATALOG : []);
    const checks = groups.map(g => {
      const c = el('input', {type:'checkbox', value:g.key}); c.checked = (n.services || []).indexOf(g.key) >= 0;
      return [c, el('label', {class:'of-check'}, [c, el('span', {}, g.name)])];
    });
    const save = el('button', {type:'button', class:'btn btn-primary btn-sm'}, 'Sačuvaj izmene');
    save.addEventListener('click', async () => {
      const num = x => { const t = x.value.trim().replace(',', '.'); return t === '' ? null : Number(t); };
      const lat = num(f.lat), lng = num(f.lng);
      if((lat !== null && !Number.isFinite(lat)) || (lng !== null && !Number.isFinite(lng)) || ((lat === null) !== (lng === null))){ flashMsg('Koordinate: upišite obe (npr. 45.2671 i 19.8335) ili nijednu.', false); return; }
      const cs = f.custom.value.split(/[,;]+/).map(x => x.trim()).filter(Boolean);
      const p = {naziv:f.naziv.value, grad:f.grad.value, adresa:f.adresa.value, telefon:f.telefon.value, lat, lng, admin_note: note.value};
      if(plusOnly){
        Object.assign(p, {hours_text:f.hours_text.value, description:desc.value, website:f.website.value, socials_text:f.socials_text.value,
          services: checks.filter(c => c[0].checked).map(c => c[0].value), custom_services: cs});
      }
      save.disabled = true; flashMsg('Čuvanje…', true);
      const { error } = await sb.rpc('admin_update_new_clinic', {p_id:n.id, p});
      save.disabled = false;
      if(error){ flashMsg(errText(error), false); return; }
      flash = {text:'Izmene su sačuvane.', ok:true}; render();
    });
    box.appendChild(el('div', {class:'nc-grid'}, [fld('Naziv', f.naziv), fld('Grad', f.grad), fld('Adresa', f.adresa), fld('Telefon', f.telefon), fld('Geografska širina (lat)', f.lat), fld('Geografska dužina (lng)', f.lng)]));
    if(plusOnly){
      box.appendChild(fld('Radno vreme (tekst)', f.hours_text));
      box.appendChild(fld('Opis', desc));
      box.appendChild(el('div', {class:'of-grid2'}, checks.map(c => c[1])));
      box.appendChild(fld('Druge usluge (odvojene zarezom)', f.custom));
      box.appendChild(el('div', {class:'nc-grid'}, [fld('Sajt', f.website), fld('Društvene mreže (tekst)', f.socials_text)]));
    }
    box.appendChild(fld('Napomena admina (ne vidi se javno)', note));
    box.appendChild(el('div', {class:'camp-actions'}, [save]));
  }

  /* --------------------------------------------------------- podsetnik za mejl */
  function reminderText(naziv, isteka){
    const d = new Date(isteka);
    const datum = d.toLocaleDateString('sr-Latn-RS', {day:'numeric', month:'long', year:'numeric'}).replace(/\.$/, '');
    const istekao = d.getTime() <= Date.now();
    const uvod = istekao
      ? 'Besplatni period profila ordinacije ' + naziv + ' istekao je ' + datum + '.'
      : 'Besplatni period profila ordinacije ' + naziv + ' ističe ' + datum + '.';
    return 'Poštovani,\n\n' +
      'javljamo se iz Nađi Zubara u vezi sa profilom ordinacije ' + naziv + '. ' + uvod + '\n\n' +
      'Ako želite da nastavite sa Profilom+ (dopunjeni podaci, cenovnik, fotografije i oznaka „Potvrđen profil“), cena je 500 RSD mesečno ili 5.000 RSD godišnje. ' +
      'Kad nam odgovorite, poslaćemo vam uputstvo za uplatu; naplata nije automatska.\n\n' +
      'Ako ne želite da nastavite, ne morate ništa da radite: profil se vraća na osnovni prikaz (naziv, adresa i telefon), a podaci koje ste uneli ostaju sačuvani.\n\n' +
      'Hvala vam i srdačan pozdrav,\nNađi Zubara\ninfo@nadjizubara.rs';
  }
  async function copyText(t){
    try{
      if(navigator.clipboard && navigator.clipboard.writeText){ await navigator.clipboard.writeText(t); return true; }
    }catch(e){}
    try{
      const ta = el('textarea', {style:'position:fixed;left:-9999px;top:0;'}); ta.value = t;
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
    }catch(e){ return false; }
  }

  /* ------------------------------------------------- brojači, naslov i osvežavanje */
  const NAV = [['overview','Pregled','target'],['claims','Zahtevi','phone'],['changes','Izmene','info'],['profiles','Profili','building'],['campaign','Kampanja','flag'],['newc','Nove','pin']];
  function pendingTotal(){ return counts.claims + counts.changes + (counts.newc || 0); }
  function updateTitle(){ document.title = pendingTotal() > 0 ? '(' + pendingTotal() + ') Admin' : 'Admin'; }
  function badgeFor(k){ return k === 'claims' ? counts.claims : k === 'changes' ? counts.changes : k === 'profiles' ? counts.expiring : k === 'campaign' ? (counts.due || 0) : k === 'newc' ? (counts.newc || 0) : 0; }
  function updateBadges(){
    document.querySelectorAll('.adm-nav [data-tab]').forEach(b => {
      const n = badgeFor(b.getAttribute('data-tab'));
      const bd = b.querySelector('.adm-badge');
      if(bd){ bd.textContent = n > 99 ? '99+' : String(n); bd.hidden = !(n > 0); }
    });
    const big = document.querySelectorAll('.adm-big b');
    if(big.length === 3){ big[0].textContent = counts.claims; big[1].textContent = counts.changes; big[2].textContent = counts.expiring; }
    updateTitle();
  }
  async function loadCounts(){
    if(!sb) return;
    const [c, ch, pr, ou, nc] = await Promise.all([sb.rpc('admin_list_claims', {p_status:'pending'}), sb.rpc('admin_list_changes'), sb.rpc('admin_list_profiles'), sb.rpc('admin_list_outreach'), sb.rpc('admin_list_new_clinics')]);
    if(!nc.error && Array.isArray(nc.data)) counts.newc = nc.data.filter(n => n.status === 'pending').length;
    if(c.error && ch.error && pr.error) return;
    if(!ou.error && ou.data){ const today = new Date().toISOString().slice(0, 10); counts.due = ou.data.filter(o => o.next_contact_at && o.next_contact_at <= today && o.status !== 'odbila').length; }
    const now = Date.now();
    if(!c.error && c.data) counts.claims = c.data.length;
    if(!ch.error && ch.data) counts.changes = ch.data.length;
    if(!pr.error && pr.data){
      counts.expiring = pr.data.filter(p => p.expires_at && new Date(p.expires_at).getTime() > now && new Date(p.expires_at).getTime() <= now + 30 * 86400000).length;
      counts.expired = pr.data.filter(p => p.expires_at && new Date(p.expires_at).getTime() <= now).length;
    }
    counts.loaded = true;
    updateBadges();
  }
  let refreshTimer = null, adminShown = false;
  function startAutoRefresh(){
    adminShown = true;
    if(refreshTimer) return;
    refreshTimer = setInterval(() => { if(document.visibilityState === 'visible' && adminShown) loadCounts(); }, 60000);
    document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible' && adminShown) loadCounts(); });
  }

  /* ------------------------------------------------------------------ Pregled */
  async function viewOverview(){
    await loadCounts();
    const go = k => { tab = k; flash = null; render(); };
    const card = (n, label, k, hint) => {
      const b = el('button', {type:'button', class:'adm-big-card', 'aria-label':label + ': ' + n}, [
        el('b', {}, String(n)), el('span', {class:'adm-big-label'}, label), el('span', {class:'adm-big-hint'}, hint)]);
      b.addEventListener('click', () => go(k));
      return b;
    };
    const out = [el('div', {class:'adm-big'}, [
      card(counts.claims, 'Zahtevi na čekanju', 'claims', 'Pozovite i verifikujte'),
      card(counts.changes, 'Izmene na čekanju', 'changes', 'Odobrite ili odbijte'),
      card(counts.expiring, 'Profili koji ističu u 30 dana', 'profiles', counts.expired ? 'Istekla: ' + counts.expired : 'Podsetite vlasnike')
    ])];
    out.push(el('p', {class:'adm-hint'}, 'Brojevi se sami osvežavaju na svakih 60 sekundi dok je aplikacija otvorena, i čim se vratite u nju.'));
    out.push(el('p', {class:'adm-hint adm-version', id:'admVersion'}));
    return out;
  }

  /* ----------------------------------------------------------- prijava admina */
  function renderAdminLogin(box){
    box.textContent = '';
    const email = el('input', {type:'email', id:'admEmail', autocomplete:'username', maxlength:'254', required:'', placeholder:'admin@adresa.com'});
    const pw = el('input', {type:'password', id:'admPw', autocomplete:'current-password', maxlength:'200', required:''});
    const msg = el('p', {class:'adm-hint', role:'status', style:'margin:12px 0 0;'});
    const btn = el('button', {type:'submit', class:'btn btn-primary adm-wide'}, 'Prijavi se');
    const alt = el('button', {type:'button', class:'btn btn-outline-navy adm-wide'}, 'Prijava kodom iz e-pošte');
    const form = el('form', {novalidate:''}, [
      el('div', {class:'form-field'}, [el('label', {for:'admEmail'}, 'E-adresa'), email]),
      el('div', {class:'form-field'}, [el('label', {for:'admPw'}, 'Lozinka'), pw]),
      el('div', {style:'margin-top:14px;'}, [btn]), msg
    ]);
    box.appendChild(form);
    box.appendChild(el('div', {style:'margin-top:12px;'}, [alt]));
    const forgot = el('button', {type:'button', class:'adm-linkbtn'}, 'Zaboravili ste lozinku?');
    box.appendChild(el('div', {style:'margin-top:12px;text-align:center;'}, [forgot]));
    if(linkExpired){ msg.style.color = 'var(--closed)'; msg.textContent = 'Link je istekao ili je već iskorišćen. Zatražite novi: upišite e-adresu i izaberite „Zaboravili ste lozinku?“.'; }
    forgot.addEventListener('click', async () => {
      msg.style.color = 'var(--closed)';
      const em = email.value.trim();
      if(!isValidEmailFormat(em)){ msg.textContent = 'Upišite e-adresu u polje iznad, pa ponovo izaberite „Zaboravili ste lozinku?“.'; email.focus(); return; }
      forgot.disabled = true;
      const { error } = await sb.auth.resetPasswordForEmail(em, {redirectTo: location.origin + '/admin.html'});
      forgot.disabled = false;
      if(error && (error.status === 429 || /rate|limit|too many/i.test(error.message || ''))){ msg.textContent = 'Previše pokušaja. Sačekajte malo pa pokušajte ponovo.'; return; }
      if(error && !error.status){ msg.textContent = 'Nema veze sa serverom. Pokušajte ponovo.'; return; }
      // isti odgovor bez obzira da li nalog postoji
      msg.style.color = 'var(--open)'; msg.textContent = 'Poslali smo link na vašu e-adresu.';
    });
    alt.addEventListener('click', () => ownerLoginFlow(box, {redirectPath:'admin.html', intro:'Poslaćemo vam kod (i link) na e-adresu administratora.'}));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      msg.style.color = 'var(--closed)';
      const em = email.value.trim();
      if(!isValidEmailFormat(em) || !pw.value){ msg.textContent = 'Unesite e-adresu i lozinku.'; return; }
      btn.disabled = true;
      const { error } = await sb.auth.signInWithPassword({email: em, password: pw.value});
      btn.disabled = false;
      if(error){
        msg.textContent = (error.status === 429 || /rate|limit|too many/i.test(error.message || ''))
          ? 'Previše pokušaja. Sačekajte malo pa pokušajte ponovo.'
          : 'Pogrešna e-adresa ili lozinka.';
        return;
      }
      pw.value = '';
      msg.style.color = 'var(--open)'; msg.textContent = 'Prijavljeni ste…';
      // dalje preuzima onAuthStateChange (SIGNED_IN) -> render()
    });
  }


  /* ------------------------------------------------- nova lozinka (link za oporavak) */
  function renderSetPassword(){
    app.textContent = '';
    const pw1 = el('input', {type:'password', id:'newPw', autocomplete:'new-password', maxlength:'200', required:'', 'aria-describedby':'newPwRules'});
    const pw2 = el('input', {type:'password', id:'newPw2', autocomplete:'new-password', maxlength:'200', required:''});
    const msg = el('p', {class:'adm-hint', role:'alert', style:'margin:12px 0 0;color:var(--closed);'});
    const btn = el('button', {type:'submit', class:'btn btn-primary adm-wide'}, 'Postavi lozinku');
    const form = el('form', {novalidate:''}, [
      el('div', {class:'form-field'}, [el('label', {for:'newPw'}, 'Nova lozinka'), pw1]),
      el('div', {class:'form-field'}, [el('label', {for:'newPw2'}, 'Ponovite lozinku'), pw2]),
      el('p', {class:'adm-hint', id:'newPwRules'}, 'Najmanje 10 znakova, sa slovima i brojevima.'),
      el('div', {style:'margin-top:14px;'}, [btn]), msg
    ]);
    app.appendChild(el('div', {class:'info-card adm-login'}, [el('h3', {}, 'Postavite novu lozinku'), form]));
    pw1.focus();
    form.addEventListener('submit', async e => {
      e.preventDefault();
      msg.style.color = 'var(--closed)'; msg.textContent = '';
      const a = pw1.value, b = pw2.value;
      if(a.length < 10){ msg.textContent = 'Lozinka mora imati najmanje 10 znakova.'; pw1.focus(); return; }
      if(!/\p{L}/u.test(a) || !/\d/.test(a)){ msg.textContent = 'Lozinka mora sadržati i slova i brojeve.'; pw1.focus(); return; }
      if(a !== b){ msg.textContent = 'Lozinke se ne poklapaju.'; pw2.focus(); return; }
      btn.disabled = true;
      const { error } = await sb.auth.updateUser({password: a});
      btn.disabled = false;
      if(error){
        const m = (error.message || '') + ' ' + (error.code || '');
        msg.textContent = /same_password|different from the old/i.test(m) ? 'Nova lozinka mora biti različita od stare.'
          : /weak|pwned|short|characters/i.test(m) ? 'Lozinka je preslaba. Izaberite dužu i manje uobičajenu lozinku.'
          : /session|jwt|not authenticated|expired/i.test(m) ? 'Link je istekao. Zatražite novi na ekranu za prijavu („Zaboravili ste lozinku?“).'
          : (error.status === 429 ? 'Previše pokušaja. Sačekajte malo pa pokušajte ponovo.' : 'Lozinka nije postavljena. Pokušajte ponovo.');
        return;
      }
      pw1.value = ''; pw2.value = '';
      recovery = false;
      try{ history.replaceState(null, '', location.pathname + location.search); }catch(e){}   // briše token iz adrese
      flash = {text:'Lozinka je postavljena.', ok:true};
      render();   // nastavlja normalno, uz is_admin proveru
    });
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
    if(recovery && user){ adminShown = false; renderSetPassword(); return; }
    if(recovery && !user){ recovery = false; }   // link nije važio (istekao ili već iskorišćen)
    if(!user){
      adminShown = false;
      const box = el('div', {class:'info-card adm-login'}, [el('h3', {}, 'Prijava administratora'), el('div', {id:'loginBox'})]);
      app.appendChild(box);
      renderAdminLogin(box.querySelector('#loginBox'));
      return;
    }
    const { data: isAdmin, error } = await sb.rpc('is_admin');
    if(seq !== renderSeq) return;
    if(error || isAdmin !== true){
      // nije admin: odjava i poruka (bez ponovnog crtanja)
      adminShown = false;
      await ownerSignOut();
      app.appendChild(el('div', {class:'info-card'}, [el('h3', {}, 'Nemate pristup'),
        el('p', {style:'margin:0 0 12px;'}, 'Ovaj nalog nije administratorski. Odjavljeni ste.'),
        (function(){ const b = el('button', {type:'button', class:'btn btn-primary'}, 'Nazad na prijavu'); b.addEventListener('click', render); return b; })()]));
      return;
    }
    startAutoRefresh();
    const out = el('button', {type:'button', class:'btn btn-outline-navy btn-sm'}, 'Odjavi se');
    out.addEventListener('click', async () => { adminShown = false; await ownerSignOut(); render(); });
    app.appendChild(el('div', {class:'adm-top'}, [el('div', {class:'adm-who'}, ['Prijavljeni ste kao ', el('strong', {}, user.email || '')]), out]));
    if(flash){
      app.appendChild(el('div', {class:'info-card', role:'status', style:'padding:12px 16px;color:' + (flash.ok ? 'var(--open)' : 'var(--closed)') + ';font-weight:600;'}, flash.text));
      flash = null;
    }
    app.appendChild(content);
    content.textContent = 'Učitavanje…';
    // donja traka sa tabovima i značkama
    const nav = el('nav', {class:'adm-nav', 'aria-label':'Administracija'}, NAV.map(([k, l, ic]) => {
      const badge = el('span', {class:'adm-badge', hidden:''}, '0');
      const ico = el('span', {class:'adm-ico', 'aria-hidden':'true'}); ico.innerHTML = ICONS[ic] || '';
      const b = el('button', {type:'button', class:'adm-navbtn' + (tab === k ? ' active' : ''), 'data-tab':k, 'aria-current': tab === k ? 'page' : 'false'}, [ico, el('span', {class:'adm-lbl'}, l), badge]);
      b.addEventListener('click', () => { tab = k; flash = null; render(); });
      return b;
    }));
    app.appendChild(nav);
    updateBadges();
    const view = tab === 'overview' ? viewOverview : tab === 'claims' ? viewClaims : tab === 'changes' ? viewChanges : tab === 'campaign' ? viewCampaign : tab === 'newc' ? viewNewClinics : viewProfiles;
    const nodes = await view();
    if(seq !== renderSeq) return;
    content.textContent = '';
    nodes.forEach(n => content.appendChild(n));
    if(window.admShowVersion) window.admShowVersion();
    if(tab !== 'overview') loadCounts();
    window.scrollTo(0, 0);
  }

  // SIGNED_IN stiže i pri povratku u karticu; ako je admin već prikazan, ne crta se ponovo (čuva se stanje ekrana)
  if(sb) sb.auth.onAuthStateChange(evt => {
    if(evt === 'PASSWORD_RECOVERY'){ recovery = true; adminShown = false; setTimeout(render, 0); return; }
    if(evt === 'SIGNED_IN' && !adminShown && !recovery) setTimeout(render, 0);
  });

  /* ------------------------------------------- service worker i obaveštenje o novoj verziji */
  // Worker samo kešira statične fajlove (ne dira Supabase pozive). Aplikacija na telefonu se često samo vraća u prvi
  // plan bez novog učitavanja, pa se provera nove verzije radi pri učitavanju i pri svakom povratku u prvi plan
  // (najviše jednom u 5 minuta). Nova verzija se nikad ne primenjuje sama: prikaže se traka, a osvežavanje je na klik.
  const UPDATE_MIN_MS = 5 * 60 * 1000;
  let swReg = null, lastUpdateCheck = 0, updateBarShown = false, userClickedRefresh = false, reloaded = false;
  const hadController = !!(navigator.serviceWorker && navigator.serviceWorker.controller);

  function reloadOnce(){ if(reloaded) return; reloaded = true; location.reload(); }
  function showUpdateBar(){
    if(updateBarShown) return;
    updateBarShown = true;
    const btn = el('button', {type:'button', class:'btn btn-primary adm-upd-btn'}, 'Osveži');
    btn.addEventListener('click', () => {
      btn.disabled = true; userClickedRefresh = true;
      const waiting = swReg && swReg.waiting;
      if(waiting){ waiting.postMessage({type:'SKIP_WAITING'}); setTimeout(reloadOnce, 1500); }   // controllerchange učitava; rezerva ako ne stigne
      else reloadOnce();                                                                          // nova verzija je već aktivna
    });
    const bar = el('div', {class:'adm-upd', role:'status'}, [el('span', {}, 'Dostupna je nova verzija.'), btn]);
    document.body.insertBefore(bar, document.body.firstChild);
    const sync = () => document.documentElement.style.setProperty('--adm-upd-h', bar.offsetHeight + 'px');   // zaglavlje sajta se spušta ispod trake
    sync(); window.addEventListener('resize', sync);
  }
  function checkForUpdate(force){
    if(!swReg) return;
    const now = Date.now();
    if(!force && now - lastUpdateCheck < UPDATE_MIN_MS) return;
    lastUpdateCheck = now;
    swReg.update().catch(() => {});
  }
  function watchWorker(w){
    if(!w) return;
    w.addEventListener('statechange', () => { if(w.state === 'installed' && navigator.serviceWorker.controller) showUpdateBar(); });
  }
  let appVersion = '';
  function paintVersion(){
    const node = document.getElementById('admVersion');
    if(node) node.textContent = appVersion ? 'Verzija aplikacije: ' + appVersion : '';
  }
  function showAppVersion(){
    paintVersion();
    if(appVersion) return;
    const set = c => { const m = /^nz-admin-(v\d+)$/.exec(c || ''); if(m){ appVersion = m[1]; paintVersion(); } };
    // verzija = naziv keša aktivnog workera (jedno mesto: CACHE u admin-sw.js); ako worker ne odgovori, čita se iz keševa
    const fromCaches = () => { if(!appVersion && window.caches) caches.keys().then(keys => set(keys.filter(k => /^nz-admin-v\d+$/.test(k)).sort().pop())).catch(() => {}); };
    if(navigator.serviceWorker && navigator.serviceWorker.controller){
      const onMsg = e => { if(e.data && e.data.type === 'VERSION'){ navigator.serviceWorker.removeEventListener('message', onMsg); set(e.data.cache); } };
      navigator.serviceWorker.addEventListener('message', onMsg);
      navigator.serviceWorker.controller.postMessage({type:'GET_VERSION'});
      setTimeout(fromCaches, 800);
    } else fromCaches();
  }
  window.admShowVersion = showAppVersion;

  if('serviceWorker' in navigator){
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/admin-sw.js', {scope:'/admin.html', updateViaCache:'none'}).then(reg => {
        swReg = reg;
        lastUpdateCheck = Date.now();
        reg.update().catch(() => {});
        if(reg.waiting && navigator.serviceWorker.controller) showUpdateBar();
        watchWorker(reg.installing);
        reg.addEventListener('updatefound', () => watchWorker(reg.installing));
        showAppVersion();
      }).catch(() => {});
    });
    // novi worker preuzima kontrolu: na klik na "Osveži" učitaj novu verziju; inače samo prikaži traku (stranica ostaje kakva jeste)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if(userClickedRefresh) reloadOnce();
      else if(hadController) showUpdateBar();
    });
    document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') checkForUpdate(false); });
  }
  render();
})();
