/* Početna stranica: brojevi iz podataka, gradovi, usluge, preuzeti profili, "Blizu mene".
   Sav sadržaj koji ide u HTML prolazi kroz esc(). Elementi koje popunjava JS su u HTML-u sakriveni
   (hidden) dok se ne popune, pa bez JS-a nema praznih mesta. Zavisi od: services.js, data.js,
   imported-clinics.js, imported-coords.js, safe.js, profile-overrides.js, cards.js. */
(function(){
  const fmt = n => Number(n).toLocaleString('sr-RS');
  const $ = id => document.getElementById(id);
  // 1 ordinacija, 2-4 ordinacije, 5-20 ordinacija, 21 ordinacija, 22 ordinacije ...
  function ordWord(n){ const m10 = n % 10, m100 = n % 100; return (m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14)) ? 'ordinacije' : 'ordinacija'; }

  // isto pravilo kao slugify() u tools/build_pages.py (adrese /<grad>/)
  function citySlug(name){
    return String(name)
      .replace(/đ/g, 'dj').replace(/Đ/g, 'Dj')
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  }

  function initSearchForm(){
    const form = $('heroSearchForm');
    if(!form) return;
    const citySel = form.querySelector('[name="city"]');
    citySel.innerHTML = '<option value="">Svi gradovi</option>' +
      getAllCityNames().map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    const svcSel = form.querySelector('[name="service"]');
    const counts = getServiceCounts();
    const available = SERVICES.filter(s => counts[s.slug] > 0);
    svcSel.innerHTML = '<option value="">Sve usluge</option>' +
      available.map(s => `<option value="${esc(s.slug)}">${esc(s.name)} (${fmt(counts[s.slug])})</option>`).join('');
    // polje "Usluga" tek kad ima šta da se bira (pravilo od ranije: više od jedne usluge)
    $('heroServiceField').hidden = !(available.length > 1);
    if(available.length <= 1) svcSel.disabled = true;

    form.addEventListener('submit', e => {
      e.preventDefault();
      const p = new URLSearchParams();
      const city = citySel.value, service = svcSel.disabled ? '' : svcSel.value, q = form.querySelector('[name="q"]').value.trim();
      if(city) p.set('city', city);
      if(service) p.set('service', service);
      if(q) p.set('q', q);
      location.href = 'pretraga.html' + (p.toString() ? '?' + p.toString() : '');
    });

    // "Blizu mene": lokacija se traži tek na klik; rezultat se prenosi pretrazi (sessionStorage, kratko važi)
    const near = $('heroNearBtn'), msg = $('heroNearMsg');
    near.addEventListener('click', () => {
      msg.hidden = true;
      if(!navigator.geolocation){ msg.textContent = 'Vaš pregledač ne podržava određivanje lokacije.'; msg.hidden = false; return; }
      near.disabled = true;
      navigator.geolocation.getCurrentPosition(pos => {
        try{ sessionStorage.setItem('nz_near', JSON.stringify({lat: pos.coords.latitude, lng: pos.coords.longitude, t: Date.now()})); }catch(e){}
        location.href = 'pretraga.html?blizu=1';
      }, () => {
        near.disabled = false;
        msg.textContent = 'Lokacija nije dostupna. Dozvolite pristup lokaciji ili izaberite grad.';
        msg.hidden = false;
      }, {enableHighAccuracy:true, timeout:8000, maximumAge:300000});
    });
  }

  function initNumbers(all, cityNames){
    const line = $('homeCount');
    if(!line || !cityNames.length) return;
    $('statOrdinacije').textContent = fmt(all.length);
    $('statGradovi').textContent = fmt(cityNames.length);
    line.hidden = false;
  }

  function initCities(all, cityNames){
    const byCity = {};
    all.forEach(c => { byCity[c.city] = (byCity[c.city] || 0) + 1; });
    document.querySelectorAll('.home-tile-count[data-city]').forEach(n => {
      const k = byCity[n.getAttribute('data-city')];
      if(k){ n.textContent = fmt(k) + ' ' + ordWord(k); n.hidden = false; }
    });
    const list = $('allCitiesList'), box = $('homeAllCities'), btn = $('allCitiesBtn');
    if(!list || !btn || !cityNames.length) return;
    const sorted = cityNames.slice().sort((a, b) => a.localeCompare(b, 'sr'));
    list.innerHTML = sorted.map(n => `<li><a href="${esc(citySlug(n))}/">${esc(n)}</a> <span>(${fmt(byCity[n] || 0)})</span></li>`).join('');
    $('allCitiesN').textContent = fmt(sorted.length);
    btn.hidden = false;
    btn.addEventListener('click', () => {
      const open = box.hidden;
      box.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if(open) box.scrollIntoView({behavior:'smooth', block:'nearest'});
    });
  }

  function initServices(){
    SERVICE_CATALOG.forEach(cat => {
      const ic = document.querySelector(`[data-service-icon="${cat.key}"]`);
      if(ic && typeof ICONS !== 'undefined' && ICONS[cat.icon]) ic.innerHTML = ICONS[cat.icon];
    });
    const all = document.querySelector('[data-svc-all-icon]');
    if(all && typeof ICONS !== 'undefined' && ICONS.arrowRight) all.innerHTML = ICONS.arrowRight;
  }

  // preuzeti profili po većim gradovima (gradovi iz mozaika); sekcija se prikazuje tek kad ih ima
  function initClaimed(all){
    const sec = $('preuzeti'), box = $('claimedByCity');
    if(!sec || !box) return;
    const cities = Array.from(document.querySelectorAll('.home-tile[href] .home-tile-count[data-city]')).map(n => n.getAttribute('data-city'));
    let shown = 0;
    cities.forEach(city => {
      const list = all.filter(c => c.claimed && c.city === city)
        .sort((a, b) => ((b.approvedImages ? b.approvedImages.length : 0) - (a.approvedImages ? a.approvedImages.length : 0)))
        .slice(0, 3);
      if(!list.length) return;
      const group = document.createElement('div');
      group.className = 'home-cgroup';
      group.innerHTML = `<div class="home-cgroup-head"><h3>${esc(city)}</h3><a href="${esc(citySlug(city))}/">Sve ordinacije u gradu →</a></div><div class="cards-grid">${list.map(c => renderClinicCard(c)).join('')}</div>`;
      box.appendChild(group);
      bindFavoriteButtons(group);
      shown++;
    });
    if(shown) sec.hidden = false;
  }

  function init(){
    try{
      const all = getAllPublicListings();
      const cityNames = getAllCityNames();
      initSearchForm();
      initNumbers(all, cityNames);
      initCities(all, cityNames);
      initServices();
      initClaimed(all);
    } catch(e){ /* stranica ostaje upotrebljiva i bez dinamičkog dela */ }
    document.querySelectorAll('[data-icon]').forEach(n => { const k = n.getAttribute('data-icon'); if(typeof ICONS !== 'undefined' && ICONS[k] && !n.innerHTML) n.innerHTML = ICONS[k]; });
  }
  document.addEventListener('DOMContentLoaded', () => (window.profilesReady || Promise.resolve()).then(init));
})();
