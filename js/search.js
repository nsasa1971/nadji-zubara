/* Logika pretrage, filtriranja i mape na stranici pretraga.html */

let currentFilters = {
  q:'', city:'', service:'', price:0, rating:0, openNow:false, verified:false, sort:'recommended'
};
let visibleCount = 9;
const PAGE_SIZE = 9;
const NEARBY_RADIUS_KM = 5;

let viewMode = 'map'; // 'map' | 'list'
let userLocation = null; // {lat, lng}
let locationState = 'idle'; // idle | requesting | granted | denied | unavailable
let ignoreDistanceLimit = false;
let sortAutoSetByLocation = false;
let searchAsMoveMap = false;
let mapBoundsFilterActive = false;
let currentMapBounds = null;
// Upit i grad pre uključivanja "Pretraži dok pomeram mapu" (vraćaju se kad se filter isključi).
let savedBeforeBounds = null;

let leafletMap = null;
let markersLayer = null;
let haloLayer = null;
let hoverHalo = null;
let userMarker = null;
let userCircle = null;

const MOBILE_BREAKPOINT = 860;

document.addEventListener('DOMContentLoaded', () => {
  populateSelects();
  populateServiceCheckboxes();
  applyLocationAvailability();
  applyDataAvailability();
  readFiltersFromUrl();
  bindEvents();
  syncFiltersFromDom();
  relocateFiltersForViewport();
  initMap();
  const initialMode = window.innerWidth <= MOBILE_BREAKPOINT ? 'list' : 'map';
  setViewMode(initialMode);
  // Geolokacija se NE traži automatski: pokreće se isključivo klikom na
  // "Blizu mene". Mapa se pri otvaranju prilagođava rezultatima pretrage
  // (ili prikazuje celu Srbiju ako nema upita, grada ni usluge).
});

window.addEventListener('resize', relocateFiltersForViewport);

function relocateFiltersForViewport(){
  const toolbarSelects = document.getElementById('toolbarSelects');
  const mobileSlot = document.getElementById('mobileFilterExtraSlot');
  const toolbarRow = document.querySelector('.toolbar-row');
  if(!toolbarSelects || !mobileSlot || !toolbarRow) return;
  const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
  if(isMobile && toolbarSelects.parentElement !== mobileSlot){
    mobileSlot.appendChild(toolbarSelects);
  } else if(!isMobile && toolbarSelects.parentElement !== toolbarRow){
    const applyBtn = document.getElementById('applyBtn');
    toolbarRow.insertBefore(toolbarSelects, applyBtn);
  }
}

function openFiltersDrawer(){
  document.querySelector('.filters-panel').classList.add('open');
  document.getElementById('filtersBackdrop').classList.add('open');
}
function closeFiltersDrawer(){
  document.querySelector('.filters-panel').classList.remove('open');
  document.getElementById('filtersBackdrop').classList.remove('open');
}

function clearCityFilter(){
  // "Blizu mene" traži ordinacije oko stvarne GPS lokacije — ako je
  // istovremeno aktivan filter za konkretan grad, presek ta dva uslova
  // često ispadne prazan, pa ga ovde uklanjamo.
  currentFilters.city = '';
  const cityInput = document.getElementById('cityInput');
  if(cityInput) cityInput.value = '';
}

// "Blizu mene", "Moja lokacija", "Pretraži dok pomeram mapu" i sortiranje po udaljenosti
// imaju smisla samo ako postoji bar jedna ordinacija sa proverenom koordinatom.
function applyLocationAvailability(){
  if(anyVerifiedCoords()) return;
  ['nearMeBtn','mobileNearMeBtn','locateMeBtn'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.style.display = 'none';
  });
  const move = document.querySelector('.map-move-control');
  if(move) move.style.display = 'none';
  const opt = document.querySelector('#sortSelect option[value="distance"]');
  if(opt) opt.remove();
  if(currentFilters.sort === 'distance') currentFilters.sort = 'recommended';
}

// Filteri i sortiranja po oceni, recenzijama i ceni se prikazuju samo ako takvi podaci postoje
// (uvezene ordinacije nemaju ocene ni cene); kad se pojave, kontrole se vraćaju same.
function applyDataAvailability(){
  const all = getAllPublicListings();
  const hasRatings = all.some(c => c.reviewCount > 0);
  const hasPrices = all.some(c => c.priceRange);
  const hideGroup = sel => { const g = document.querySelector(sel)?.closest('.filter-group'); if(g) g.style.display = 'none'; };
  const dropSort = vals => vals.forEach(v => document.querySelector(`#sortSelect option[value="${v}"]`)?.remove());
  // Usluge: filter se prikazuje samo ako postoji bar jedna usluga sa ordinacijom (inače nema šta da se bira).
  if(getFilterableServices().length === 0){
    const sel = document.getElementById('serviceInput');
    if(sel && sel.parentElement) sel.parentElement.style.display = 'none';
    hideGroup('#servicesFilter');
  }
  if(!hasRatings){ hideGroup('#ratingToggle'); dropSort(['rating', 'reviews']); }
  if(!hasPrices){ hideGroup('#priceToggle'); dropSort(['price-asc', 'price-desc']); }
}

function populateSelects(){
  const citySel = document.getElementById('cityInput');
  citySel.innerHTML = '<option value="">Svi gradovi</option>' +
    getAllCityNames().map(name=>`<option value="${name}">${name}</option>`).join('');

  const serviceSel = document.getElementById('serviceInput');
  serviceSel.innerHTML = '<option value="">Sve usluge</option>' +
    getFilterableServices().map(s=>`<option value="${s.slug}">${s.sub ? '\u00A0\u00A0— ' : ''}${s.name} (${s.count.toLocaleString('sr-RS')})</option>`).join('');
}

// Usluge za filter: samo one koje imaju bar jednu ordinaciju u podacima (sa brojem).
// Usluga zadata kroz URL (?service=...) ostaje na listi i kad nema ordinacija,
// da bi izabrani filter ostao vidljiv i dosledan (sa brojem 0).
function getFilterableServices(){
  const counts = getServiceCounts();
  let fromUrl = new URLSearchParams(window.location.search).get('service');
  if(fromUrl && !SERVICE_INDEX[fromUrl]) fromUrl = null;   // nepoznat/stari ključ se ignoriše
  const out = [];
  SERVICE_CATALOG.forEach(cat => {
    const n = counts[cat.key] || 0;
    if(n > 0 || cat.key === fromUrl) out.push({slug:cat.key, name:cat.name, count:n, sub:false});
    // podusluge se nude samo ako imaju bar jednu ordinaciju
    cat.subservices.forEach(sv => {
      const m = counts[sv.key] || 0;
      if(m > 0 || sv.key === fromUrl) out.push({slug:sv.key, name:sv.name, count:m, sub:true});
    });
  });
  return out;
}

function populateServiceCheckboxes(){
  const wrap = document.getElementById('servicesFilter');
  wrap.innerHTML = getFilterableServices().filter(s => !s.sub).map(s=>`
    <label class="checkbox-row">
      <input type="checkbox" value="${s.slug}" class="service-checkbox">
      ${s.name} (${s.count.toLocaleString('sr-RS')})
    </label>`).join('');
}

function readFiltersFromUrl(){
  const params = new URLSearchParams(window.location.search);
  currentFilters.q = params.get('q') || '';
  currentFilters.city = params.get('city') || '';
  currentFilters.service = params.get('service') || '';

  document.getElementById('queryInput').value = currentFilters.q;
  document.getElementById('cityInput').value = currentFilters.city;
  document.getElementById('serviceInput').value = currentFilters.service;
  if(currentFilters.service){
    const cb = document.querySelector(`.service-checkbox[value="${currentFilters.service}"]`);
    if(cb) cb.checked = true;
  }
}

function bindEvents(){
  document.getElementById('applyBtn').addEventListener('click', ()=>applyFilters(true));
  document.getElementById('queryInput').addEventListener('keydown', (e)=>{
    if(e.key === 'Enter'){ e.preventDefault(); applyFilters(true); }
  });
  document.getElementById('cityInput').addEventListener('change', ()=>applyFilters(true));
  document.getElementById('serviceInput').addEventListener('change', ()=>{
    document.querySelectorAll('.service-checkbox').forEach(cb=>cb.checked=false);
    applyFilters(true);
  });
  document.getElementById('sortSelect').addEventListener('change', ()=>applyFilters(false));
  document.getElementById('openNowFilter').addEventListener('change', ()=>applyFilters(true));
  document.getElementById('verifiedFilter').addEventListener('change', ()=>applyFilters(true));

  document.querySelectorAll('.service-checkbox').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      document.getElementById('serviceInput').value = '';
      applyFilters(true);
    });
  });

  document.querySelectorAll('#priceToggle button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const val = Number(btn.getAttribute('data-price'));
      const isActive = btn.classList.contains('active');
      document.querySelectorAll('#priceToggle button').forEach(b=>b.classList.remove('active'));
      if(!isActive){ btn.classList.add('active'); currentFilters.price = val; }
      else currentFilters.price = 0;
      applyFilters(true);
    });
  });

  document.querySelectorAll('input[name="rating"]').forEach(r=>{
    r.addEventListener('change', ()=>applyFilters(true));
  });

  document.getElementById('resetFilters').addEventListener('click', (e)=>{
    e.preventDefault();
    resetLocationMode();
    cancelBoundsMode();   // "Resetuj" gasi i režim "pomeram mapu" (bez vraćanja starih vrednosti)
    document.getElementById('queryInput').value = '';
    document.getElementById('cityInput').value = '';
    document.getElementById('serviceInput').value = '';
    document.getElementById('openNowFilter').checked = false;
    document.getElementById('verifiedFilter').checked = false;
    document.querySelectorAll('.service-checkbox').forEach(cb=>cb.checked=false);
    document.querySelectorAll('#priceToggle button').forEach(b=>b.classList.remove('active'));
    document.querySelector('input[name="rating"][value="0"]').checked = true;
    applyFilters(true);
  });

  document.getElementById('loadMoreBtn').addEventListener('click', ()=>{
    visibleCount += PAGE_SIZE;
    renderResults({fitMap:false});
  });

  document.getElementById('viewListBtn').addEventListener('click', ()=>setViewMode('list'));
  document.getElementById('viewMapBtn').addEventListener('click', ()=>setViewMode('map'));

  document.getElementById('nearMeBtn').addEventListener('click', ()=>{
    clearCityFilter();
    setViewMode('map');
    requestUserLocation(true);
  });

  document.getElementById('searchAsMoveCheckbox').addEventListener('change', (e)=>{
    if(e.target.checked){
      if(leafletMap) enterBoundsMode(); else e.target.checked = false;
    } else {
      exitBoundsMode();
    }
  });

  // Dugme na praznom stanju: u režimu "pretraži dok pomeram mapu" gasi taj filter, inače ukida ograničenje udaljenosti.
  document.getElementById('clearDistanceBtn').addEventListener('click', () => {
    if(mapBoundsFilterActive) showAllResults(); else showAllIgnoringDistance();
  });
  document.getElementById('showAllResultsBtn').addEventListener('click', showAllResults);

  document.getElementById('mobileFilterBtn').addEventListener('click', openFiltersDrawer);
  document.getElementById('filtersCloseBtn').addEventListener('click', closeFiltersDrawer);
  document.getElementById('filtersBackdrop').addEventListener('click', closeFiltersDrawer);
  document.getElementById('mobileFiltersApply').addEventListener('click', closeFiltersDrawer);

  document.getElementById('mobileNearMeBtn').addEventListener('click', ()=>{
    closeFiltersDrawer();
    clearCityFilter();
    setViewMode('map');
    requestUserLocation(true);
  });

  document.getElementById('mobileViewFab').addEventListener('click', ()=>{
    const goingToMap = viewMode !== 'map';
    setViewMode(goingToMap ? 'map' : 'list');
    // Ako je korisnik skrolovao nadole kroz listu, mapa (koja je iznad liste)
    // bi inače ostala van ekrana — vrati ga na vrh rezultata da odmah vidi mapu.
    if(goingToMap){
      const target = document.getElementById('mapSplit');
      const stickyOffset = 150;
      const top = target.getBoundingClientRect().top + window.scrollY - stickyOffset;
      window.scrollTo({top, behavior:'smooth'});
    }
  });

  document.getElementById('locateMeBtn').addEventListener('click', ()=>{
    requestUserLocation(true);
  });
}

function getSelectedServices(){
  return Array.from(document.querySelectorAll('.service-checkbox:checked')).map(cb=>cb.value);
}

function syncFiltersFromDom(){
  currentFilters.q = normalizeText(document.getElementById('queryInput').value.trim());
  currentFilters.city = document.getElementById('cityInput').value;
  currentFilters.service = document.getElementById('serviceInput').value;
  currentFilters.rating = Number(document.querySelector('input[name="rating"]:checked').value);
  currentFilters.openNow = document.getElementById('openNowFilter').checked;
  currentFilters.verified = document.getElementById('verifiedFilter').checked;
  currentFilters.sort = document.getElementById('sortSelect').value;
  currentFilters.selectedServices = getSelectedServices();
}

// Režim "Pretraži dok pomeram mapu": rezultate određuje samo vidljivi deo mape, uz ostale filtere
// (usluga i sl.). Filter grada i tekstualni upit se tada ne primenjuju (inače bi pomeranje mape van
// izabranog grada uvek dalo 0), pa se polja grada i upita prazne, a prethodne vrednosti se pamte.
function enterBoundsMode(){
  if(mapBoundsFilterActive) return;
  const cityInput = document.getElementById('cityInput');
  const queryInput = document.getElementById('queryInput');
  savedBeforeBounds = {city: cityInput.value, q: queryInput.value};
  cityInput.value = '';
  queryInput.value = '';
  currentFilters.city = '';
  currentFilters.q = '';
  searchAsMoveMap = true;
  mapBoundsFilterActive = true;
  currentMapBounds = leafletMap.getBounds();
  document.getElementById('searchAsMoveCheckbox').checked = true;
  renderResults({fitMap:false});
}

// Isključivanje filtera (kvačica ili "Prikaži sve rezultate"): vraćaju se prethodni grad i upit,
// a mapa se vraća na okvir tih rezultata.
function exitBoundsMode(){
  const saved = savedBeforeBounds;
  cancelBoundsMode();
  if(saved){
    document.getElementById('cityInput').value = saved.city;
    document.getElementById('queryInput').value = saved.q;
    syncFiltersFromDom();
    updateUrl();
  }
  renderResults({fitMap:true});
}

// Izlazak iz režima bez vraćanja prethodnih vrednosti (korisnik je sam uneo novi upit/grad,
// ili je uključen "Blizu mene").
function cancelBoundsMode(){
  savedBeforeBounds = null;
  if(mapBoundsFilterActive || searchAsMoveMap){
    mapBoundsFilterActive = false;
    searchAsMoveMap = false;
    currentMapBounds = null;
    const cb = document.getElementById('searchAsMoveCheckbox');
    if(cb) cb.checked = false;
  }
}

function resetLocationMode(){
  if(userLocation || locationState !== 'idle'){
    userLocation = null;
    locationState = 'idle';
    ignoreDistanceLimit = false;
    // Ako smo sortiranje sami prebacili na "udaljenost" zbog lokacije, vrati ga.
    if(sortAutoSetByLocation){
      sortAutoSetByLocation = false;
      if(currentFilters.sort === 'distance'){
        currentFilters.sort = 'recommended';
        const sortSelect = document.getElementById('sortSelect');
        if(sortSelect) sortSelect.value = 'recommended';
      }
    }
    if(userMarker && leafletMap){ leafletMap.removeLayer(userMarker); userMarker = null; }
    if(userCircle && leafletMap){ leafletMap.removeLayer(userCircle); userCircle = null; }
    renderLocationBanner();
  }
}

function applyFilters(resetPage){
  const prevQ = currentFilters.q;
  const prevCity = currentFilters.city;
  syncFiltersFromDom();
  if(resetPage) visibleCount = PAGE_SIZE;
  // U režimu "pomeram mapu" promena usluge i ostalih filtera ne gasi režim; novi upit ili grad
  // (korisnik ih je uneo u prazna polja) počinje običnu pretragu i gasi režim.
  if(!mapBoundsFilterActive || currentFilters.q !== '' || currentFilters.city !== ''){
    cancelBoundsMode();
  }
  // "Blizu mene" (filter od 5 km) se gasi samo kad korisnik promeni upit ili grad;
  // ostali filteri i sortiranje ga ne diraju.
  if(currentFilters.q !== prevQ || currentFilters.city !== prevCity){
    resetLocationMode();
  }
  updateUrl();
  // U režimu "pomeram mapu" mapa se ne pomera pri promeni ostalih filtera (rezultate određuje njen položaj).
  renderResults({fitMap: !mapBoundsFilterActive});
}

function updateUrl(){
  const params = new URLSearchParams();
  if(currentFilters.q) params.set('q', currentFilters.q);
  if(currentFilters.city) params.set('city', currentFilters.city);
  if(currentFilters.service) params.set('service', currentFilters.service);
  const newUrl = window.location.pathname + (params.toString() ? '?'+params.toString() : '');
  window.history.replaceState({}, '', newUrl);
}

// Upit koji se tačno poklapa sa nazivom grada (bez dijakritika, "nis" = Niš) tretira
// se kao izbor tog grada. Vraća normalizovan naziv grada ili '' ako upit nije grad.
let cityNameSet = null;
function queryAsCity(){
  if(!currentFilters.q) return '';
  if(!cityNameSet) cityNameSet = new Set(getAllCityNames().map(normalizeText));
  return cityNameSet.has(currentFilters.q) ? currentFilters.q : '';
}

// 0 = grad se tačno poklapa sa upitom, 1 = ostalo (poklapanje u nazivu/delimično)
function cityRank(c){
  return (currentFilters.q && normalizeText(c.city) === currentFilters.q) ? 0 : 1;
}

function getFilteredClinics(){
  // U režimu "pomeram mapu" se grad i upit ne primenjuju (određuje ih vidljivi deo mape).
  const boundsMode = mapBoundsFilterActive && !!currentMapBounds;
  let list = getAllPublicListings().filter(c=>{
    if(!boundsMode){
      if(currentFilters.q && !normalizeText(c.name).includes(currentFilters.q) && !normalizeText(c.city).includes(currentFilters.q)) return false;
      if(currentFilters.city && c.city !== currentFilters.city) return false;
    }
    if(currentFilters.service && !clinicHasService(c, currentFilters.service)) return false;
    if(currentFilters.selectedServices && currentFilters.selectedServices.length){
      const hasAny = currentFilters.selectedServices.some(s=>clinicHasService(c, s));
      if(!hasAny) return false;
    }
    if(currentFilters.price && c.priceRange !== currentFilters.price) return false;
    if(currentFilters.rating && c.rating < currentFilters.rating) return false;
    if(currentFilters.openNow && !isOpenNow(c.hours)) return false;
    if(currentFilters.verified && !c.verified) return false;
    return true;
  });

  list.forEach(c => {
    c._distance = (userLocation && hasVerifiedCoords(c))
      ? distanceKm(userLocation.lat, userLocation.lng, c.lat, c.lng)
      : null;
  });

  if(mapBoundsFilterActive && currentMapBounds){
    list = list.filter(c => hasVerifiedCoords(c) && currentMapBounds.contains([c.lat, c.lng]));
  } else if(userLocation && !ignoreDistanceLimit){
    list = list.filter(c => c._distance !== null && c._distance <= NEARBY_RADIUS_KM);
  }

  switch(currentFilters.sort){
    case 'distance': list.sort((a,b)=>(a._distance ?? 1e9)-(b._distance ?? 1e9)); break;
    case 'rating': list.sort((a,b)=>b.rating-a.rating); break;
    case 'reviews': list.sort((a,b)=>b.reviewCount-a.reviewCount); break;
    case 'price-asc': list.sort((a,b)=>a.priceRange-b.priceRange); break;
    case 'price-desc': list.sort((a,b)=>b.priceRange-a.priceRange); break;
    case 'name': list.sort((a,b)=>a.name.localeCompare(b.name,'sr')); break;
    default:
      // Tačno poklapanje grada sa upitom ima prednost nad poklapanjem u nazivu.
      // (Array.sort je stabilan, pa ostali redosled ostaje kakav je bio.)
      if(userLocation && !mapBoundsFilterActive){
        list.sort((a,b)=>(cityRank(a)-cityRank(b)) || (a._distance ?? 1e9)-(b._distance ?? 1e9));
      } else {
        list.sort((a,b)=>(cityRank(a)-cityRank(b)) || (b.verified-a.verified) || b.rating-a.rating);
      }
  }
  // Kad je upit naziv grada: ordinacije iz tog grada uvek idu pre poklapanja po
  // nazivu iz drugih gradova, bez obzira na izabrano sortiranje (stabilno).
  if(queryAsCity()){
    list.sort((a,b)=>cityRank(a)-cityRank(b));
  }
  return list;
}

function renderResults(opts){
  opts = opts || {};
  const list = getFilteredClinics();
  const countEl = document.getElementById('resultsCount');
  const empty = document.getElementById('emptyState');
  const loadMoreWrap = document.getElementById('loadMoreWrap');
  const clearDistanceBtn = document.getElementById('clearDistanceBtn');
  const resultsGrid = document.getElementById('resultsGrid');
  const mapSplit = document.getElementById('mapSplit');

  countEl.textContent = list.length;
  const points = renderMapMarkers(list);
  // Nijedan pin na mapi (npr. nema proverenih koordinata): poruka umesto prazne mape.
  const mapSoon = document.getElementById('mapSoon');
  // (ne u režimu "pretraži dok pomeram mapu": tada mapa ostaje slobodna i interaktivna)
  if(mapSoon) mapSoon.style.display = (viewMode === 'map' && points.length === 0 && !(mapBoundsFilterActive && list.length === 0)) ? 'flex' : 'none';
  // Upit == grad: mapa se prilagođava samo ordinacijama iz tog grada
  // (poklapanja po nazivu iz drugih gradova ostaju na mapi, ali ne određuju okvir).
  const fitPoints = queryAsCity()
    ? list.filter(c => cityRank(c) === 0 && hasVerifiedCoords(c)).map(c => [c.lat, c.lng])
    : points;

  // "Pretraži dok pomeram mapu" bez ordinacija u vidljivom delu: mapa NE sme da nestane.
  // Prikazuje se samo baner preko mape (sa dugmetom "Prikaži sve rezultate"); mapa ostaje
  // interaktivna i sledeće pomeranje osvežava rezultate.
  const mapEmptyBanner = document.getElementById('mapEmptyBanner');
  const boundsEmpty = list.length === 0 && mapBoundsFilterActive && viewMode === 'map' && !!leafletMap;
  if(mapEmptyBanner) mapEmptyBanner.style.display = boundsEmpty ? 'flex' : 'none';
  if(boundsEmpty){
    resultsGrid.innerHTML = '';
    document.getElementById('mapListCol').innerHTML = '';
    resultsGrid.style.display = 'none';
    empty.style.display = 'none';
    mapSplit.style.display = 'grid';
    loadMoreWrap.style.display = 'none';
    return;
  }

  if(list.length === 0){
    resultsGrid.innerHTML = '';
    document.getElementById('mapListCol').innerHTML = '';
    resultsGrid.style.display = 'none';
    mapSplit.style.display = 'none';
    empty.style.display = 'block';
    loadMoreWrap.style.display = 'none';

    const distanceIsCause = userLocation && !ignoreDistanceLimit && !mapBoundsFilterActive;
    document.getElementById('emptyStateTitle').textContent = distanceIsCause
      ? `Nema ordinacija u krugu od ${NEARBY_RADIUS_KM} km`
      : 'Nema rezultata';
    document.getElementById('emptyStateText').textContent = distanceIsCause
      ? 'U vašoj neposrednoj blizini trenutno nema registrovanih ordinacija. Proširite pretragu na ceo grad.'
      : mapBoundsFilterActive
        ? 'Nema ordinacija u ovom delu mape. Pomerite ili odzumirajte mapu.'
        : 'Pokušajte da promenite filtere ili pretragu.';
    // u listi (bez mape) filter "pomeram mapu" se gasi ovde; u ostalim slučajevima samo ograničenje udaljenosti
    clearDistanceBtn.textContent = mapBoundsFilterActive ? 'Prikaži sve rezultate' : 'Prikaži sve, bez ograničenja udaljenosti';
    clearDistanceBtn.style.display = (distanceIsCause || mapBoundsFilterActive) ? 'inline-flex' : 'none';
    return;
  }
  empty.style.display = 'none';
  resultsGrid.style.display = viewMode === 'list' ? 'grid' : 'none';
  mapSplit.style.display = viewMode === 'map' ? 'grid' : 'none';
  if(viewMode === 'map' && leafletMap){
    // Mapa mora prvo da dobije stvaran razmer (invalidateSize) pre nego
    // što je centriramo/zumiramo — u suprotnom, ako je kontejner tog
    // trenutka bio sakriven (display:none), fitBounds/setView se računa
    // nad veličinom 0 i mapa završi centrirana na pogrešnom, praznom
    // mestu. Ovo se dešava svaki put kad mapa postane vidljiva (promena
    // moda, ili prelazak iz praznog stanja rezultata natrag na rezultate).
    setTimeout(()=>{
      leafletMap.invalidateSize();
      if(opts.fitMap) fitMapToPoints(fitPoints);
    }, 30);
  }

  const toShow = list.slice(0, visibleCount);

  if(viewMode === 'list'){
    document.getElementById('resultsGrid').innerHTML = toShow.map(c=>renderClinicCard(c)).join('');
    bindFavoriteButtons(document.getElementById('resultsGrid'));
    document.getElementById('mapListCol').innerHTML = '';
  } else {
    const mapListCol = document.getElementById('mapListCol');
    mapListCol.innerHTML = toShow.map(c=>renderClinicCard(c)).join('');
    bindFavoriteButtons(mapListCol);
    bindMapListHover(mapListCol, toShow);
    document.getElementById('resultsGrid').innerHTML = '';
  }

  loadMoreWrap.style.display = list.length > visibleCount ? 'block' : 'none';
}

// "Prikaži sve rezultate": isključuje filter "Pretraži dok pomeram mapu" i vraća mapu na okvir svih rezultata.
function showAllResults(){
  exitBoundsMode();
}

function showAllIgnoringDistance(){
  ignoreDistanceLimit = true;
  renderLocationBanner();
  renderResults({fitMap:true});
}

function toggleDistanceLimit(){
  ignoreDistanceLimit = !ignoreDistanceLimit;
  renderLocationBanner();
  renderResults({fitMap:true});
}

/* ---------- Prikaz (lista / mapa) ---------- */

function setViewMode(mode){
  viewMode = mode;
  document.getElementById('viewListBtn').classList.toggle('active', mode==='list');
  document.getElementById('viewMapBtn').classList.toggle('active', mode==='map');
  document.getElementById('resultsGrid').style.display = mode==='list' ? 'grid' : 'none';
  document.getElementById('mapSplit').style.display = mode==='map' ? 'grid' : 'none';
  const fabLabel = document.getElementById('mobileViewFabLabel');
  const fabIcon = document.getElementById('mobileViewFabIcon');
  if(fabLabel) fabLabel.textContent = mode === 'map' ? 'Lista' : 'Mapa';
  if(fabIcon) fabIcon.innerHTML = mode === 'map' ? ICONS.list : ICONS.compass;
  // u režimu "pomeram mapu" promena prikaza lista/mapa ne sme da pomeri mapu
  renderResults({fitMap: mode==='map' && !mapBoundsFilterActive});
}

/* ---------- Mapa (Leaflet + OpenStreetMap) ---------- */

function initMap(){
  const container = document.getElementById('mapContainer');
  if(!container || typeof L === 'undefined') return;

  leafletMap = L.map(container, {scrollWheelZoom:true, maxZoom:16}).setView([44.35, 20.6], 7);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    maxZoom:16,
    attribution:'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ'
  }).addTo(leafletMap);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
    maxZoom:16
  }).addTo(leafletMap);
  // Koordinate ordinacija potiču iz OpenStreetMap-a (zahtev licence ODbL).
  leafletMap.attributionControl.addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors');
  markersLayer = (typeof L.markerClusterGroup === 'function')
    ? L.markerClusterGroup({
        maxClusterRadius:50,
        spiderfyOnMaxZoom:true,
        showCoverageOnHover:false,
        disableClusteringAtZoom:15
      })
    : L.layerGroup();
  markersLayer.addTo(leafletMap);
  haloLayer = L.layerGroup().addTo(leafletMap);

  leafletMap.on('moveend', () => {
    if(!searchAsMoveMap) return;
    mapBoundsFilterActive = true;
    currentMapBounds = leafletMap.getBounds();
    renderResults({fitMap:false});
  });
}

function buildMarkerIcon(c){
  const isFeatured = !!c.featured;

  // Približna lokacija (geokodirana samo do ulice): drugačiji marker - isprekidan krug.
  if(c.coordsPrecision === 'ulica'){
    return L.divIcon({
      className:'',
      html:'<div class="map-marker-approx" title="Približna lokacija"></div>',
      iconSize:[30,30],
      iconAnchor:[15,15],
      popupAnchor:[0,-16]
    });
  }

  if(!isFeatured){
    // Generička ordinacija — koristi standardnu ikonicu markera sajta.
    return L.icon({
      iconUrl:'img/marker-icon.webp',
      iconSize:[36,36],
      iconAnchor:[18,18],
      popupAnchor:[0,-18]
    });
  }

  // Premium ordinacija — sopstveni logo/inicijali na obojenom krugu.
  const inner = c.logoImage
    ? `<img src="${c.logoImage}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
    : c.logoInitials;
  return L.divIcon({
    className:'',
    html:`<div class="map-marker-pin" style="background:${c.logoColor}">${inner}</div>`,
    iconSize:[38,38],
    iconAnchor:[19,19],
    popupAnchor:[0,-20]
  });
}

const markerRefs = {};

function renderMapMarkers(list){
  if(!leafletMap || !markersLayer) return [];
  markersLayer.clearLayers();
  Object.keys(markerRefs).forEach(k => delete markerRefs[k]);
  const points = [];

  list.forEach(c => {
    if(!hasVerifiedCoords(c)) return; // bez proverene koordinate nema markera
    const marker = L.marker([c.lat, c.lng], {icon: buildMarkerIcon(c)});
    marker.bindPopup(`
      <div class="map-pin-popup">
        <h5>${c.name}</h5>
        ${c.coordsPrecision === 'ulica' ? '<div class="map-pin-approx">Približna lokacija</div>' : ''}
        ${c.reviewCount > 0 ? starRow(c.rating) : ''}
        <div style="margin-top:8px;"><a href="ordinacija.html?id=${c.id}">Pogledaj detalje →</a></div>
      </div>
    `);
    marker.on('click', () => highlightCard(c.id));
    marker.on('mouseover', () => showMapHalo(c));
    marker.on('mouseout', () => hideMapHalo());
    markersLayer.addLayer(marker);
    markerRefs[c.id] = {marker, c};
    points.push([c.lat, c.lng]);
  });

  return points;
}

// Okvir cele Srbije (jugozapad, severoistok) za prikaz bez upita, grada i usluge.
const SERBIA_BOUNDS = [[42.2, 18.8], [46.2, 23.0]];

function hasSearchFilters(){
  return !!(currentFilters.q || currentFilters.city || currentFilters.service ||
    (currentFilters.selectedServices && currentFilters.selectedServices.length));
}

function fitMapToPoints(points){
  if(!leafletMap) return;
  if(!userLocation && !hasSearchFilters()){
    leafletMap.fitBounds(SERBIA_BOUNDS, {padding:[10,10]});
    return;
  }
  if(points.length === 1){
    leafletMap.setView(points[0], 15);
  } else if(points.length > 1){
    leafletMap.fitBounds(points, {padding:[40,40], maxZoom:16});
  } else if(userLocation){
    leafletMap.setView([userLocation.lat, userLocation.lng], 14);
  }
}

const PREMIUM_CENTER_RADIUS_KM = 15;

function centerOnNearestPremium(){
  if(!userLocation || !leafletMap) return;
  let nearest = null;
  let nearestDist = Infinity;
  getAllPublicListings().forEach(c => {
    if(!c.featured || !hasVerifiedCoords(c)) return;
    const d = distanceKm(userLocation.lat, userLocation.lng, c.lat, c.lng);
    if(d < nearestDist){ nearestDist = d; nearest = c; }
  });
  if(nearest && nearestDist <= PREMIUM_CENTER_RADIUS_KM){
    // Bez animacije — ovo je korekcija odmah posle početnog fitBounds-a,
    // a ulančane animacije se u nekim slučajevima nisu pouzdano završavale.
    leafletMap.setView([nearest.lat, nearest.lng], 14, {animate:false});
  }
}

function highlightCard(id){
  document.querySelectorAll('.map-list-col .clinic-card').forEach(el=>{
    el.classList.toggle('highlight', el.getAttribute('data-id') === id);
  });
  const target = document.querySelector(`.map-list-col .clinic-card[data-id="${id}"]`);
  if(target) target.scrollIntoView({behavior:'smooth', block:'nearest'});
}

function showMapHalo(c){
  if(!leafletMap || !haloLayer || !hasVerifiedCoords(c)) return;
  hideMapHalo();
  hoverHalo = L.marker([c.lat, c.lng], {
    icon: L.divIcon({className:'', html:'<div class="map-marker-halo"></div>', iconSize:[66,66], iconAnchor:[33,33]}),
    interactive:false,
    zIndexOffset:-1000
  });
  haloLayer.addLayer(hoverHalo);
}

function hideMapHalo(){
  if(hoverHalo && haloLayer){
    haloLayer.removeLayer(hoverHalo);
    hoverHalo = null;
  }
}

function bindMapListHover(container, list){
  container.querySelectorAll('.clinic-card[data-id]').forEach(el => {
    const id = el.getAttribute('data-id');
    const c = list.find(x => x.id === id);
    if(!c) return;
    el.addEventListener('mouseenter', () => showMapHalo(c));
    el.addEventListener('mouseleave', () => hideMapHalo());
  });
}

/* ---------- Geolokacija korisnika ---------- */

function requestUserLocation(){
  if(!navigator.geolocation){
    locationState = 'unavailable';
    renderLocationBanner();
    return;
  }
  locationState = 'requesting';
  renderLocationBanner();

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLocation = {lat: pos.coords.latitude, lng: pos.coords.longitude};
      locationState = 'granted';
      ignoreDistanceLimit = false;
      cancelBoundsMode();
      placeUserMarker();
      renderLocationBanner();
      // Kad znamo lokaciju korisnika, sortiranje po udaljenosti je
      // podrazumevano najrelevantnije — uskladi i sam padajući meni.
      if(currentFilters.sort === 'recommended'){
        sortAutoSetByLocation = true;
        currentFilters.sort = 'distance';
        const sortSelect = document.getElementById('sortSelect');
        if(sortSelect) sortSelect.value = 'distance';
      }
      renderResults({fitMap:true});
      // Ako postoji Premium ordinacija u razumnoj blizini, centriraj mapu
      // na nju umesto na "goli" GPS centar korisnika — daje kontekst
      // (susedne ordinacije oko nje) i ističe premium oglase.
      setTimeout(centerOnNearestPremium, 50);
    },
    () => {
      locationState = 'denied';
      renderLocationBanner();
    },
    {enableHighAccuracy:true, timeout:8000, maximumAge:300000}
  );
}

function placeUserMarker(){
  if(!leafletMap || !userLocation) return;
  if(userMarker) leafletMap.removeLayer(userMarker);
  if(userCircle) leafletMap.removeLayer(userCircle);

  const icon = L.divIcon({className:'', html:'<div class="user-loc-dot"></div>', iconSize:[16,16]});
  userMarker = L.marker([userLocation.lat, userLocation.lng], {icon, zIndexOffset:1000})
    .addTo(leafletMap).bindPopup('Vaša lokacija');
}

function renderLocationBanner(){
  const el = document.getElementById('locationBanner');

  if(locationState === 'requesting'){
    el.style.display = 'flex';
    el.className = 'location-banner';
    el.innerHTML = `${ICONS.compass}<span class="grow">Tražimo vašu lokaciju kako bismo prikazali ordinacije u krugu od ${NEARBY_RADIUS_KM} km...</span>`;
    return;
  }

  if(locationState === 'granted'){
    el.style.display = 'flex';
    el.className = 'location-banner';
    el.innerHTML = ignoreDistanceLimit
      ? `${ICONS.pin}<span class="grow">Prikazane su sve ordinacije, sortirane po udaljenosti od vaše lokacije.</span><button class="btn btn-ghost btn-sm" id="toggleDistanceBtn" type="button">Vrati na krug od ${NEARBY_RADIUS_KM} km</button>`
      : `${ICONS.pin}<span class="grow">Prikazane su ordinacije u krugu od ${NEARBY_RADIUS_KM} km od vaše lokacije.</span><button class="btn btn-ghost btn-sm" id="toggleDistanceBtn" type="button">Prikaži sve ordinacije</button>`;
    document.getElementById('toggleDistanceBtn').addEventListener('click', toggleDistanceLimit);
    return;
  }

  if(locationState === 'denied' || locationState === 'unavailable'){
    el.style.display = 'flex';
    el.className = 'location-banner warn';
    el.innerHTML = `${ICONS.info}<span class="grow">Nismo mogli da pristupimo vašoj lokaciji. Dozvolite pristup lokaciji u pretraživaču ili pretražujte ručno po gradu.</span><button class="btn btn-outline-navy btn-sm" id="retryLocationBtn" type="button">Pokušaj ponovo</button>`;
    document.getElementById('retryLocationBtn').addEventListener('click', ()=>requestUserLocation());
    return;
  }

  el.style.display = 'none';
}
