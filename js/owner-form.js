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
  const FIELD_LABEL = {name:'Naziv', address:'Adresa', team:'Tim', images:'Slike', logo:'Logo', cover:'Naslovna slika'};
  const STATUS_LABEL = {pending:['Čeka odobrenje','chip-pending'], approved:['Odobreno','chip-open'], rejected:['Odbijeno','chip-closed']};
  const IMG_TYPES = {'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'};

  const ERRORS = {
    image_limit:'Najviše 8 slika po ordinaciji (računaju se i one koje čekaju odobrenje).',
    change_limit_24h:'Poslali ste previše izmena u poslednja 24 sata. Pokušajte kasnije.',
    clinic_images_one_pending_logo:'Logo već čeka odobrenje. Uklonite ga ili sačekajte odluku.',
    clinic_images_one_pending_cover:'Naslovna slika već čeka odobrenje. Uklonite je ili sačekajte odluku.',
    not_owner:'Nemate pravo na ovu ordinaciju.'
  };
  function errorText(error){
    const m = (error && error.message) || '';
    for(const k in ERRORS) if(m.indexOf(k) >= 0) return ERRORS[k];
    if(/profile_price_list_valid/.test(m)) return 'Cenovnik nije sačuvan: svaki naziv sme imati najviše 80 znakova i ne sme sadržati web adresu, e-adresu ni broj telefona, a cena mora biti ceo broj od 0 do 10.000.000 (ili prazno za „na upit“). Najviše 100 stavki.';
    if(/profile_custom_services_valid/.test(m)) return 'Druge usluge nisu sačuvane: najviše 10 usluga, svaka do 60 znakova, bez web adresa, e-adresa i brojeva telefona.';
    if(/cannot cast|invalid input syntax|jsonb/i.test(m)) return 'Cena mora biti ceo broj od 0 do 10.000.000 (ili ostavite prazno za „na upit“).';
    if(/check constraint|violates/i.test(m)) return 'Neka vrednost je predugačka ili nije u ispravnom obliku.';
    return 'Čuvanje nije uspelo. Pokušajte ponovo kasnije.';
  }
  function fmtDate(d){ return new Date(d).toLocaleDateString('sr-Latn-RS', {day:'numeric', month:'long', year:'numeric'}).replace(/\.$/, ''); }
  function showMsg(node, text, ok){ node.textContent = text; node.style.color = ok ? 'var(--open)' : 'var(--closed)'; }
  function card(title, kids){ return el('div', {class:'info-card'}, [el('h3', {}, title)].concat(kids)); }
  function field(label, input, hint){
    return el('div', {class:'form-field'}, [el('label', {}, label), input].concat(hint ? [el('span', {class:'hint'}, hint)] : []));
  }

  // ---- validacija (ista pravila kao CHECK u bazi) ----
  const URL_RE = /^https?:\/\/[^\s]+$/;
  function validUrl(u){ return u.length <= 300 && URL_RE.test(u) && !!safeUrl(u); }
  const PHONE_RE = /^[0-9+()\/ -]{6,20}$/;

  // tip slike po prvim bajtovima (ne veruje se nazivu ni tipu koji javi pregledač)
  function imageKind(bytes){
    if(bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
    if(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
    if(bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
    return null;
  }

  // ---- cenovnik: ista pravila kao u bazi (migracija 30) ----
  const PRICE_CATS = (typeof PF !== 'undefined' && PF.PRICE_CATEGORIES) ? PF.PRICE_CATEGORIES : ['Opšta stomatologija','Dečja stomatologija','Ortodoncija','Protetika','Hirurgija','Implantologija','Parodontologija','Endodoncija','Estetska stomatologija','Preventiva i higijena','Ostalo'];
  const MAX_PRICE_ITEMS = 100, MAX_CUSTOM = 10;
  const CONTACT_RE = /https?:|www\.|\.(com|rs|net|org|info|biz|eu|co|me|io|app|shop|online|site)(\b|\/)/i;
  function cleanText(t){ return !CONTACT_RE.test(t) && t.indexOf('@') < 0 && t.replace(/\D/g, '').length < 6; }
  // "3.000", "3000", "3 000 din", "3.000,00" -> 3000; prazno -> null (na upit); sve ostalo je neispravno
  function parsePrice(raw){
    let t = String(raw == null ? '' : raw).trim().toLowerCase().replace(/ /g, ' ');
    t = t.replace(/(rsd|dinara|dinar|din\.?)\s*$/, '').trim();
    if(t === '') return {ok:true, value:null};
    t = t.replace(/\s+/g, '');
    let m = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(t) || /^(\d{1,3}(?:,\d{3})+)(?:\.(\d{1,2}))?$/.exec(t);
    if(!m || (m[2] && /[1-9]/.test(m[2]))) return {ok:false};
    const n = parseInt(m[1].replace(/[.,]/g, ''), 10);
    if(!Number.isFinite(n) || n < 0 || n > 10000000) return {ok:false};
    return {ok:true, value:n};
  }
  // proverava jednu stavku; vraća {ok, item} ili {ok:false, reason}
  function checkItem(kat, naziv, cenaText, od){
    const name = String(naziv || '').replace(/\s+/g, ' ').trim();
    if(PRICE_CATS.indexOf(kat) < 0) return {ok:false, reason:'Izaberite kategoriju.'};
    if(!name) return {ok:false, reason:'Naziv ne sme biti prazan.'};
    if(name.length > 80) return {ok:false, reason:'Naziv ima više od 80 znakova.'};
    if(!cleanText(name)) return {ok:false, reason:'Naziv ne sme sadržati web adresu, e-adresu ni broj telefona.'};
    const pr = parsePrice(cenaText);
    if(!pr.ok) return {ok:false, reason:'Cena mora biti ceo broj od 0 do 10.000.000 (ili prazno za „na upit“).'};
    return {ok:true, item:{kategorija:kat, naziv:name, cena:pr.value, od: !!od && pr.value !== null}};
  }
  // jedan nalepljen red -> {naziv, cenaText, od} (bez cene: cenaText ''), ili null za prazan red.
  // Razdvajač naziva i cene: tab, " – ", " — ", " - ", ";", ":" ili zarez. Bez razdvajača cena se prepoznaje samo uz
  // oznaku valute (din/rsd) ili sa 3+ cifre, da "Konsultacija 15" ne postane cena 15.
  const PRICE_PAT = '(od\\s+)?(\\d{1,3}(?:[. ]\\d{3})+(?:,\\d{1,2})?|\\d+(?:,\\d{1,2})?)\\s*(din\\.?|dinara|rsd)?';
  const RE_TAB = new RegExp('^(.*)\\t\\s*' + PRICE_PAT + '\\s*$', 'i');
  const RE_SEP = new RegExp('^(.+?)(?:\\s+[–—-]\\s+|\\s*[;:]\\s*|\\s*,\\s+)' + PRICE_PAT + '\\s*$', 'i');
  const RE_SEP_GREEDY = new RegExp('^(.+)(?:\\s+[–—-]\\s+|\\s*[;:]\\s*|\\s*,\\s+)' + PRICE_PAT + '\\s*$', 'i');
  const RE_PLAIN = new RegExp('^(.+?)\\s+' + PRICE_PAT + '\\s*$', 'i');
  function trimName(n){ return n.replace(/[\s\t–—:;,-]+$/, '').replace(/^[\s\t]+/, '').replace(/\s+/g, ' '); }
  function parsePasteLine(line){
    const t = line.replace(/ /g, ' ').replace(/\r/g, '');
    if(!t.trim()) return null;
    let m = RE_TAB.exec(t) || RE_SEP_GREEDY.exec(t);
    if(m && trimName(m[1])) return {naziv: trimName(m[1]), cenaText: m[3], od: !!m[2]};
    m = RE_PLAIN.exec(t.trim());
    if(m && (m[4] || m[2] || m[3].replace(/\D/g, '').length >= 3) && trimName(m[1])) return {naziv: trimName(m[1]), cenaText: m[3], od: !!m[2]};
    return {naziv: trimName(t), cenaText: '', od: false};
  }

  let hashDone = false;
  let state = {profile:null, changes:[], images:[], logos:[], covers:[], urls:{}, profileState:'active'};

  async function loadAll(){
    let imgQuery = sb.from('clinic_images').select('id, storage_path, status, created_at, kind').eq('clinic_id', clinicId).order('created_at', {ascending:true});
    const [p, ch, im0, st] = await Promise.all([
      sb.from('profile_overrides').select('clinic_id, phones, hours, services, description, website, socials, name, address, team_public, updated_at, price_list, custom_services, price_list_updated_at').eq('clinic_id', clinicId).maybeSingle(),
      sb.from('pending_changes').select('id, field, new_value, status, created_at, reviewed_at, review_note').eq('clinic_id', clinicId).order('created_at', {ascending:false}).limit(40),
      imgQuery,
      (typeof PF !== 'undefined' && PF.claimState) ? PF.claimState(clinicId) : Promise.resolve('active')
    ]);
    let im = im0;
    if(im.error){   // pre migracije 70 kolona kind ne postoji: sve su fotografije
      im = await sb.from('clinic_images').select('id, storage_path, status, created_at').eq('clinic_id', clinicId).order('created_at', {ascending:true});
    }
    if(p.error || ch.error || im.error) throw new Error('load');
    state.profile = p.data; state.changes = ch.data || [];
    const all = im.data || [];
    state.images = all.filter(i => i.kind !== 'logo' && i.kind !== 'cover');
    state.logos = all.filter(i => i.kind === 'logo');
    state.covers = all.filter(i => i.kind === 'cover');
    state.profileState = st;   // 'active' | 'expired' | 'none'
    state.urls = {};
    const paths = state.images.filter(i => i.status !== 'rejected').map(i => i.storage_path)
      .concat(state.logos.concat(state.covers).filter(i => i.status === 'pending' || i.status === 'approved').map(i => i.storage_path));
    if(paths.length){
      const { data } = await sb.storage.from(BUCKET).createSignedUrls(paths, 3600);
      (data || []).forEach(d => { if(d && d.signedUrl) state.urls[d.path] = d.signedUrl; });
    }
  }

  function pendingOf(fieldName){ return state.changes.find(c => c.field === fieldName && c.status === 'pending'); }

  // jedan put upisa u profile_overrides (bez upsert-a: on conflict bi menjao i clinic_id, na koji klijent nema UPDATE pravo)
  async function writeProfile(payload){
    let error;
    if(state.profile){
      ({ error } = await sb.from('profile_overrides').update(payload).eq('clinic_id', clinicId));
    } else {
      ({ error } = await sb.from('profile_overrides').insert(Object.assign({clinic_id: clinicId}, payload)));
      if(error && /duplicate key/i.test(error.message || '')) ({ error } = await sb.from('profile_overrides').update(payload).eq('clinic_id', clinicId));
    }
    if(!error) state.profile = Object.assign({}, state.profile || {clinic_id: clinicId}, payload);
    return error;
  }

  /* ---------------------------------------------------- direktne izmene */
  function buildDirect(){
    const prof = state.profile || {};
    const msg = el('p', {role:'status', class:'of-msg'});

    // telefoni
    const phoneBox = el('div', {});
    const initPhones = (prof.phones && prof.phones.length) ? prof.phones : (isValidPhone(clinic.phone) ? [clinic.phone] : ['']);
    const addPhoneBtn = el('button', {type:'button', class:'btn btn-outline-navy btn-sm'}, 'Dodaj telefon');
    function addPhone(v){
      const input = el('input', {type:'tel', maxlength:'20', placeholder:'+381 11 123 4567'});
      input.value = v || '';
      const rm = el('button', {type:'button', class:'btn btn-outline-navy btn-sm', 'aria-label':'Ukloni telefon'}, '×');
      const row = el('div', {class:'of-row'}, [input, rm]);
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
    const svcWrap = el('div', {class:'of-svc-list'}, SERVICE_CATALOG.map(cat => {
      const catCb = el('input', {type:'checkbox'}); catCb.value = cat.key; catCb.checked = chosen.has(cat.key);
      svcBoxes.push(catCb);
      const subs = cat.subservices.map(s => {
        const cb = el('input', {type:'checkbox'}); cb.value = s.key; cb.checked = chosen.has(s.key); svcBoxes.push(cb);
        return el('label', {class:'of-check'}, [cb, el('span', {}, s.name)]);
      });
      return el('div', {class:'of-svc'}, [
        el('label', {class:'of-check of-check-cat'}, [catCb, el('span', {}, cat.name)]),
        el('div', {class:'of-svc-subs'}, subs)
      ]);
    }));

    // druge usluge (do 10, do 60 znakova; prikazuju se uz ostale usluge, ne ulaze u filtere)
    const customBox = el('div', {});
    const addCustomBtn = el('button', {type:'button', class:'btn btn-outline-navy btn-sm'}, 'Dodaj uslugu');
    function addCustom(v){
      const input = el('input', {type:'text', maxlength:'60', placeholder:'npr. Izbeljivanje zuba', 'aria-label':'Druga usluga'});
      input.value = v || '';
      const rm = el('button', {type:'button', class:'btn btn-outline-navy btn-sm', 'aria-label':'Ukloni uslugu'}, '×');
      const row = el('div', {class:'of-row'}, [input, rm]);
      rm.addEventListener('click', () => { row.remove(); addCustomBtn.disabled = false; });
      customBox.appendChild(row);
      if(customBox.children.length >= MAX_CUSTOM) addCustomBtn.disabled = true;
    }
    (Array.isArray(prof.custom_services) ? prof.custom_services : []).slice(0, MAX_CUSTOM).forEach(addCustom);
    addCustomBtn.addEventListener('click', () => addCustom(''));

    // opis
    const desc = el('textarea', {maxlength:'1000', rows:'5'}); desc.value = prof.description || '';
    const counter = el('span', {class:'of-counter'}, '');
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
    const form = el('form', {novalidate:'', class:'of-form'}, [
      card('Telefoni', [phoneBox, addPhoneBtn, el('p', {class:'of-note'}, 'Do 3 broja.')]),
      card('Radno vreme', [el('div', {class:'of-grid2'}, hoursRows), el('p', {class:'of-note'}, 'Slobodan tekst do 60 znakova po danu. Prazno polje = nije navedeno.')]),
      card('Usluge', [svcWrap, el('h4', {class:'of-h4'}, 'Druge usluge'), customBox, addCustomBtn, el('p', {class:'of-note'}, 'Do 10 usluga, do 60 znakova. Bez web adresa, e-adresa i telefona. Prikazuju se na profilu uz ostale usluge.')]),
      card('Kratak opis', [desc, counter]),
      card('Sajt i društvene mreže', [field('Sajt ordinacije', web, 'Samo adrese koje počinju sa http:// ili https://'), el('div', {class:'of-grid2'}, socRows)]),
      el('div', {class:'of-savebar'}, [saveBtn, msg])
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
      // druge usluge (običan tekst)
      const customServices = [];
      for(const i of Array.from(customBox.querySelectorAll('input'))){
        const v = i.value.replace(/\s+/g, ' ').trim();
        if(!v) continue;
        if(v.length > 60){ showMsg(msg, 'Druga usluga „' + v.slice(0, 20) + '…“ ima više od 60 znakova.', false); return; }
        if(!cleanText(v)){ showMsg(msg, 'Druga usluga „' + v + '“ ne sme sadržati web adresu, e-adresu ni broj telefona.', false); return; }
        customServices.push(v);
      }
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
        socials: Object.keys(socials).length ? socials : null,
        custom_services: customServices
      };
      const error = await writeProfile(payload);
      saveBtn.disabled = false;
      if(error){ showMsg(msg, errorText(error), false); return; }
      showMsg(msg, 'Sačuvano. Izmene su objavljene na profilu.', true);
    });
    return form;
  }

  /* ------------------------------------------------------------ cenovnik */
  function buildPricing(){
    const prof = state.profile || {};
    let items = (Array.isArray(prof.price_list) ? prof.price_list : []).filter(it => it && PRICE_CATS.indexOf(it.kategorija) >= 0)
      .map(it => ({kategorija: it.kategorija, naziv: String(it.naziv || ''), cenaText: (it.cena === null || it.cena === undefined) ? '' : String(it.cena), od: it.od === true}));
    const listBox = el('div', {});
    const counter = el('p', {class:'of-counter'});
    const addMsg = el('p', {role:'alert', class:'of-alert'});
    const msg = el('p', {role:'status', class:'of-msg'});
    const updLine = el('p', {class:'of-note of-upd'});
    function showUpdated(){ updLine.textContent = prof.price_list_updated_at ? 'Cenovnik poslednji put izmenjen: ' + fmtDate(prof.price_list_updated_at) + '.' : ''; }
    showUpdated();

    const catSel = () => el('select', {'aria-label':'Kategorija'}, PRICE_CATS.map(k => el('option', {value:k}, k)));
    const addBtnRef = {btn:null};
    function renderList(){
      listBox.textContent = '';
      PRICE_CATS.forEach(kat => {
        const rows = items.map((it, idx) => ({it, idx})).filter(r => r.it.kategorija === kat);
        if(!rows.length) return;
        listBox.appendChild(el('h4', {class:'of-h4 of-cat'}, kat + ' (' + rows.length + ')'));
        rows.forEach(({it, idx}) => {
          const naziv = el('input', {type:'text', maxlength:'80', 'aria-label':'Naziv usluge', class:'nz'}); naziv.value = it.naziv;
          const cena = el('input', {type:'text', inputmode:'numeric', 'aria-label':'Cena (RSD)', placeholder:'cena (RSD)'}); cena.value = it.cenaText;
          const od = el('input', {type:'checkbox', 'aria-label':'Cena od'}); od.checked = it.od;
          naziv.addEventListener('input', () => { it.naziv = naziv.value; });
          cena.addEventListener('input', () => { it.cenaText = cena.value; });
          od.addEventListener('change', () => { it.od = od.checked; });
          const rm = el('button', {type:'button', class:'btn btn-outline-navy btn-sm', 'aria-label':'Obriši red'}, '×');
          rm.addEventListener('click', () => { items.splice(idx, 1); renderList(); });
          listBox.appendChild(el('div', {class:'of-price-row'}, [naziv, cena, el('label', {class:'of-check of-od'}, [od, el('span', {}, 'od')]), rm]));
        });
      });
      counter.textContent = items.length + ' / ' + MAX_PRICE_ITEMS + ' stavki';
      if(addBtnRef.btn) addBtnRef.btn.disabled = items.length >= MAX_PRICE_ITEMS;
    }

    // dodavanje jednog reda
    const nKat = catSel(), nNaziv = el('input', {type:'text', maxlength:'80', placeholder:'Naziv usluge', 'aria-label':'Naziv nove usluge'});
    const nCena = el('input', {type:'text', inputmode:'numeric', placeholder:'Cena u RSD (prazno = na upit)', 'aria-label':'Cena nove usluge (RSD)'});
    const nOd = el('input', {type:'checkbox', 'aria-label':'Cena od'});
    const addBtn = el('button', {type:'button', class:'btn btn-outline-navy btn-sm'}, 'Dodaj red');
    addBtnRef.btn = addBtn;
    addBtn.addEventListener('click', () => {
      addMsg.textContent = '';
      if(items.length >= MAX_PRICE_ITEMS){ addMsg.textContent = 'Najviše ' + MAX_PRICE_ITEMS + ' stavki.'; return; }
      const r = checkItem(nKat.value, nNaziv.value, nCena.value, nOd.checked);
      if(!r.ok){ addMsg.textContent = r.reason; return; }
      items.push({kategorija: r.item.kategorija, naziv: r.item.naziv, cenaText: r.item.cena === null ? '' : String(r.item.cena), od: r.item.od});
      nNaziv.value = ''; nCena.value = ''; nOd.checked = false; renderList(); nNaziv.focus();
    });
    const addRow = el('div', {class:'of-price-add'}, [el('h4', {class:'of-h4'}, 'Dodaj stavku'), el('div', {class:'of-price-add1'}, [nKat, nNaziv]), el('div', {class:'of-price-add2'}, [nCena, el('label', {class:'of-check of-od'}, [nOd, el('span', {}, 'od')]), addBtn])]);

    // nalepi iz Excela / Worda
    const pasteArea = el('textarea', {rows:'6', placeholder:'Jedan red po stavci, npr.\nEndodontska terapija - 2 kanala — 8.000\nFiksni aparat – obe vilice\t140.000', 'aria-label':'Nalepljen tekst cenovnika'});
    const pasteKat = catSel();
    const previewBox = el('div', {class:'of-preview'});
    const parseBtn = el('button', {type:'button', class:'btn btn-outline-navy btn-sm'}, 'Prepoznaj redove');
    let recognized = [];
    parseBtn.addEventListener('click', () => {
      previewBox.textContent = ''; recognized = [];
      const bad = [];
      pasteArea.value.split(/\n/).forEach((line, n) => {
        const pl = parsePasteLine(line);
        if(!pl) return;
        const r = checkItem(pasteKat.value, pl.naziv, pl.cenaText, pl.od);
        if(r.ok) recognized.push(r.item); else bad.push({line: line.trim(), reason: r.reason});
      });
      if(!recognized.length && !bad.length){ previewBox.appendChild(el('p', {style:'font-size:14px;'}, 'Nema redova za prepoznavanje.')); return; }
      if(recognized.length){
        previewBox.appendChild(el('p', {style:'margin:0 0 6px;font-weight:600;font-size:14px;'}, 'Prepoznato (' + recognized.length + ') u kategoriji „' + pasteKat.value + '“:'));
        previewBox.appendChild(el('table', {class:'price-table'}, [el('tbody', {}, recognized.map(it => el('tr', {}, [el('td', {class:'pn'}, it.naziv), el('td', {class:'pp'}, it.cena === null ? 'Na upit' : (it.od ? 'od ' : '') + it.cena.toLocaleString('sr-RS') + ' RSD')])))]));
        const room = MAX_PRICE_ITEMS - items.length;
        const addAll = el('button', {type:'button', class:'btn btn-primary btn-sm'}, 'Dodaj prepoznate redove');
        if(recognized.length > room){ previewBox.appendChild(el('p', {style:'color:var(--closed);font-size:13.5px;margin:8px 0 0;'}, 'U cenovniku ima mesta još za ' + room + ' stavki; dodaće se prvih ' + Math.max(room, 0) + '.')); }
        addAll.disabled = room <= 0;
        addAll.addEventListener('click', () => {
          recognized.slice(0, Math.max(room, 0)).forEach(it => items.push({kategorija: it.kategorija, naziv: it.naziv, cenaText: it.cena === null ? '' : String(it.cena), od: it.od}));
          pasteArea.value = ''; previewBox.textContent = ''; renderList();
        });
        previewBox.appendChild(addAll);
      }
      if(bad.length){
        previewBox.appendChild(el('p', {style:'margin:12px 0 6px;font-weight:600;font-size:14px;color:var(--closed);'}, 'Neprepoznato (' + bad.length + '), neće biti dodato:'));
        previewBox.appendChild(el('ul', {style:'margin:0;padding-left:18px;font-size:13.5px;'}, bad.map(b => el('li', {}, [el('span', {}, b.line.slice(0, 120)), el('span', {style:'color:var(--muted);'}, ' — ' + b.reason)]))));
      }
    });

    // čuvanje
    const saveBtn = el('button', {type:'button', class:'btn btn-primary'}, 'Sačuvaj cenovnik');
    saveBtn.addEventListener('click', async () => {
      const out = [];
      for(let i = 0; i < items.length; i++){
        const it = items[i];
        const r = checkItem(it.kategorija, it.naziv, it.cenaText, it.od);
        if(!r.ok){ showMsg(msg, 'Stavka „' + (String(it.naziv).trim().slice(0, 40) || '(bez naziva)') + '“: ' + r.reason, false); return; }
        out.push(r.item);
      }
      saveBtn.disabled = true;
      const error = await writeProfile({price_list: out});
      if(!error){
        const { data } = await sb.from('profile_overrides').select('price_list_updated_at').eq('clinic_id', clinicId).maybeSingle();
        if(data && data.price_list_updated_at) state.profile.price_list_updated_at = data.price_list_updated_at;
        prof.price_list_updated_at = state.profile.price_list_updated_at;
        items = out.map(it => ({kategorija: it.kategorija, naziv: it.naziv, cenaText: it.cena === null ? '' : String(it.cena), od: it.od}));
        renderList(); showUpdated();
      }
      saveBtn.disabled = false;
      if(error){ showMsg(msg, errorText(error), false); return; }
      showMsg(msg, 'Sačuvano. Cenovnik je objavljen na profilu.', true);
    });
    renderList();

    const priceCard = card('Cenovnik (Profil+)', [
      el('p', {class:'of-note'}, 'Cena je ceo broj u dinarima (prazno polje = „na upit“); kvačica „od“ znači „od te cene“. Najviše 100 stavki. Čuva se odmah, bez odobravanja.'),
      listBox, counter, addRow, addMsg,
      el('h4', {class:'of-h4 of-sec'}, 'Nalepi iz Excela ili Worda'),
      el('p', {class:'of-note'}, 'Jedan red po stavci; naziv i cenu razdvojite tabom, „ – “, „ - “ ili zarezom. Cene „3.000“, „3000“ i „3 000 din“ se prepoznaju kao 3000.'),
      pasteArea, el('div', {class:'of-paste-ctl'}, [el('label', {}, 'Kategorija za nalepljene redove:'), pasteKat, parseBtn]), previewBox,
      el('div', {class:'of-savebar of-savebar-inline'}, [saveBtn, msg, updLine])
    ]);
    priceCard.id = 'cenovnik';
    return priceCard;
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
    return p ? el('p', {class:'of-note of-pending'}, 'Na čekanju od ' + fmtDate(p.created_at) + ': ' + summarize(p)) : null;
  }
  function summarize(c){
    if(c.field === 'team') return (c.new_value || []).map(m => m.name + (m.role ? ' (' + m.role + ')' : '')).join(', ');
    if(c.field === 'images') return ((c.new_value && c.new_value.paths) || []).length + ' slika';
    if(c.field === 'logo') return 'novi logo';
    if(c.field === 'cover') return 'nova naslovna slika';
    return String(c.new_value);
  }

  function buildTextChange(fieldName, label, current, max, min){
    const input = el('input', {type:'text', maxlength:String(max)});
    const p = pendingOf(fieldName);
    input.value = p ? String(p.new_value) : current;
    const btn = el('button', {type:'button', class:'btn btn-outline-navy btn-sm'}, 'Pošalji na odobrenje');
    const msg = el('p', {role:'status', class:'of-msg'});
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
      const row = el('div', {class:'team-row of-team-row'}, [n, r, rm]);
      rm.addEventListener('click', () => { row.remove(); addBtn.disabled = false; });
      box.appendChild(row);
      if(box.children.length >= 30) addBtn.disabled = true;
    }
    base.forEach(addRow);
    addBtn.addEventListener('click', () => addRow(null));
    const btn = el('button', {type:'button', class:'btn btn-outline-navy btn-sm'}, 'Pošalji tim na odobrenje');
    const msg = el('p', {role:'status', class:'of-msg'});
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
    const kids = [box, addBtn, el('p', {class:'of-note'}, 'Tim se objavljuje tek posle odobrenja. Do 30 članova.'), el('div', {class:'of-actions'}, [btn]), msg];
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
    const msg = el('p', {role:'status', class:'of-msg'});
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
      el('p', {class:'of-note'}, 'JPEG, PNG ili WebP, do 5 MB. Najviše 8 slika (' + active.length + '/8). Slike se objavljuju tek posle odobrenja.'),
      grid, el('div', {class:'of-actions of-upload'}, [file, btn]), msg
    ]);
  }


  /* ------------------------------------------------- logo i naslovna slika */
  // isti tok za oba (red u clinic_images sa kind, fajl u bucket, zahtev pending_changes sa field = kind; odobrava admin)
  const BRAND = {
    logo: {
      kind:'logo', title:'Logo ordinacije', maxW:512, maxH:512, target:100 * 1024, minW:0, list:'logos',
      note:'PNG, JPG ili WebP, do 5 MB. Slika se smanjuje na najviše 512×512 px. Logo se objavljuje tek posle odobrenja, a do tada se javno vidi prethodno stanje (inicijali ili raniji logo).',
      pick:['Otpremi logo', 'Zameni logo'], remove:'Ukloni logo', confirmRemove:'Ukloniti logo? Sajt će ponovo prikazivati inicijale.',
      sent:'Logo je poslat na odobrenje.', removed:'Logo je uklonjen.', expired:'Logo je deo paketa Profil+. Vaš Profil+ je istekao, pa se logo ne prikazuje javno.',
      keep:'Javno je i dalje vidljiv raniji (odobreni) logo.', none:'Nema logoa', rpc:'owner_remove_logo'
    },
    cover: {
      kind:'cover', title:'Naslovna slika', maxW:1600, maxH:900, target:350 * 1024, minW:800, list:'covers',
      note:'PNG, JPG ili WebP, do 5 MB, najmanje 800 px širine (preporuka 1600×600 px). Važno ostavite u sredini slike: na kartici i u zaglavlju stranice slika se kadrira po sredini. Slika se smanjuje na najviše 1600 px širine. Objavljuje se tek posle odobrenja, a do tada se javno vidi prethodno stanje (opšta ili raniji naslovna slika).',
      pick:['Otpremi naslovnu sliku', 'Zameni naslovnu sliku'], remove:'Ukloni naslovnu sliku', confirmRemove:'Ukloniti naslovnu sliku? Sajt će ponovo prikazivati opštu sliku.',
      sent:'Naslovna slika je poslata na odobrenje.', removed:'Naslovna slika je uklonjena.', expired:'Naslovna slika je deo paketa Profil+. Vaš Profil+ je istekao, pa se naslovna slika ne prikazuje javno.',
      keep:'Javno je i dalje vidljiva ranija (odobrena) naslovna slika.', none:'Nema naslovne slike', rpc:'owner_remove_cover'
    }
  };

  // PNG/JPG/WebP -> najviše maxW×maxH (bez rastezanja), WebP ~85% (ili JPEG ako pregledač ne zna WebP); smanjuje kvalitet dok je veće od cilja
  async function prepareImage(file, cfg){
    if(file.size > MAX_BYTES) throw new Error('Fajl je veći od 5 MB. Izaberite manju sliku.');
    const kind = imageKind(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
    if(!kind || !IMG_TYPES[kind]) throw new Error((cfg.kind === 'logo' ? 'Logo' : 'Naslovna slika') + ' mora biti PNG, JPG ili WebP slika.');
    let bmp;
    try{ bmp = await createImageBitmap(file); }
    catch(e){
      const du = await toDataUrl(file);
      bmp = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Slika se ne može otvoriti. Izaberite drugu.')); im.src = du; });
    }
    const w0 = bmp.width || bmp.naturalWidth, h0 = bmp.height || bmp.naturalHeight;
    if(!w0 || !h0) throw new Error('Slika se ne može otvoriti. Izaberite drugu.');
    if(cfg.minW && w0 < cfg.minW) throw new Error('Slika je premala: najmanje ' + cfg.minW + ' px širine (vaša je ' + w0 + ' px).');
    const k = Math.min(1, cfg.maxW / w0, cfg.maxH / h0);
    const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const toBlob = (type, q) => new Promise(res => cv.toBlob(res, type, q));
    ctx.clearRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0, w, h);
    let blob = null, type = 'image/webp';
    for(const q of [0.85, 0.75, 0.62, 0.5]){
      blob = await toBlob('image/webp', q);
      if(blob && blob.type !== 'image/webp') blob = null;     // pregledač ne zna WebP
      if(!blob) break;
      if(blob.size <= cfg.target) break;
    }
    if(!blob){   // JPEG nema providnost: bela podloga
      type = 'image/jpeg';
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0, w, h);
      for(const q of [0.85, 0.75, 0.62, 0.5]){ blob = await toBlob('image/jpeg', q); if(blob && blob.size <= cfg.target) break; }
    }
    if(!blob || blob.size > MAX_BYTES) throw new Error('Slika se ne može obraditi. Izaberite drugu.');
    return {blob, type, w, h};
  }

  // CSP ove stranice dozvoljava slike sa data:, ne i sa blob:, pa se pregled pravi kao data URL
  function toDataUrl(blob){
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Pregled nije dostupan.')); r.readAsDataURL(blob); });
  }

  // okvir: logo = kvadrat (contain), naslovna = široki okvir (cover, kadrira se po sredini) kao na kartici ili u zaglavlju
  function brandFrame(cfg, url, cls){
    const cover = cfg.kind === 'cover';
    const f = el('div', {class: (cover ? 'cover-frame' : 'logo-frame') + (cls ? ' ' + cls : '')});
    if(url){ const im = el('img', {alt:'Pregled', width: cover ? '300' : (cls === 'sm' ? '44' : '96'), height: cover ? '110' : (cls === 'sm' ? '44' : '96')}); im.src = url; f.appendChild(im); }
    else f.textContent = cfg.none;
    return f;
  }

  function buildBrand(cfg){
    if(state.profileState === 'expired'){
      return card(cfg.title, [
        el('p', {class:'of-note'}, cfg.expired),
        el('a', {class:'btn btn-primary', href:'cenovnik.html'}, 'Pogledajte paket Profil+')
      ]);
    }
    const rows = state[cfg.list];
    const approved = rows.find(l => l.status === 'approved');
    const pending = rows.find(l => l.status === 'pending');
    const lastRej = state.changes.find(c => c.field === cfg.kind && c.status === 'rejected');
    const showRej = !pending && lastRej && (!approved || new Date(lastRej.created_at) > new Date(approved.created_at));
    const shown = pending || approved;
    const msg = el('p', {role:'status', class:'of-msg'});
    if(state.flash && state.flash.kind === cfg.kind){ showMsg(msg, state.flash.text, state.flash.ok); state.flash = null; }
    const file = el('input', {type:'file', accept:'image/png,image/jpeg,image/webp', 'aria-label':'Izaberite sliku: ' + cfg.title, 'data-brand':cfg.kind, tabindex:'-1'});
    const pick = el('button', {type:'button', class:'btn btn-outline-navy btn-sm'}, shown ? cfg.pick[1] : cfg.pick[0]);
    pick.addEventListener('click', () => file.click());
    const previewBox = el('div', {class:'logo-row', hidden:''});
    const actions = el('div', {class:'logo-actions'}, [pick, file]);
    let prepared = null;

    file.addEventListener('change', async () => {
      const f = file.files && file.files[0]; file.value = '';
      if(!f) return;
      showMsg(msg, 'Obrada slike…', true);
      try{ prepared = await prepareImage(f, cfg); }
      catch(e){ prepared = null; previewBox.hidden = true; showMsg(msg, e.message || 'Slika se ne može obraditi.', false); return; }
      let url;
      try{ url = await toDataUrl(prepared.blob); } catch(e){ showMsg(msg, 'Pregled nije dostupan. Pokušajte ponovo.', false); return; }
      previewBox.textContent = '';
      const send = el('button', {type:'button', class:'btn btn-primary btn-sm'}, 'Pošalji na odobrenje');
      const cancel = el('button', {type:'button', class:'btn btn-outline-navy btn-sm'}, 'Otkaži');
      cancel.addEventListener('click', () => { prepared = null; previewBox.hidden = true; showMsg(msg, '', true); });
      send.addEventListener('click', async () => {
        send.disabled = true; cancel.disabled = true; showMsg(msg, 'Slanje…', true);
        const err = await submitBrand(cfg, prepared);
        if(err){ send.disabled = false; cancel.disabled = false; showMsg(msg, err, false); return; }
        state.flash = {text:cfg.sent, ok:true, kind:cfg.kind};
        refresh();
      });
      const metaKids = [
        el('strong', {}, 'Pregled pre slanja'),
        el('span', {class:'hint'}, prepared.w + '×' + prepared.h + ' px, ' + Math.max(1, Math.round(prepared.blob.size / 1024)) + ' KB'),
        el('span', {class:'hint'}, 'Ovako izgleda na kartici:'), brandFrame(cfg, url, cfg.kind === 'logo' ? 'sm' : 'card')
      ];
      if(cfg.kind === 'cover') metaKids.push(el('span', {class:'hint'}, 'Ovako izgleda u zaglavlju stranice:'), brandFrame(cfg, url, 'head'));
      metaKids.push(el('div', {class:'logo-actions'}, [send, cancel]));
      if(cfg.kind === 'logo') previewBox.appendChild(brandFrame(cfg, url));
      previewBox.appendChild(el('div', {class:'logo-meta'}, metaKids));
      previewBox.hidden = false;
      showMsg(msg, '', true);
    });

    const kids = [el('p', {class:'of-note'}, cfg.note)];
    const [lbl, cls] = pending ? STATUS_LABEL.pending : (approved ? STATUS_LABEL.approved : (showRej ? STATUS_LABEL.rejected : [null, null]));
    kids.push(el('div', {class:'logo-row'}, [
      brandFrame(cfg, shown ? state.urls[shown.storage_path] : null, cfg.kind === 'cover' ? 'card' : ''),
      el('div', {class:'logo-meta'}, (lbl ? [el('span', {class:'chip ' + cls}, lbl)] : [])
        .concat(pending && approved ? [el('span', {class:'hint'}, cfg.keep)] : [])
        .concat(showRej && lastRej.review_note ? [el('span', {class:'hint'}, 'Razlog: ' + lastRej.review_note)] : []))
    ]));
    if(shown){
      const rm = el('button', {type:'button', class:'btn btn-outline-navy btn-sm'}, cfg.remove);
      rm.addEventListener('click', async () => {
        if(!window.confirm(cfg.confirmRemove)) return;
        rm.disabled = true;
        const { data, error } = await sb.rpc(cfg.rpc, {p_clinic_id: clinicId});
        if(error){ rm.disabled = false; showMsg(msg, errorText(error), false); return; }
        if(Array.isArray(data) && data.length) await sb.storage.from(BUCKET).remove(data);
        state.flash = {text:cfg.removed, ok:true, kind:cfg.kind};
        refresh();
      });
      actions.appendChild(rm);
    }
    kids.push(actions, previewBox, msg);
    return card(cfg.title, kids);
  }

  // 1) obriši raniju sliku na čekanju, 2) red u clinic_images, 3) fajl u bucket, 4) zahtev za odobrenje; greška = vraća nazad
  async function submitBrand(cfg, prep){
    const pending = state[cfg.list].find(l => l.status === 'pending');
    if(pending){
      await sb.storage.from(BUCKET).remove([pending.storage_path]);
      const d = await sb.from('clinic_images').delete().eq('id', pending.id);
      if(d.error) return errorText(d.error);
    }
    const path = clinicId + '/' + cfg.kind + '-' + crypto.randomUUID() + IMG_TYPES[prep.type];
    const ins = await sb.from('clinic_images').insert({clinic_id: clinicId, storage_path: path, kind: cfg.kind});
    if(ins.error) return errorText(ins.error);
    const up = await sb.storage.from(BUCKET).upload(path, prep.blob, {contentType: prep.type, upsert:false});
    if(up.error){ await sb.from('clinic_images').delete().eq('storage_path', path); return 'Otpremanje slike nije uspelo. Pokušajte ponovo.'; }
    const ch = await sb.from('pending_changes').insert({clinic_id: clinicId, field: cfg.kind, new_value:{path}});
    if(ch.error){
      await sb.storage.from(BUCKET).remove([path]);
      await sb.from('clinic_images').delete().eq('storage_path', path);
      return errorText(ch.error);
    }
    return null;
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
    app.appendChild(el('div', {class:'of-head'}, [
      el('strong', {}, clinic.name),
      el('div', {style:'color:var(--muted);font-size:14px;'}, clinic.address || ''),
      el('div', {style:'margin-top:6px;'}, [el('a', {href:'moj-nalog.html'}, '← Moj nalog'), ' · ', el('a', {href:'ordinacija.html?id=' + encodeURIComponent(clinicId)}, 'Stranica ordinacije')])
    ]));
    app.appendChild(el('h2', {class:'of-h2'}, 'Izmene koje se objavljuju odmah'));
    app.appendChild(buildDirect());
    app.appendChild(buildPricing());
    app.appendChild(el('h2', {class:'of-h2'}, 'Izmene koje čekaju naše odobrenje'));
    app.appendChild(buildTextChange('name', 'Naziv', curName, 150, 2));
    app.appendChild(buildTextChange('address', 'Adresa', curAddr, 200, 3));
    app.appendChild(buildTeam());
    app.appendChild(buildBrand(BRAND.logo));
    app.appendChild(buildBrand(BRAND.cover));
    app.appendChild(buildImages());
    const h = buildHistory(); if(h) app.appendChild(h);
    if(!hashDone && location.hash === '#cenovnik'){ hashDone = true; const pc = document.getElementById('cenovnik'); if(pc) pc.scrollIntoView(); }
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
        el('p', {style:'margin:0 0 12px;'}, 'Izmena profila je dostupna tek kad je vaš zahtev za ovu ordinaciju potvrđen.'),
        el('a', {class:'btn btn-primary', href:'moj-nalog.html'}, 'Moj nalog')]));
      return;
    }
    refresh();
  }
  if(sb) sb.auth.onAuthStateChange(evt => { if(evt === 'SIGNED_IN') setTimeout(init, 0); });
  init();
})();
