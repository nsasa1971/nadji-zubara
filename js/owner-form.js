/* izmena-profila.html — forma za izmenu profila (verifikovan vlasnik).
   Direktno (profile_overrides): telefoni, radno vreme, usluge, opis, sajt, društvene mreže.
   Na odobrenje (pending_changes): naziv, adresa, tim, slike.
   Sve što korisnik unese prikazuje se isključivo preko textContent/value (nema innerHTML). */
(function(){
  const app = document.getElementById('formApp');
  if(!app) return;
  const clinicId = new URLSearchParams(location.search).get('id') || '';
  const clinic = clinicId ? getClinicById(clinicId) : null;
  const BUCKET = 'clinic-images';
  const MAX_IMAGES = 8, MAX_BYTES = 5 * 1024 * 1024;
  const DAYS = [['mon','Ponedeljak'],['tue','Utorak'],['wed','Sreda'],['thu','Četvrtak'],['fri','Petak'],['sat','Subota'],['sun','Nedelja']];
  const SOCIALS = [['facebook','Facebook'],['instagram','Instagram'],['linkedin','LinkedIn'],['tiktok','TikTok'],['youtube','YouTube']];
  const FIELD_LABEL = {name:'Naziv', address:'Adresa', team:'Tim', images:'Slike'};
  const STATUS_LABEL = {pending:['Čeka odobrenje','chip-pending'], approved:['Odobreno','chip-open'], rejected:['Odbijeno','chip-closed']};
  const IMG_TYPES = {'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'};

  const ERRORS = {
    image_limit:'Najviše 8 slika po ordinaciji (računaju se i one koje čekaju odobrenje).',
    change_limit_24h:'Poslali ste previše izmena u poslednja 24 sata. Pokušajte kasnije.'
  };
  function errorText(error){
    const m = (error && error.message) || '';
    for(const k in ERRORS) if(m.indexOf(k) >= 0) return ERRORS[k];
    if(/check constraint|violates/i.test(m)) return 'Neka vrednost je predugačka ili nije u ispravnom obliku.';
    return 'Čuvanje nije uspelo. Pokušajte ponovo kasnije.';
  }
  function fmtDate(d){ return new Date(d).toLocaleDateString('sr-Latn-RS', {day:'numeric', month:'long', year:'numeric'}).replace(/\.$/, ''); }
  function showMsg(node, text, ok){ node.textContent = text; node.style.color = ok ? 'var(--open)' : 'var(--closed)'; }
  function card(title, kids){ return el('div', {class:'info-card'}, [el('h3', {}, title)].concat(kids)); }
  function field(label, input, hint){
    return el('div', {class:'form-field', style:'margin-bottom:12px;'}, [el('label', {}, label), input].concat(hint ? [el('span', {class:'hint'}, hint)] : []));
  }

  // ---- validacija (ista pravila kao CHECK u bazi) ----
  const URL_RE = /^https?:\/\/[^\s]+$/;
  function validUrl(u){ return u.length <= 300 && URL_RE.test(u) && !!safeUrl(u); }
  const PHONE_RE = /^[0-9+()\/ -]{6,20}$/;

  function imageKind(bytes){
    if(bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
    if(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
    if(bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
    return null;
  }

  let state = {profile:null, changes:[], images:[], urls:{}};

  async function loadAll(){
    const [p, ch, im] = await Promise.all([
      sb.from('profile_overrides').select('clinic_id, phones, hours, services, description, website, socials, name, address, team_public, updated_at').eq('clinic_id', clinicId).maybeSingle(),
      sb.from('pending_changes').select('id, field, new_value, status, created_at, reviewed_at, review_note').eq('clinic_id', clinicId).order('created_at', {ascending:false}).limit(40),
      sb.from('clinic_images').select('id, storage_path, status, created_at').eq('clinic_id', clinicId).order('created_at', {ascending:true})
    ]);
    if(p.error || ch.error || im.error) throw new Error('load');
    state.profile = p.data; state.changes = ch.data || []; state.images = im.data || [];
    state.urls = {};
    const paths = state.images.filter(i => i.status !== 'rejected').map(i => i.storage_path);
    if(paths.length){
      const { data } = await sb.storage.from(BUCKET).createSignedUrls(paths, 3600);
      (data || []).forEach(d => { if(d && d.signedUrl) state.urls[d.path] = d.signedUrl; });
    }
  }

  function pendingOf(fieldName){ return state.changes.find(c => c.field === fieldName && c.status === 'pending'); }

  /* ---------------------------------------------------- direktne izmene */
  function buildDirect(){
    const prof = state.profile || {};
    const msg = el('p', {role:'status', style:'margin:12px 0 0;font-size:14px;'});

    // telefoni
    const phoneBox = el('div', {});
    const initPhones = (prof.phones && prof.phones.length) ? prof.phones : (isValidPhone(clinic.phone) ? [clinic.phone] : ['']);
    const addPhoneBtn = el('button', {type:'button', class:'btn btn-outline-navy btn-sm'}, 'Dodaj telefon');
    function addPhone(v){
      const input = el('input', {type:'tel', maxlength:'20', placeholder:'+381 11 123 4567'});
      input.value = v || '';
      const rm = el('button', {type:'button', class:'btn btn-outline-navy btn-sm', 'aria-label':'Ukloni telefon'}, '×');
      const row = el('div', {style:'display:flex;gap:8px;margin-bottom:8px;'}, [input, rm]);
      rm.addEventListener('click', () => { row.remove(); addPhoneBtn.disabled = false; });
      phoneBox.appendChild(row);
      if(phoneBox.children.length >= 3) addPhoneBtn.disabled = true;
    }
    initPhones.slice(0, 3).forEach(addPhone);
    addPhoneBtn.addEventListener('click', () => addPhone(''));

    // radno vreme
    const hoursIn = {};
    const hoursRows = DAYS.map(([k, label]) => {
      const i = el('input', {type:'text', maxlength:'60', placeholder:'npr. 08:00–16:00 ili Zatvoreno'});
      i.value = (prof.hours && prof.hours[k]) || '';
      hoursIn[k] = i;
      return field(label, i);
    });

    // usluge
    const chosen = new Set(prof.services || []);
    const svcBoxes = [];
    const svcWrap = el('div', {}, SERVICE_CATALOG.map(cat => {
      const catCb = el('input', {type:'checkbox'}); catCb.value = cat.key; catCb.checked = chosen.has(cat.key);
      svcBoxes.push(catCb);
      const subs = cat.subservices.map(s => {
        const cb = el('input', {type:'checkbox'}); cb.value = s.key; cb.checked = chosen.has(s.key); svcBoxes.push(cb);
        return el('label', {style:'display:flex;gap:8px;align-items:flex-start;margin:4px 0 4px 26px;font-size:14px;'}, [cb, el('span', {}, s.name)]);
      });
      return el('div', {style:'margin-bottom:10px;'}, [
        el('label', {style:'display:flex;gap:8px;align-items:center;font-weight:600;'}, [catCb, el('span', {}, cat.name)])
      ].concat(subs));
    }));

    // opis
    const desc = el('textarea', {maxlength:'1000', rows:'5'}); desc.value = prof.description || '';
    const counter = el('span', {class:'hint'}, '');
    function upd(){ counter.textContent = desc.value.length + ' / 1000'; }
    desc.addEventListener('input', upd); upd();

    // sajt i mreže
    const web = el('input', {type:'url', maxlength:'300', placeholder:'https://…'}); web.value = prof.website || '';
    const socIn = {};
    const socRows = SOCIALS.map(([k, label]) => {
      const i = el('input', {type:'url', maxlength:'300', placeholder:'https://…'}); i.value = (prof.socials && prof.socials[k]) || ''; socIn[k] = i;
      return field(label, i);
    });

    const saveBtn = el('button', {type:'submit', class:'btn btn-primary'}, 'Sačuvaj');
    const form = el('form', {novalidate:''}, [
      card('Telefoni', [phoneBox, addPhoneBtn, el('p', {class:'hint', style:'margin:8px 0 0;font-size:13px;color:var(--muted);'}, 'Do 3 broja.')]),
      card('Radno vreme', hoursRows.concat([el('p', {style:'margin:0;font-size:13px;color:var(--muted);'}, 'Slobodan tekst do 60 znakova po danu. Prazno polje = nije navedeno.')])),
      card('Usluge', [svcWrap]),
      card('Kratak opis', [desc, counter]),
      card('Sajt i društvene mreže', [field('Sajt ordinacije', web, 'Samo adrese koje počinju sa http:// ili https://')].concat(socRows)),
      el('div', {}, [saveBtn, msg])
    ]);

    form.addEventListener('submit', async e => {
      e.preventDefault();
      // telefoni
      const phones = Array.from(phoneBox.querySelectorAll('input')).map(i => i.value.trim()).filter(Boolean);
      for(const p of phones) if(!PHONE_RE.test(p)){ showMsg(msg, 'Telefon „' + p + '“ nije u ispravnom obliku (6–20 znakova: cifre, razmak, + - / ( )).', false); return; }
      // radno vreme
      const hours = {};
      for(const [k, label] of DAYS){
        const v = hoursIn[k].value.trim();
        if(v.length > 60){ showMsg(msg, label + ': najviše 60 znakova.', false); return; }
        if(v) hours[k] = v;
      }
      // usluge
      const services = svcBoxes.filter(c => c.checked).map(c => c.value);
      // opis
      const description = desc.value.trim();
      if(description.length > 1000){ showMsg(msg, 'Opis je predugačak (najviše 1000 znakova).', false); return; }
      // sajt, mreže
      const website = web.value.trim();
      if(website && !validUrl(website)){ showMsg(msg, 'Sajt mora biti ispravna http:// ili https:// adresa.', false); return; }
      const socials = {};
      for(const [k, label] of SOCIALS){
        const v = socIn[k].value.trim();
        if(v && !validUrl(v)){ showMsg(msg, label + ': unesite ispravnu http:// ili https:// adresu.', false); return; }
        if(v) socials[k] = v;
      }
      saveBtn.disabled = true;
      const payload = {
        phones,
        hours: Object.keys(hours).length ? hours : null,
        services,
        description: description || null,
        website: website || null,
        socials: Object.keys(socials).length ? socials : null
      };
      // (bez upsert-a: on conflict bi menjao i clinic_id, na koji klijent nema UPDATE pravo)
      let error;
      if(state.profile){
        ({ error } = await sb.from('profile_overrides').update(payload).eq('clinic_id', clinicId));
      } else {
        ({ error } = await sb.from('profile_overrides').insert(Object.assign({clinic_id: clinicId}, payload)));
        if(error && /duplicate key/i.test(error.message || '')) ({ error } = await sb.from('profile_overrides').update(payload).eq('clinic_id', clinicId));
      }
      if(!error) state.profile = Object.assign({}, state.profile || {clinic_id: clinicId}, payload);
      saveBtn.disabled = false;
      if(error){ showMsg(msg, errorText(error), false); return; }
      showMsg(msg, 'Sačuvano. Izmene su objavljene na profilu.', true);
    });
    return form;
  }

  /* ----------------------------------------- izmene koje čekaju odobrenje */
  function submitChange(fieldName, value, msgNode, btn, after){
    return async () => {
      btn.disabled = true;
      const { error } = await sb.from('pending_changes').insert({clinic_id: clinicId, field: fieldName, new_value: value});
      btn.disabled = false;
      if(error){ showMsg(msgNode, errorText(error), false); return false; }
      showMsg(msgNode, 'Poslato na odobrenje.', true);
      if(after) await after();
      return true;
    };
  }

  function pendingNote(fieldName){
    const p = pendingOf(fieldName);
    return p ? el('p', {style:'margin:8px 0 0;font-size:13.5px;color:var(--muted);'}, 'Na čekanju od ' + fmtDate(p.created_at) + ': ' + summarize(p)) : null;
  }
  function summarize(c){
    if(c.field === 'team') return (c.new_value || []).map(m => m.name + (m.role ? ' (' + m.role + ')' : '')).join(', ');
    if(c.field === 'images') return ((c.new_value && c.new_value.paths) || []).length + ' slika';
    return String(c.new_value);
  }

  function buildTextChange(fieldName, label, current, max, min){
    const input = el('input', {type:'text', maxlength:String(max)});
    const p = pendingOf(fieldName);
    input.value = p ? String(p.new_value) : current;
    const btn = el('button', {type:'button', class:'btn btn-outline-navy btn-sm'}, 'Pošalji na odobrenje');
    const msg = el('p', {role:'status', style:'margin:8px 0 0;font-size:14px;'});
    btn.addEventListener('click', () => {
      const v = input.value.trim();
      if(v.length < min || v.length > max){ showMsg(msg, label + ': ' + min + '–' + max + ' znakova.', false); return; }
      if(v === current){ showMsg(msg, 'Vrednost je ista kao trenutna.', false); return; }
      submitChange(fieldName, v, msg, btn, refresh)();
    });
    const kids = [field(label, input, 'Trenutno javno: ' + current), btn, msg];
    const note = pendingNote(fieldName); if(note) kids.splice(1, 0, note);
    return card(label + ' (na odobrenje)', kids);
  }

  function buildTeam(){
    const p = pendingOf('team');
    const base = p ? p.new_value : ((state.profile && state.profile.team_public) || []);
    const box = el('div', {});
    const addBtn = el('button', {type:'button', class:'btn btn-outline-navy btn-sm'}, 'Dodaj člana');
    function addRow(m){
      const n = el('input', {type:'text', maxlength:'100', placeholder:'Ime i prezime'}); n.value = (m && m.name) || '';
      const r = el('input', {type:'text', maxlength:'100', placeholder:'Uloga (npr. ortodont)'}); r.value = (m && m.role) || '';
      const rm = el('button', {type:'button', class:'btn btn-outline-navy btn-sm', 'aria-label':'Ukloni člana'}, '×');
      const row = el('div', {class:'team-row', style:'display:grid;grid-template-columns:1fr 1fr auto;gap:8px;margin-bottom:8px;'}, [n, r, rm]);
      rm.addEventListener('click', () => { row.remove(); addBtn.disabled = false; });
      box.appendChild(row);
      if(box.children.length >= 30) addBtn.disabled = true;
    }
    base.forEach(addRow);
    addBtn.addEventListener('click', () => addRow(null));
    const btn = el('button', {type:'button', class:'btn btn-outline-navy btn-sm'}, 'Pošalji tim na odobrenje');
    const msg = el('p', {role:'status', style:'margin:8px 0 0;font-size:14px;'});
    btn.addEventListener('click', () => {
      const team = [];
      for(const row of box.querySelectorAll('.team-row')){
        const [n, r] = row.querySelectorAll('input');
        const name = n.value.trim(), role = r.value.trim();
        if(!name && !role) continue;
        if(!name){ showMsg(msg, 'Svaki član mora imati ime.', false); return; }
        team.push(role ? {name, role} : {name});
      }
      submitChange('team', team, msg, btn, refresh)();
    });
    const kids = [box, addBtn, el('p', {style:'margin:8px 0 0;font-size:13px;color:var(--muted);'}, 'Tim se objavljuje tek posle odobrenja. Do 30 članova.'), el('div', {style:'margin-top:10px;'}, [btn]), msg];
    const note = pendingNote('team'); if(note) kids.splice(1, 0, note);
    return card('Tim (na odobrenje)', kids);
  }

  function buildImages(){
    const active = state.images.filter(i => i.status !== 'rejected');
    const grid = el('div', {class:'owner-thumbs'}, state.images.map(img => {
      const [lbl, cls] = STATUS_LABEL[img.status] || [img.status, ''];
      const kids = [];
      if(state.urls[img.storage_path]){
        const im = el('img', {alt:'', loading:'lazy'}); im.src = state.urls[img.storage_path]; kids.push(im);
      } else kids.push(el('div', {class:'owner-thumb-empty'}, 'Bez prikaza'));
      kids.push(el('span', {class:'chip ' + cls}, lbl));
      if(img.status === 'pending'){
        const del = el('button', {type:'button', class:'btn btn-outline-navy btn-sm'}, 'Ukloni');
        del.addEventListener('click', async () => {
          del.disabled = true;
          await sb.storage.from(BUCKET).remove([img.storage_path]);
          const { error } = await sb.from('clinic_images').delete().eq('id', img.id);
          if(error){ del.disabled = false; return; }
          refresh();
        });
        kids.push(del);
      }
      return el('div', {class:'owner-thumb'}, kids);
    }));
    const file = el('input', {type:'file', accept:'image/jpeg,image/png,image/webp', multiple:''});
    const btn = el('button', {type:'button', class:'btn btn-outline-navy btn-sm'}, 'Otpremi slike');
    const msg = el('p', {role:'status', style:'margin:8px 0 0;font-size:14px;'});
    if(state.flash){ showMsg(msg, state.flash.text, state.flash.ok); state.flash = null; }
    btn.addEventListener('click', async () => {
      const files = Array.from(file.files || []);
      if(!files.length){ showMsg(msg, 'Izaberite slike.', false); return; }
      const free = MAX_IMAGES - active.length;
      if(files.length > free){ showMsg(msg, 'Možete dodati još ' + Math.max(free, 0) + ' slika (najviše 8 po ordinaciji).', false); return; }
      btn.disabled = true; showMsg(msg, 'Otpremanje…', true);
      const ok = []; let lastErr = null;
      for(const f of files){
        if(f.size > MAX_BYTES){ lastErr = 'Slika „' + f.name + '“ je veća od 5 MB.'; continue; }
        const kind = imageKind(new Uint8Array(await f.slice(0, 16).arrayBuffer()));
        if(!kind || !IMG_TYPES[kind]){ lastErr = '„' + f.name + '“ nije JPEG, PNG ili WebP slika.'; continue; }
        const path = clinicId + '/' + crypto.randomUUID() + IMG_TYPES[kind];
        const ins = await sb.from('clinic_images').insert({clinic_id: clinicId, storage_path: path});
        if(ins.error){ lastErr = errorText(ins.error); break; }
        const up = await sb.storage.from(BUCKET).upload(path, f.slice(0, f.size, kind), {contentType: kind, upsert:false});
        if(up.error){ await sb.from('clinic_images').delete().eq('storage_path', path); lastErr = 'Otpremanje slike nije uspelo.'; continue; }
        ok.push(path);
      }
      if(ok.length){
        const { error } = await sb.from('pending_changes').insert({clinic_id: clinicId, field:'images', new_value:{paths: ok}});
        if(error) lastErr = errorText(error);
      }
      btn.disabled = false;
      const flash = lastErr ? {text: lastErr + (ok.length ? ' (poslato: ' + ok.length + ')' : ''), ok:false} : {text: 'Poslato na odobrenje: ' + ok.length + ' slika.', ok:true};
      showMsg(msg, flash.text, flash.ok);
      if(ok.length){ state.flash = flash; refresh(); }
    });
    return card('Slike (na odobrenje)', [
      el('p', {style:'margin:0 0 10px;font-size:14px;color:var(--muted);'}, 'JPEG, PNG ili WebP, do 5 MB. Najviše 8 slika (' + active.length + '/8). Slike se objavljuju tek posle odobrenja.'),
      grid, el('div', {style:'margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;'}, [file, btn]), msg
    ]);
  }

  function buildHistory(){
    if(!state.changes.length) return null;
    return card('Vaše izmene na odobrenje', state.changes.map(c => {
      const [lbl, cls] = STATUS_LABEL[c.status] || [c.status, ''];
      const kids = [
        el('div', {style:'display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;'}, [
          el('strong', {}, (FIELD_LABEL[c.field] || c.field) + ' — ' + fmtDate(c.created_at)), el('span', {class:'chip ' + cls}, lbl)]),
        el('div', {style:'font-size:14px;color:var(--muted);margin-top:4px;'}, summarize(c))
      ];
      if(c.status === 'rejected' && c.review_note) kids.push(el('div', {style:'font-size:14px;margin-top:4px;'}, 'Razlog: ' + c.review_note));
      return el('div', {style:'border-top:1px solid var(--border);padding:10px 0;'}, kids);
    }));
  }

  /* ------------------------------------------------------------- render */
  async function refresh(){
    try{ await loadAll(); } catch(e){ app.textContent = 'Podaci trenutno nisu dostupni.'; return; }
    draw();
  }
  function draw(){
    app.textContent = '';
    const curName = (state.profile && state.profile.name) || clinic.name;
    const curAddr = (state.profile && state.profile.address) || clinic.address || '';
    app.appendChild(el('div', {style:'margin-bottom:18px;'}, [
      el('strong', {}, clinic.name),
      el('div', {style:'color:var(--muted);font-size:14px;'}, clinic.address || ''),
      el('div', {style:'margin-top:6px;'}, [el('a', {href:'moj-nalog.html'}, '← Moj nalog'), ' · ', el('a', {href:'ordinacija.html?id=' + encodeURIComponent(clinicId)}, 'Stranica ordinacije')])
    ]));
    app.appendChild(el('h2', {style:'font-size:20px;margin:0 0 12px;'}, 'Izmene koje se objavljuju odmah'));
    app.appendChild(buildDirect());
    app.appendChild(el('h2', {style:'font-size:20px;margin:28px 0 12px;'}, 'Izmene koje čekaju naše odobrenje'));
    app.appendChild(buildTextChange('name', 'Naziv', curName, 150, 2));
    app.appendChild(buildTextChange('address', 'Adresa', curAddr, 200, 3));
    app.appendChild(buildTeam());
    app.appendChild(buildImages());
    const h = buildHistory(); if(h) app.appendChild(h);
  }

  async function init(){
    if(!clinic){ app.appendChild(el('div', {class:'info-card'}, 'Ordinacija nije pronađena.')); return; }
    if(!sb){ app.appendChild(el('div', {class:'info-card'}, 'Ova funkcija trenutno nije dostupna.')); return; }
    const user = await getOwnerUser();
    if(!user){
      const box = el('div', {class:'info-card'}, [el('h3', {}, 'Prijava'), el('div', {id:'loginBox'})]);
      app.appendChild(box);
      renderLoginForm(box.querySelector('#loginBox'), 'izmena-profila.html?id=' + encodeURIComponent(clinicId), 'Prijavite se linkom iz e-pošte.');
      return;
    }
    const { data, error } = await sb.from('claims').select('id').eq('clinic_id', clinicId).eq('status', 'verified').limit(1);
    if(error || !data || !data.length){
      app.appendChild(el('div', {class:'info-card'}, [
        el('p', {style:'margin:0 0 12px;'}, 'Izmena profila je dostupna tek kad je vaš zahtev za ovu ordinaciju verifikovan.'),
        el('a', {class:'btn btn-primary', href:'moj-nalog.html'}, 'Moj nalog')]));
      return;
    }
    refresh();
  }
  if(sb) sb.auth.onAuthStateChange(evt => { if(evt === 'SIGNED_IN') setTimeout(init, 0); });
  init();
})();
