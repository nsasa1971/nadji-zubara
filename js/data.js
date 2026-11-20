/* =========================================================
   Nađi Zubara — demo podaci o ordinacijama
   (Zameniti stvarnim podacima kada budu dostupni.)
   ========================================================= */

// Katalog usluga (SERVICES, serviceName, serviceIcon, clinicHasService...) je u js/services.js,
// koji se učitava pre ovog fajla.

const CITIES = [
  { name:'Beograd', count:0, img:'img/city-beograd.webp' },
  { name:'Novi Sad', count:0, img:'img/city-novi-sad.webp' },
  { name:'Niš', count:0, img:'img/city-nis.webp' },
  { name:'Kragujevac', count:0, img:'img/city-kragujevac.webp' },
  { name:'Subotica', count:0, img:'img/city-subotica.webp' },
  { name:'Zrenjanin', count:0, img:'img/city-zrenjanin.webp' },
  { name:'Pančevo', count:0, img:'img/city-pancevo.webp' },
  { name:'Čačak', count:0, img:'img/city-cacak.webp' },
  { name:'Kraljevo', count:0, img:'img/city-kraljevo.webp' },
  { name:'Leskovac', count:0, img:'img/city-leskovac.webp' }
];

const AVATAR_COLORS = ['#0EA5A3','#0B857F','#2563EB','#7C3AED','#DB2777','#D97706','#059669','#0891B2'];

// Demo ordinacije su uklonjene. Pravi podaci dolaze iz js/imported-clinics.js (IMPORTED_CLINICS).
const CLINICS = [];

// Izračunavanje broja ordinacija po gradu
// Broj ordinacija po gradu računa se iz uvezenih ordinacija (lazy getter, jer se
// js/imported-clinics.js učitava posle data.js).
CITIES.forEach(c => {
  Object.defineProperty(c, 'count', {
    enumerable: true,
    get(){ return getImportedClinics().filter(cl => cl.city === c.name).length; }
  });
});

// Približne geografske koordinate centra svakog grada (za mapu i pretragu po blizini)
const CITY_CENTERS = {
  'Beograd': {lat:44.7866, lng:20.4489},
  'Novi Sad': {lat:45.2671, lng:19.8335},
  'Niš': {lat:43.3209, lng:21.8958},
  'Kragujevac': {lat:44.0128, lng:20.9114},
  'Subotica': {lat:46.1008, lng:19.6650}
};

// Dodeljivanje koordinata jednoj ordinaciji u okviru grada — deterministički
// na osnovu rednog broja, tako da svaka ordinacija dobije svoju tačku na mapi.
function assignCoordsForCity(city, n){
  const center = CITY_CENTERS[city] || CITY_CENTERS['Beograd'];
  const angle = (n * 137.508) * (Math.PI / 180);
  const radius = 0.008 + (n % 5) * 0.0055;
  return {
    lat: center.lat + radius * Math.cos(angle),
    lng: center.lng + (radius * Math.sin(angle)) / Math.cos(center.lat * Math.PI / 180)
  };
}

// Dodeljivanje koordinata svim ordinacijama iz glavnog imenika.
(function assignClinicCoordinates(){
  const cityCounters = {};
  CLINICS.forEach(c => {
    cityCounters[c.city] = (cityCounters[c.city] || 0) + 1;
    Object.assign(c, assignCoordsForCity(c.city, cityCounters[c.city]));
  });
})();

// Telefon se prikazuje samo ako je +381 sa 8 do 10 cifara posle pozivnog broja (isto pravilo kao
// u tools/build_pages.py za statične stranice).
function isValidPhone(phone){
  if(!phone || !phone.startsWith('+381')) return false;
  const digits = phone.replace(/\D/g, '').slice(3);
  return digits.length >= 8 && digits.length <= 10;
}

// Koordinata je "proverena" samo ako je eksplicitno označena (coordsVerified === true).
// Koordinate uvezenih ordinacija su generisane oko centra grada i NISU prave, pa se za njih
// ne prikazuju markeri na mapi ni udaljenost, i ne učestvuju u "Blizu mene".
function hasVerifiedCoords(c){
  return !!c && c.coordsVerified === true && Number.isFinite(c.lat) && Number.isFinite(c.lng);
}
function anyVerifiedCoords(){
  return getAllPublicListings().some(hasVerifiedCoords);
}

// Haversine formula — udaljenost u kilometrima između dve geografske tačke
function distanceKm(lat1, lng1, lat2, lng2){
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Zajednička naslovna fotografija za sve ordinacije (dok vlasnici ne dodaju
// sopstvene fotografije). Parametar seed se čuva radi kompatibilnosti poziva.
function clinicImageUrl(seed, w=800, h=600){
  return 'img/ordinacija-cover.webp';
}

/* Recenzije koje posetioci ostavljaju preko sajta (van seed podataka) —
   deljene funkcije, dostupne na svim stranicama (ne samo ordinacija.html). */
function extraReviewsKey(id){ return 'nz_reviews_' + id; }
function getExtraReviews(id){
  try{ return JSON.parse(localStorage.getItem(extraReviewsKey(id)) || '[]'); }
  catch(e){ return []; }
}
function setExtraReviews(id, list){
  localStorage.setItem(extraReviewsKey(id), JSON.stringify(list));
}
function saveExtraReview(id, review){
  const list = getExtraReviews(id);
  list.unshift(review);
  setExtraReviews(id, list);
}
function updateExtraReview(clinicId, reviewId, fields){
  const list = getExtraReviews(clinicId);
  const item = list.find(r => r.id === reviewId);
  if(item) Object.assign(item, fields);
  setExtraReviews(clinicId, list);
}
function deleteExtraReview(clinicId, reviewId){
  const list = getExtraReviews(clinicId).filter(r => r.id !== reviewId);
  setExtraReviews(clinicId, list);
}

/* =========================================================
   Oglasi koje su dodali vlasnici ordinacija (js/auth.js, "Moji
   oglasi") se čuvaju odvojeno od glavnog imenika, ali se ovde
   pretvaraju u isti oblik da bi se stvarno pojavili u pretrazi,
   na mapi i na sopstvenoj strani — sve unutar istog pretraživača.
   ========================================================= */
function normalizeMyListing(l){
  const extra = (typeof getExtraReviews === 'function') ? getExtraReviews(l.id) : [];
  return {
    id: l.id,
    name: l.name,
    city: l.city,
    address: l.address || (l.city ? `${l.city}` : ''),
    phone: l.phone || '',
    website: l.website || '#',
    priceRange: l.priceRange || 2,
    rating: extra.length ? (extra.reduce((a,r)=>a+r.rating,0)/extra.length) : 0,
    reviewCount: extra.length,
    verified: false,
    ownerListing: true,
    plan: l.plan || 'besplatno',
    featured: l.plan === 'premium',
    services: knownServices(l.services),
    short: l.description ? (l.description.length > 90 ? l.description.slice(0,90)+'…' : l.description) : 'Novododata ordinacija.',
    description: l.description || 'Vlasnik ove ordinacije još nije dodao detaljan opis.',
    hours: l.hours || {mon:'08:00-20:00',tue:'08:00-20:00',wed:'08:00-20:00',thu:'08:00-20:00',fri:'08:00-20:00',sat:'09:00-14:00',sun:null},
    images: [`my-listing-${l.id}-1`, `my-listing-${l.id}-2`, `my-listing-${l.id}-3`],
    logoInitials: l.logoImage ? '' : (l.name||'O').charAt(0).toUpperCase(),
    logoColor: l.logoColor || '#0EA5A3',
    logoImage: l.logoImage || null,
    reviews: [],
    coordsVerified: false, // koordinate ispod su procenjene oko centra grada
    ...assignCoordsForCity(l.city, (Math.abs(hashCode(l.id)) % 5) + 1)
  };
}

// Normalizacija za pretragu: mala slova, bez dijakritika (š→s, č/ć→c, ž→z, đ→dj),
// tako da "nis" nalazi "Niš", a "djordje" nalazi "Đorđe".
function normalizeText(str){
  return String(str == null ? '' : str)
    .toLowerCase()
    .replace(/đ/g, 'dj')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function hashCode(str){
  let h = 0;
  for(let i=0; i<str.length; i++){ h = ((h<<5)-h) + str.charCodeAt(i); h |= 0; }
  return h;
}

// Svi javno vidljivi oglasi: glavni imenik + oglasi dodati kroz "Dodaj ordinaciju"
// (u okviru ovog pretraživača).
// Uvezene ordinacije: koordinate iz js/imported-coords.js (geokodirane preko OpenStreetMap-a,
// preciznost "kuca" ili "ulica") se spajaju jednom, pri prvom pozivu. Samo ordinacije sa takvom
// koordinatom dobijaju coordsVerified = true (pin, udaljenost, "Blizu mene"); za ostale se
// generisane (procenjene) koordinate iz imported-clinics.js nikad ne koriste.
let importedCoordsMerged = false;
function getImportedClinics(){
  const list = (typeof IMPORTED_CLINICS !== 'undefined') ? IMPORTED_CLINICS : [];
  if(!importedCoordsMerged){
    importedCoordsMerged = true;
    const coords = (typeof IMPORTED_COORDS !== 'undefined') ? IMPORTED_COORDS : {};
    const importedServices = (typeof IMPORTED_SERVICES !== 'undefined') ? IMPORTED_SERVICES : {};
    list.forEach(c => {
      // Usluge: uvezene ordinacije imaju usluge samo ako su izričito pomenute na njihovom sajtu
      // (js/imported-services.js: id -> {s: [ključevi kategorija], izvor, datum}). Stara vrednost
      // "opsta" iz uvoza je bila samo podrazumevana i ne koristi se.
      // Bez ispravnog izvora (http/https) usluge se ne prikazuju: svaka mora imati link ka sajtu.
      const sv = importedServices[c.id];
      const hasSource = !!(sv && /^https?:\/\//.test(sv.izvor || ''));
      c.services = hasSource ? knownServices(sv.s) : [];
      c.servicesSource = c.services.length ? sv.izvor : null;
      c.servicesDate = c.services.length ? (sv.datum || null) : null;
      const e = coords[c.id];
      if(e && Number.isFinite(e[0]) && Number.isFinite(e[1]) && (e[2] === 'kuca' || e[2] === 'ulica')){
        c.lat = e[0];
        c.lng = e[1];
        c.coordsPrecision = e[2];
        c.coordsVerified = true;
      } else {
        c.coordsVerified = false;
      }
    });
  }
  return list;
}

function getAllPublicListings(){
  const mine = (typeof getMyListings === 'function') ? getMyListings() : [];
  return CLINICS.concat(getImportedClinics()).concat(mine.map(normalizeMyListing));
}

// Broj ordinacija po usluzi (slug -> broj), iz svih javnih oglasa.
function getServiceCounts(){
  const counts = {};
  getAllPublicListings().forEach(c => {
    // broji se po ordinaciji jednom: svaka usluga i njena kategorija
    const keys = new Set();
    knownServices(c.services).forEach(k => { keys.add(k); keys.add(SERVICE_INDEX[k].category); });
    keys.forEach(k => { counts[k] = (counts[k] || 0) + 1; });
  });
  return counts;
}

function getClinicById(id){
  const found = CLINICS.find(c => c.id === id) || getImportedClinics().find(c => c.id === id);
  if(found) return found;
  if(typeof getMyListingById === 'function'){
    const mine = getMyListingById(id);
    if(mine) return normalizeMyListing(mine);
  }
  return null;
}

// Sve gradove (imenik + uvezene ordinacije) — koristi se za popunjavanje
// padajućih lista za pretragu, umesto samo 5 "izlog" gradova iz CITIES.
function getAllCityNames(){
  const set = new Set();
  getAllPublicListings().forEach(c => { if(c.city && c.city !== 'Nepoznato') set.add(c.city); });
  return Array.from(set).sort((a,b) => a.localeCompare(b, 'sr'));
}

const DAY_KEYS = ['sun','mon','tue','wed','thu','fri','sat'];
const DAY_LABELS = {mon:'Ponedeljak',tue:'Utorak',wed:'Sreda',thu:'Četvrtak',fri:'Petak',sat:'Subota',sun:'Nedelja'};

// Radno vreme koje unosi vlasnik je slobodan tekst (do 60 znakova). Prepoznaje se samo oblik
// "HH:MM-HH:MM" (obična ili duga crtica); sve ostalo ("Zatvoreno", "po dogovoru") ima nepoznat status.
const HOURS_RANGE_RE = /^\s*(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})\s*$/;
function parseHoursRange(text){
  if(typeof text !== 'string') return null;
  const m = HOURS_RANGE_RE.exec(text);
  if(!m) return null;
  const sh = +m[1], sm = +m[2], eh = +m[3], em = +m[4];
  if(sh > 23 || eh > 24 || sm > 59 || em > 59) return null;
  return {start: sh*60+sm, end: eh*60+em};
}

// true / false = otvoreno / zatvoreno sada; null = nepoznato (nema podatka ili tekst koji se ne može protumačiti).
function openNowState(hours){
  if(!hours) return null;
  const now = new Date();
  const v = hours[DAY_KEYS[now.getDay()]];
  if(v === undefined) return null;          // dan koji vlasnik nije naveo
  if(!v) return false;                      // uvezeno/stari format: null = zatvoreno
  const r = parseHoursRange(v);
  if(!r){ return /zatvoren/i.test(v) ? false : null; }
  const nowMin = now.getHours()*60 + now.getMinutes();
  return r.end >= r.start ? (nowMin >= r.start && nowMin <= r.end) : (nowMin >= r.start || nowMin <= r.end);
}

function isOpenNow(hours){
  return openNowState(hours) === true;
}

function todayKey(){
  return DAY_KEYS[new Date().getDay()];
}

function priceLabel(n){
  return n ? '$'.repeat(n) : '';
}
