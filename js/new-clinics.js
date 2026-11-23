/* Nove ordinacije iz baze (Supabase RPC, samo publishable ključ, bez biblioteke):
   - list_published_new_clinics: objavljene ordinacije, spajaju se sa statičkim podacima (keš 5 min u sessionStorage)
   - get_new_clinic_preview(token): pregled pre objave (ordinacija.html?pregled=<token>)
   - submit_new_clinic: prijava iz forme "Dodajte ordinaciju"
   Sav tekst iz baze se ponovo proverava/čisti na klijentu i prikazuje isključivo preko textContent/esc().
   Zavisi od: supabase-config.js, safe.js, services.js (knownServices), profile-common.js (PF), data.js (NEW_PUBLISHED). */
const NEWC = (function(){
  const CACHE_KEY = 'nz_newc_v1', CACHE_MS = 5 * 60 * 1000, WAIT_MS = 1500;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const COLORS = ['#0EA5A3','#0B857F','#2563EB','#7C3AED','#DB2777','#D97706','#059669','#0891B2'];

  function configured(){ return typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_PUBLISHABLE_KEY !== 'undefined'; }

  // Isto pravilo kao clean_text / clean_free_text u bazi (migracije 30 i 50).
  const URLISH = /https?:|www\.|\.(com|rs|net|org|info|biz|eu|co|me|io|app|shop|online|site)(\b|\/)/i;
  function cleanText(t){ return typeof t === 'string' && !URLISH.test(t) && t.indexOf('@') < 0 && t.replace(/[^0-9]/g, '').length < 6; }
  // Pre provere telefona maskiraju se datumi (12.03.1998, 1998-03-12) i rasponi godina (1998-2005), kao u bazi (migracija 60).
  function cleanFreeText(t){
    if(typeof t !== 'string' || URLISH.test(t) || t.indexOf('@') >= 0) return false;
    const m = t.replace(/\b[0-9]{1,2}[./-][0-9]{1,2}[./-](19|20)[0-9]{2}\.?/g, ' ')
               .replace(/\b(19|20)[0-9]{2}-[0-9]{1,2}-[0-9]{1,2}\b/g, ' ')
               .replace(/\b(19|20)[0-9]{2}\s?[-–—]\s?((19|20)[0-9]{2}|[0-9]{2})\b/g, ' ');
    return !/[0-9][0-9 ./()-]{5,}[0-9]/.test(m);
  }

  const ERR = {
    rate_limit: 'Sa ove e-adrese je već poslato nekoliko zahteva u poslednjih 24 sata. Pokušajte kasnije ili nam pišite na info@nadjizubara.rs.',
    queue_full: 'Trenutno primamo previše zahteva. Pokušajte ponovo kasnije ili nam pišite na info@nadjizubara.rs.',
    invalid_input: 'Neki podatak nije prihvaćen (naziv, adresa i opis ne smeju sadržati linkove, e-adrese ni brojeve telefona). Proverite polja i pokušajte ponovo.',
    try_again: 'Došlo je do greške. Pokušajte ponovo.'
  };

  function rpc(fn, body, signal){
    return fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
      method:'POST', signal,
      headers:{apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type':'application/json', Accept:'application/json'},
      body: JSON.stringify(body || {})
    });
  }

  function str(v, max){ return (typeof v === 'string' && v.trim() && v.length <= max) ? v.trim() : ''; }

  // Red iz baze (javni oblik) -> objekat ordinacije kakav koriste kartice i stranica ordinacije.
  function toClinic(r, preview){
    if(!r || typeof r !== 'object' || typeof r.clinic_id !== 'string' || !/^nova-[a-z0-9-]{1,200}$/.test(r.clinic_id)) return null;
    const name = str(r.naziv, 150), city = str(r.grad, 80), address = str(r.adresa, 200);
    if(!name || !city || !address) return null;
    const phone = (typeof PF !== 'undefined') ? PF.normalizePhone(r.telefon) : '';
    const hours = {};
    let hoursKnown = false;
    if(r.hours && typeof r.hours === 'object' && !Array.isArray(r.hours)){
      ['mon','tue','wed','thu','fri','sat','sun'].forEach(k => { const t = str(r.hours[k], 60); if(t){ hours[k] = t; hoursKnown = true; } });
    }
    const hoursText = hoursKnown ? '' : str(r.hours_text, 200);
    const services = knownServices(Array.isArray(r.services) ? r.services.filter(x => typeof x === 'string') : []);
    const custom = Array.isArray(r.custom_services) ? r.custom_services.filter(x => typeof x === 'string' && x.length <= 60).slice(0, 10) : [];
    const socials = {};
    let socialsN = 0;
    if(r.socials && typeof r.socials === 'object' && !Array.isArray(r.socials)){
      ['facebook','instagram','linkedin','tiktok','youtube'].forEach(k => { const u = (typeof r.socials[k] === 'string') ? safeUrl(r.socials[k]) : ''; if(u){ socials[k] = u; socialsN++; } });
    }
    const words = (name.toLowerCase().match(/[a-zA-Z0-9]+/g) || []);
    const lat = Number(r.lat), lng = Number(r.lng);
    const hasCoords = r.lat != null && r.lng != null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    const c = {
      id: r.clinic_id, name, city, address, phone, phones: phone ? [phone] : [],
      website: (typeof r.website === 'string' ? safeUrl(r.website) : '') || '',
      priceRange:null, rating:0, reviewCount:0, verified:false, featured:false, imported:false, isNew:true, preview: !!preview,
      hoursUnknown: !hoursKnown, hours: hoursKnown ? hours : {mon:null,tue:null,wed:null,thu:null,fri:null,sat:null,sun:null},
      hoursText, hoursFromProfile: hoursKnown,
      services, customServices: custom, socials: socialsN ? socials : null, socialsText: socialsN ? '' : str(r.socials_text, 200),
      short: 'Stomatološka ordinacija u mestu ' + city + '.',
      description: str(r.description, 600),
      images:['cover'], logoInitials: (words.filter(w => w.length > 1).slice(0, 2).map(w => w[0]).join('') || 'o').toUpperCase(),
      logoColor: COLORS[Math.abs(hashCode(r.clinic_id)) % COLORS.length], reviews:[],
      paket: r.paket === 'osnovni' ? 'osnovni' : 'profil-plus', status: r.status
    };
    if(hasCoords){ c.lat = lat; c.lng = lng; c.coordsVerified = true; c.coordsPrecision = 'kuca'; } else { c.coordsVerified = false; }
    return c;
  }

  function readCache(){
    try{
      const o = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if(o && Array.isArray(o.rows) && Date.now() - o.t < CACHE_MS) return o.rows;
    }catch(e){}
    return null;
  }
  function writeCache(rows){ try{ sessionStorage.setItem(CACHE_KEY, JSON.stringify({t: Date.now(), rows})); }catch(e){} }

  // Dodaje objavljene nove ordinacije u NEW_PUBLISHED (data.js). Greška/mreža/tajmaut = ništa se ne dodaje.
  function loadPublished(){
    if(!configured() || typeof NEW_PUBLISHED === 'undefined') return Promise.resolve(false);
    const cached = readCache();
    const rows = cached ? Promise.resolve(cached)
      : PF.withTimeout(signal => rpc('list_published_new_clinics', {}, signal).then(r => { if(!r.ok) throw new Error('http ' + r.status); return r.json(); }), WAIT_MS, null)
          .then(v => { if(Array.isArray(v)){ writeCache(v); return v; } return null; });
    return rows.then(list => {
      if(!list) return false;
      const have = new Set(NEW_PUBLISHED.map(c => c.id));
      list.forEach(r => { const c = toClinic(r, false); if(c && c.status === 'published' && !have.has(c.id)){ NEW_PUBLISHED.push(c); have.add(c.id); } });
      return true;
    }).catch(() => false);
  }

  function isToken(t){ return typeof t === 'string' && UUID_RE.test(t); }

  // Pregled po tokenu: Promise<clinic | null>
  function fetchPreview(token){
    if(!configured() || !isToken(token)) return Promise.resolve(null);
    return PF.withTimeout(signal => rpc('get_new_clinic_preview', {p_token: token}, signal).then(r => { if(!r.ok) throw new Error('http ' + r.status); return r.json(); }), 6000, null)
      .then(row => (row && typeof row === 'object') ? toClinic(row, true) : null);
  }

  // Prijava: Promise<{ok:true, clinic_id, token} | {ok:false, code, message}>
  function submit(payload){
    if(!configured()) return Promise.resolve({ok:false, code:'config', message:'Slanje trenutno nije dostupno.'});
    return rpc('submit_new_clinic', {p: payload}).then(r => r.json().catch(() => null).then(j => {
      if(r.ok && j && isToken(j.preview_token)) return {ok:true, clinic_id: j.clinic_id, token: j.preview_token};
      const code = j && typeof j.message === 'string' ? j.message : '';
      return {ok:false, code, message: ERR[code] || 'Slanje nije uspelo. Pokušajte ponovo.', network: false};
    })).catch(() => ({ok:false, code:'network', message:'Nema veze sa serverom.', network:true}));
  }

  function previewUrl(token){ return new URL('ordinacija.html?pregled=' + token, location.href).href; }

  return {configured, cleanText, cleanFreeText, loadPublished, fetchPreview, submit, isToken, previewUrl, toClinic};
})();
