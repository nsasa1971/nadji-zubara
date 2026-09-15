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
let searchAsMoveMap = false;
let mapBoundsFilterActive = false;
let currentMapBounds = null;

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
  readFiltersFromUrl();
  bindEvents();
  syncFiltersFromDom();
  relocateFiltersForViewport();
  initMap();
  setViewMode(window.innerWidth <= MOBILE_BREAKPOINT ? 'list' : 'map');
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

function populateSelects(){
  const citySel = document.getElementById('cityInput');
  citySel.innerHTML = '<option value="">Svi gradovi</option>' +
    getAllCityNames().map(name=>`<option value="${name}">${name}</option>`).join('');

  const serviceSel = document.getElementById('serviceInput');
  serviceSel.innerHTML = '<option value="">Sve usluge</option>' +
    SERVICES.map(s=>`<option value="${s.slug}">${s.name}</option>`).join('');
}

function populateServiceCheckboxes(){
  const wrap = document.getElementById('servicesFilter');
  wrap.innerHTML = SERVICES.map(s=>`
    <label class="checkbox-row">
      <input type="checkbox" value="${s.slug}" class="service-checkbox">
      ${s.name}
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
    setViewMode('map');
    requestUserLocation(true);
  });

  document.getElementById('searchAsMoveCheckbox').addEventListener('change', (e)=>{
    searchAsMoveMap = e.target.checked;
    if(!searchAsMoveMap){
      mapBoundsFilterActive = false;
      currentMapBounds = null;
      renderResults({fitMap:true});
    } else if(leafletMap){
      mapBoundsFilterActive = true;
      currentMapBounds = leafletMap.getBounds();
      renderResults({fitMap:false});
    }
  });

  document.getElementById('clearDistanceBtn').addEventListener('click', showAllIgnoringDistance);

  document.getElementById('mobileFilterBtn').addEventListener('click', openFiltersDrawer);
  document.getElementById('filtersCloseBtn').addEventListener('click', closeFiltersDrawer);
  document.getElementById('filtersBackdrop').addEventListener('click', closeFiltersDrawer);
  document.getElementById('mobileFiltersApply').addEventListener('click', closeFiltersDrawer);

  document.getElementById('mobileNearMeBtn').addEventListener('click', ()=>{
    closeFiltersDrawer();
    setViewMode('map');
    requestUserLocation(true);
  });

  document.getElementById('mobileViewFab').addEventListener('click', ()=>{
    setViewMode(viewMode === 'map' ? 'list' : 'map');
  });
}

function getSelectedServices(){
  return Array.from(document.querySelectorAll('.service-checkbox:checked')).map(cb=>cb.value);
}

function syncFiltersFromDom(){
  currentFilters.q = document.getElementById('queryInput').value.trim().toLowerCase();
  currentFilters.city = document.getElementById('cityInput').value;
  currentFilters.service = document.getElementById('serviceInput').value;
  currentFilters.rating = Number(document.querySelector('input[name="rating"]:checked').value);
  currentFilters.openNow = document.getElementById('openNowFilter').checked;
  currentFilters.verified = document.getElementById('verifiedFilter').checked;
  currentFilters.sort = document.getElementById('sortSelect').value;
  currentFilters.selectedServices = getSelectedServices();
}

function cancelBoundsMode(){
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
    if(userMarker && leafletMap){ leafletMap.removeLayer(userMarker); userMarker = null; }
    if(userCircle && leafletMap){ leafletMap.removeLayer(userCircle); userCircle = null; }
    renderLocationBanner();
  }
}

function applyFilters(resetPage){
  syncFiltersFromDom();
  if(resetPage) visibleCount = PAGE_SIZE;
  cancelBoundsMode();
  resetLocationMode();
  updateUrl();
  renderResults({fitMap:true});
}

function updateUrl(){
  const params = new URLSearchParams();
  if(currentFilters.q) params.set('q', currentFilters.q);
  if(currentFilters.city) params.set('city', currentFilters.city);
  if(currentFilters.service) params.set('service', currentFilters.service);
  const newUrl = window.location.pathname + (params.toString() ? '?'+params.toString() : '');
  window.history.replaceState({}, '', newUrl);
}

function getFilteredClinics(){
  let list = getAllPublicListings().filter(c=>{
    if(currentFilters.q && !c.name.toLowerCase().includes(currentFilters.q) && !c.city.toLowerCase().includes(currentFilters.q)) return false;
    if(currentFilters.city && c.city !== currentFilters.city) return false;
    if(currentFilters.service && !c.services.includes(currentFilters.service)) return false;
    if(currentFilters.selectedServices && currentFilters.selectedServices.length){
      const hasAny = currentFilters.selectedServices.some(s=>c.services.includes(s));
      if(!hasAny) return false;
    }
    if(currentFilters.price && c.priceRange !== currentFilters.price) return false;
    if(currentFilters.rating && c.rating < currentFilters.rating) return false;
    if(currentFilters.openNow && !isOpenNow(c.hours)) return false;
    if(currentFilters.verified && !c.verified) return false;
    return true;
  });

  list.forEach(c => {
    c._distance = (userLocation && typeof c.lat === 'number')
      ? distanceKm(userLocation.lat, userLocation.lng, c.lat, c.lng)
      : null;
  });

  if(mapBoundsFilterActive && currentMapBounds){
    list = list.filter(c => typeof c.lat === 'number' && currentMapBounds.contains([c.lat, c.lng]));
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
      if(userLocation && !mapBoundsFilterActive){
        list.sort((a,b)=>(a._distance ?? 1e9)-(b._distance ?? 1e9));
      } else {
        list.sort((a,b)=> (b.verified-a.verified) || b.rating-a.rating);
      }
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
  renderMapMarkers(list, !!opts.fitMap);

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
    clearDistanceBtn.style.display = distanceIsCause ? 'inline-flex' : 'none';
    return;
  }
  empty.style.display = 'none';
  resultsGrid.style.display = viewMode === 'list' ? 'grid' : 'none';
  mapSplit.style.display = viewMode === 'map' ? 'grid' : 'none';
  if(viewMode === 'map' && leafletMap){
    setTimeout(()=>{ leafletMap.invalidateSize(); }, 30);
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
  if(mode==='map' && leafletMap){
    setTimeout(()=>{ leafletMap.invalidateSize(); }, 60);
  }
  renderResults({fitMap: mode==='map'});
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

function renderMapMarkers(list, fit){
  if(!leafletMap || !markersLayer) return;
  markersLayer.clearLayers();
  Object.keys(markerRefs).forEach(k => delete markerRefs[k]);
  const points = [];

  list.forEach(c => {
    if(typeof c.lat !== 'number') return;
    const marker = L.marker([c.lat, c.lng], {icon: buildMarkerIcon(c)});
    marker.bindPopup(`
      <div class="map-pin-popup">
        <img src="${clinicImageUrl(c.images[0], 240, 130)}" alt="${c.name}">
        <h5>${c.name}</h5>
        ${starRow(c.rating)}
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

  if(fit){
    if(points.length === 1){
      leafletMap.setView(points[0], 14);
    } else if(points.length > 1){
      leafletMap.fitBounds(points, {padding:[40,40], maxZoom:14});
    } else if(userLocation){
      leafletMap.setView([userLocation.lat, userLocation.lng], 13);
    }
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
  if(!leafletMap || !haloLayer || typeof c.lat !== 'number') return;
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
      renderResults({fitMap:true});
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
  userCircle = L.circle([userLocation.lat, userLocation.lng], {
    radius: NEARBY_RADIUS_KM * 1000, color:'#0EA5A3', weight:1.5, fillColor:'#0EA5A3', fillOpacity:0.07
  }).addTo(leafletMap);
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
