/* Javni prikaz profila koje su preuzeli vlasnici: spaja objavljene izmene (profile_overrides) sa
   uvezenim podacima (js/imported-clinics.js, koji se ne menja). Prazna vrednost nikad ne prepisuje
   uvezenu. Ako zahtev ne uspe ili traje duže od 1,5 s, stranica radi sa uvezenim podacima.
   Zavisi od: safe.js, supabase-config.js, profile-common.js, services.js, data.js, imported-clinics.js. */
const PROFILE_WAIT_MS = 1500;
const PLACEHOLDER_DESCRIPTION_RE = /^Detaljan opis ove ordinacije još nije dostupan/;
const GENERIC_NAME_WORDS = new Set(['stomatoloska','stomatoloski','specijalisticka','ordinacija','privatna','praksa','dr','stomatolog','poliklinika','centar','zubarska','dental','clinic']);

function initialsFromName(name){
  const words = (normalizeText(name).match(/[a-z0-9]+/g) || []);
  const significant = words.filter(w => !GENERIC_NAME_WORDS.has(w) && w.length > 1);
  const pool = significant.length ? significant : words;
  return (pool.slice(0, 2).map(w => w[0]).join('') || 'o').toUpperCase();
}

function applyProfileToClinic(c, p, imagePaths){
  c.claimed = true;
  c.verified = true;   // "Preuzet profil" (isti uslov koristi filter u pretrazi)
  if(p.name){ c.name = p.name; c.logoInitials = initialsFromName(p.name); }
  if(p.address){
    c.address = p.address;
    c.coordsVerified = false;   // koordinate pripadaju staroj adresi: pin se skriva dok se ne regenerišu
  }
  if(p.phones){ c.phones = p.phones; c.phone = p.phones[0]; }
  if(p.hours){
    const h = {};
    PF.HOURS_KEYS.forEach(k => { if(p.hours[k]) h[k] = p.hours[k]; });   // dan bez unosa = nepoznato (undefined)
    c.hours = h; c.hoursUnknown = false; c.hoursFromProfile = true;
  }
  if(p.services){
    const known = knownServices(p.services);
    if(known.length) c.services = known;
  }
  // uvezeni opis je šablon "Ako ste vlasnik..." — za preuzet profil se nikad ne prikazuje
  if(p.description) c.description = p.description;
  else if(PLACEHOLDER_DESCRIPTION_RE.test(c.description || '')) c.description = '';
  if(p.website) c.website = p.website;
  if(p.socials) c.socials = p.socials;
  if(p.team) c.team = p.team;
  if(p.priceList){ c.priceList = p.priceList; c.priceListUpdated = p.priceListUpdated || null; }
  if(p.customServices) c.customServices = p.customServices;
  if(imagePaths && imagePaths.length) c.approvedImages = imagePaths;
}

window.profilesReady = (function(){
  if(!PF.configured() || typeof getImportedClinics !== 'function') return Promise.resolve(false);
  // nove ordinacije iz baze (objavljene) idu uporedo sa profilima; greška jednog ne kvari drugo
  const newOnes = (typeof NEWC !== 'undefined') ? NEWC.loadPublished().catch(() => false) : Promise.resolve(false);
  const both = Promise.all([
    PF.withTimeout(s => PF.fetchProfiles(s), PROFILE_WAIT_MS, null),
    PF.withTimeout(s => PF.fetchImages(s), PROFILE_WAIT_MS, {}),
    PF.withTimeout(s => PF.fetchLogos(s), PROFILE_WAIT_MS, {})
  ]);
  return Promise.all([both, newOnes]).then(([[profiles, images, logos], gotNew]) => {
    if(!profiles) return !!gotNew;
    const byId = {};
    getImportedClinics().concat(typeof NEW_PUBLISHED !== 'undefined' ? NEW_PUBLISHED : []).forEach(c => { byId[c.id] = c; });
    Object.keys(profiles).forEach(id => { if(byId[id]) applyProfileToClinic(byId[id], profiles[id], images[id]); });
    // odobren logo (samo aktivni profili; RLS) zamenjuje inicijale; potpisani URL se traži tek pri prikazu (hydrateCovers)
    Object.keys(logos || {}).forEach(id => { if(byId[id]) byId[id].logoPath = logos[id]; });
    return true;
  }).catch(() => false);
})();

// Naslovne slike: za svaku <img data-cover-id="<id ordinacije>"> koja ima odobrenu sliku
// postavlja potpisani URL (bucket je privatan). Bez slike ili uz grešku ostaje opšta fotografija.
window.hydrateCovers = function(root){
  const scope = root || document;
  const pairs = [], logos = [];
  Array.from(scope.querySelectorAll('img[data-cover-id]')).forEach(img => {
    const c = getClinicById(img.getAttribute('data-cover-id'));
    if(c && c.approvedImages && c.approvedImages.length) pairs.push([img, c.approvedImages[0]]);
  });
  // logo ordinacije: u okviru gde su inicijali (isti okvir, ista veličina); inicijali ostaju dok slika ne stigne i kao rezerva
  Array.from(scope.querySelectorAll('[data-logo-id]')).forEach(node => {
    if(node.dataset.logoDone) return;
    const c = getClinicById(node.getAttribute('data-logo-id'));
    if(c && c.logoPath){ node.dataset.logoDone = '1'; logos.push([node, c]); }
  });
  if(!pairs.length && !logos.length) return;
  // jedan zahtev za sve potpisane URL-ove na stranici (naslovne slike i logoi zajedno)
  PF.signUrls(pairs.map(p => p[1]).concat(logos.map(l => l[1].logoPath))).then(urls => {
    pairs.forEach(([img, path]) => { if(urls[path]) img.src = urls[path]; });
    logos.forEach(([node, c]) => {
      const u = urls[c.logoPath];
      if(!u) return;   // bez URL-a ostaju inicijali
      const size = parseInt(node.getAttribute('data-logo-size'), 10) || 44;
      const im = document.createElement('img');
      im.className = 'logo-img'; im.width = size; im.height = size; im.alt = 'Logo: ' + c.name;
      im.decoding = 'async'; im.loading = node.hasAttribute('data-logo-eager') ? 'eager' : 'lazy';
      im.addEventListener('load', () => node.classList.add('has-logo'));
      im.addEventListener('error', () => im.remove());   // greška: bez polomljene slike, inicijali ostaju
      im.src = u;
      node.appendChild(im);
    });
  });
};
