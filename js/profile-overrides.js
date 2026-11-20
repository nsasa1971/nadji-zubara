/* Javni prikaz profila koje su preuzeli vlasnici: spaja objavljene izmene (profile_overrides) sa
   uvezenim podacima (js/imported-clinics.js, koji se ne menja). Prazna vrednost nikad ne prepisuje
   uvezenu. Ako zahtev ne uspe ili traje duže od 1,5 s, stranica radi sa uvezenim podacima.
   Zavisi od: safe.js, supabase-config.js, profile-common.js, services.js, data.js, imported-clinics.js. */
const PROFILE_WAIT_MS = 1500;
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
  if(p.description) c.description = p.description;
  if(p.website) c.website = p.website;
  if(p.socials) c.socials = p.socials;
  if(p.team) c.team = p.team;
  if(imagePaths && imagePaths.length) c.approvedImages = imagePaths;
}

window.profilesReady = (function(){
  if(!PF.configured() || typeof getImportedClinics !== 'function') return Promise.resolve(false);
  const both = Promise.all([
    PF.withTimeout(s => PF.fetchProfiles(s), PROFILE_WAIT_MS, null),
    PF.withTimeout(s => PF.fetchImages(s), PROFILE_WAIT_MS, {})
  ]);
  return both.then(([profiles, images]) => {
    if(!profiles) return false;
    const byId = {};
    getImportedClinics().forEach(c => { byId[c.id] = c; });
    Object.keys(profiles).forEach(id => { if(byId[id]) applyProfileToClinic(byId[id], profiles[id], images[id]); });
    return true;
  }).catch(() => false);
})();

// Naslovne slike: za svaku <img data-cover-id="<id ordinacije>"> koja ima odobrenu sliku
// postavlja potpisani URL (bucket je privatan). Bez slike ili uz grešku ostaje opšta fotografija.
window.hydrateCovers = function(root){
  const imgs = Array.from((root || document).querySelectorAll('img[data-cover-id]'));
  const pairs = [];
  imgs.forEach(img => {
    const c = getClinicById(img.getAttribute('data-cover-id'));
    if(c && c.approvedImages && c.approvedImages.length) pairs.push([img, c.approvedImages[0]]);
  });
  if(!pairs.length) return;
  PF.signUrls(pairs.map(p => p[1])).then(urls => {
    pairs.forEach(([img, path]) => { if(urls[path]) img.src = urls[path]; });
  });
};
