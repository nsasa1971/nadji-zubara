/* Javni profili ordinacija (Supabase, samo čitanje, publishable ključ).
   Deli ga profile-overrides.js (dinamičke stranice) i seo-overlay.js (statične SEO stranice).
   Podaci stižu običnim fetch-om ka PostgREST adresi (bez Supabase biblioteke) i ponovo se
   proveravaju/čiste na klijentu, bez obzira na CHECK ograničenja u bazi.
   Zavisi od: supabase-config.js, safe.js (safeUrl). */
const PF = (function(){
  const HOURS_KEYS = ['mon','tue','wed','thu','fri','sat','sun'];
  const SOCIAL_KEYS = ['facebook','instagram','linkedin','tiktok','youtube'];
  const PROFILE_COLS = 'clinic_id,phones,hours,services,description,website,socials,name,address,team_public,updated_at,price_list,custom_services,price_list_updated_at';
  // fiksna lista kategorija cenovnika (ista kao u bazi i u formi vlasnika)
  const PRICE_CATEGORIES = ['Opšta stomatologija','Dečja stomatologija','Ortodoncija','Protetika','Hirurgija','Implantologija','Parodontologija','Endodoncija','Estetska stomatologija','Preventiva i higijena','Ostalo'];
  const SIGN_TTL_S = 3600;

  function configured(){ return typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_PUBLISHABLE_KEY !== 'undefined'; }

  function text(s, min, max){
    if(typeof s !== 'string') return '';
    const t = s.trim();
    return (t.length >= min && t.length <= max) ? t : '';
  }

  // Telefon u obliku +381 XX XXXXXXX (8–10 cifara posle pozivnog broja); inače ''.
  function normalizePhone(p){
    if(typeof p !== 'string' || p.length > 30) return '';
    let d = p.replace(/[^0-9+]/g, '');
    if(d.startsWith('00381')) d = '+' + d.slice(2);
    else if(d.startsWith('381')) d = '+' + d;
    else if(d.startsWith('0')) d = '+381' + d.slice(1);
    if(!/^\+381[0-9]{8,10}$/.test(d)) return '';
    const rest = d.slice(4);
    return '+381 ' + rest.slice(0, 2) + ' ' + rest.slice(2);
  }

  // Čisti jedan red iz profile_overrides; vraća samo ispravna polja.
  function cleanProfile(r){
    if(!r || typeof r !== 'object' || typeof r.clinic_id !== 'string') return null;
    const o = {id: r.clinic_id};
    const name = text(r.name, 2, 150); if(name) o.name = name;
    const address = text(r.address, 3, 200); if(address) o.address = address;
    if(Array.isArray(r.phones)){
      const ph = []; r.phones.slice(0, 3).forEach(p => { const n = normalizePhone(p); if(n && ph.indexOf(n) < 0) ph.push(n); });
      if(ph.length) o.phones = ph;
    }
    if(r.hours && typeof r.hours === 'object' && !Array.isArray(r.hours)){
      const h = {}; let n = 0;
      HOURS_KEYS.forEach(k => { const t = text(r.hours[k], 1, 60); if(t){ h[k] = t; n++; } });
      if(n) o.hours = h;
    }
    if(Array.isArray(r.services)){
      const s = r.services.filter(x => typeof x === 'string' && x.length <= 80).slice(0, 40);
      if(s.length) o.services = s;
    }
    const description = text(r.description, 1, 1000); if(description) o.description = description;
    if(typeof r.website === 'string' && r.website.length <= 300){ const u = safeUrl(r.website); if(u) o.website = u; }
    if(r.socials && typeof r.socials === 'object' && !Array.isArray(r.socials)){
      const so = {}; let n = 0;
      SOCIAL_KEYS.forEach(k => { if(typeof r.socials[k] === 'string' && r.socials[k].length <= 300){ const u = safeUrl(r.socials[k]); if(u){ so[k] = u; n++; } } });
      if(n) o.socials = so;
    }
    if(Array.isArray(r.team_public)){
      const t = [];
      r.team_public.slice(0, 30).forEach(m => {
        if(!m || typeof m !== 'object') return;
        const nm = text(m.name, 1, 100); if(!nm) return;
        const role = text(m.role, 1, 100);
        t.push(role ? {name: nm, role} : {name: nm});
      });
      if(t.length) o.team = t;
    }
    // cenovnik: do 100 stavki {kategorija, naziv, cena (ceo broj ili null), od}; neispravne stavke se odbacuju
    if(Array.isArray(r.price_list)){
      const pl = [];
      r.price_list.slice(0, 100).forEach(it => {
        if(!it || typeof it !== 'object') return;
        const kat = PRICE_CATEGORIES.indexOf(it.kategorija) >= 0 ? it.kategorija : '';
        const naziv = text(it.naziv, 1, 80);
        if(!kat || !naziv) return;
        let cena = null;
        if(it.cena !== null && it.cena !== undefined){
          if(typeof it.cena !== 'number' || !Number.isInteger(it.cena) || it.cena < 0 || it.cena > 10000000) return;
          cena = it.cena;
        }
        pl.push({kategorija: kat, naziv, cena, od: it.od === true});
      });
      if(pl.length){
        o.priceList = pl;
        const d = r.price_list_updated_at ? new Date(r.price_list_updated_at) : null;
        if(d && !isNaN(d.getTime())) o.priceListUpdated = d.toISOString();
      }
    }
    if(Array.isArray(r.custom_services)){
      const cs = r.custom_services.filter(x => typeof x === 'string').map(x => x.trim()).filter(x => x.length >= 1 && x.length <= 60).slice(0, 10);
      if(cs.length) o.customServices = cs;
    }
    return o;
  }

  function get(path, signal){
    return fetch(SUPABASE_URL + path, {headers:{apikey: SUPABASE_PUBLISHABLE_KEY, Accept:'application/json'}, signal})
      .then(r => { if(!r.ok) throw new Error('http ' + r.status); return r.json(); });
  }

  // Sve objavljene profile (RLS vraća samo status = 'published'). {clinic_id: očišćen profil}
  function fetchProfiles(signal){
    return get('/rest/v1/profile_overrides?select=' + PROFILE_COLS + '&limit=1000', signal).then(rows => {
      const map = {};
      (Array.isArray(rows) ? rows : []).forEach(r => { const p = cleanProfile(r); if(p) map[p.id] = p; });
      return map;
    });
  }

  // Odobrene fotografije: {clinic_id: [putanje po redosledu]} (logo se ne računa; kind kolona postoji posle migracije 70)
  function fetchImages(signal){
    const base = '/rest/v1/clinic_images?select=clinic_id,storage_path&status=eq.approved&order=position.asc,created_at.asc&limit=1000';
    return get(base + '&kind=eq.photo', signal).catch(() => get(base, signal)).then(rows => {
      const map = {};
      (Array.isArray(rows) ? rows : []).forEach(r => {
        if(typeof r.clinic_id === 'string' && typeof r.storage_path === 'string' &&
           /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.(jpe?g|png|webp)$/.test(r.storage_path)){
          (map[r.clinic_id] = map[r.clinic_id] || []).push(r.storage_path);
        }
      });
      return map;
    });
  }

  // Odobreni logoi: {clinic_id: putanja}. RLS vraća samo aktivne profile. Bez kolone kind (pre migracije 70) = nema logoa.
  function fetchLogos(signal){
    return get('/rest/v1/clinic_images?select=clinic_id,storage_path&kind=eq.logo&status=eq.approved&limit=2000', signal).then(rows => {
      const map = {};
      (Array.isArray(rows) ? rows : []).forEach(r => {
        if(typeof r.clinic_id === 'string' && typeof r.storage_path === 'string' &&
           /^[A-Za-z0-9._-]+\/logo-[A-Za-z0-9._-]+\.(jpe?g|png|webp)$/.test(r.storage_path)) map[r.clinic_id] = r.storage_path;
      });
      return map;
    }).catch(() => ({}));
  }

  // Potpisani URL-ovi (privatan bucket); keš u memoriji dok ne isteknu.
  const urlCache = {};
  function signUrls(paths){
    const now = Date.now();
    const need = Array.from(new Set(paths)).filter(p => !(urlCache[p] && urlCache[p].exp > now));
    const done = () => { const o = {}; paths.forEach(p => { if(urlCache[p]) o[p] = urlCache[p].url; }); return o; };
    if(!need.length || !configured()) return Promise.resolve(done());
    return fetch(SUPABASE_URL + '/storage/v1/object/sign/clinic-images', {
      method:'POST', headers:{apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type':'application/json'},
      body: JSON.stringify({expiresIn: SIGN_TTL_S, paths: need})
    }).then(r => r.ok ? r.json() : []).then(rows => {
      (Array.isArray(rows) ? rows : []).forEach(x => {
        if(x && x.path && x.signedURL && !x.error && typeof x.signedURL === 'string' && x.signedURL.startsWith('/object/sign/')){
          urlCache[x.path] = {url: SUPABASE_URL + '/storage/v1' + x.signedURL, exp: now + (SIGN_TTL_S - 300) * 1000};
        }
      });
      return done();
    }).catch(() => done());
  }

  // Zahtev sa vremenskim ograničenjem; ako ne uspe u roku, vraća fallback (stranica radi i bez profila).
  function withTimeout(factory, ms, fallback){
    const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), ms) : null;
    return factory(ctl ? ctl.signal : undefined).then(v => { clearTimeout(timer); return v; }, () => { clearTimeout(timer); return fallback; });
  }

  // Stanje potvrde profila: 'none' | 'active' | 'expired' (RPC clinic_claim_state; vraća samo jednu od te tri reči).
  // Mreža/greška/neočekivan odgovor = 'none' (stranica radi kao za nepotvrđen profil, bez greške).
  function claimState(clinicId){
    if(!configured() || typeof clinicId !== 'string' || !clinicId) return Promise.resolve('none');
    return withTimeout(signal => fetch(SUPABASE_URL + '/rest/v1/rpc/clinic_claim_state', {
      method:'POST', signal,
      headers:{apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type':'application/json', Accept:'application/json'},
      body: JSON.stringify({p_clinic_id: clinicId})
    }).then(r => { if(!r.ok) throw new Error('http ' + r.status); return r.json(); }), 3000, 'none')
      .then(v => (v === 'active' || v === 'expired') ? v : 'none');
  }

  // Da li je prijavljeni posetilac verifikovan vlasnik ordinacije? Bez Supabase biblioteke: čita se sesija
  // iz localStorage (ista koju pravi prijava vlasnika) i jedan upit ka claims (RLS vraća samo posetiočeve
  // redove). Istekla/nepostojeća sesija = false (dugme "Izmeni profil" se tada ne prikazuje).
  function myVerifiedClaim(clinicId){
    try{
      if(!configured()) return Promise.resolve(false);
      const ref = new URL(SUPABASE_URL).hostname.split('.')[0];
      const raw = localStorage.getItem('sb-' + ref + '-auth-token');
      const s = raw ? JSON.parse(raw) : null;
      if(!s || typeof s.access_token !== 'string' || !(s.expires_at > Date.now() / 1000)) return Promise.resolve(false);
      return fetch(SUPABASE_URL + '/rest/v1/claims?select=id&status=eq.verified&clinic_id=eq.' + encodeURIComponent(clinicId) + '&limit=1',
        {headers:{apikey: SUPABASE_PUBLISHABLE_KEY, Authorization:'Bearer ' + s.access_token, Accept:'application/json'}})
        .then(r => r.ok ? r.json() : []).then(rows => Array.isArray(rows) && rows.length > 0).catch(() => false);
    } catch(e){ return Promise.resolve(false); }
  }

  return {PRICE_CATEGORIES, configured, claimState, myVerifiedClaim, normalizePhone, cleanProfile, fetchProfiles, fetchImages, fetchLogos, signUrls, withTimeout, HOURS_KEYS, SOCIAL_KEYS};
})();
