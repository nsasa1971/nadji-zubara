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
    // gradovi su ugrađeni u HTML pri build-u; polje "Usluga" se popunjava kad se učitaju podaci (enhanceFromData)
    const citySel = form.querySelector('[name="city"]');
    const svcSel = form.querySelector('[name="service"]');
    svcSel.disabled = true;

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

  // brojevi su ugrađeni u HTML pri build-u (tools/build_pages.py); ovde se samo animiraju pri prvom pojavljivanju
  function initNumbers(){
    const line = $('homeCount');
    if(!line) return;
    [$('statOrdinacije'), $('statGradovi')].forEach(el => {
      if(!el) return;
      const n = parseInt(el.textContent.replace(/\D/g, ''), 10);
      if(n > 0){ el.dataset.target = n; countUp(el, n, line); }
    });
  }

  // brojevi se brzo "dobroje" kad traka prvi put uđe u vidno polje; bez animacije ostaje krajnja vrednost
  function countUp(el, target, trigger){
    if(!el || !('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(es => {
      if(!es.some(e => e.isIntersecting)) return;
      io.disconnect();
      const t0 = performance.now(), dur = 900;
      (function step(now){
        const tg = parseInt(el.dataset.target, 10) || target;   // broj se može povećati dok traje animacija (nove ordinacije iz baze)
        const k = Math.min(1, (now - t0) / dur), v = Math.round(tg * (1 - Math.pow(1 - k, 3)));
        el.textContent = fmt(v);
        if(k < 1) requestAnimationFrame(step); else el.textContent = fmt(tg);
      })(t0);
    }, {threshold: .4});
    io.observe(trigger);
  }

  // pojavljivanje elemenata pri skrolu (opacity + transform); bez JS-a / uz reduced-motion sve je odmah vidljivo
  function initReveal(){
    const d = document.documentElement;
    if(!d.classList.contains('js-anim')) return;
    const els = Array.from(document.querySelectorAll('[data-reveal]'));
    const io = new IntersectionObserver(es => {
      es.forEach(e => { if(e.isIntersecting){ e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, {rootMargin: '0px 0px -8% 0px', threshold: .08});
    els.forEach(el => {
      const sib = Array.from(el.parentElement.children).filter(c => c.hasAttribute('data-reveal'));
      el.style.setProperty('--d', Math.min(sib.indexOf(el), 5) * 70 + 'ms');
      io.observe(el);
    });
    d.setAttribute('data-fx-ready', '1');
  }

  // glatko otvaranje/zatvaranje FAQ (Web Animations API; bez animacije uz reduced-motion)
  function initFaq(){
    if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.querySelectorAll('.home-faq-item').forEach(det => {
      const sum = det.querySelector('summary'), body = det.querySelector('.home-faq-a');
      if(!sum || !body || !body.animate) return;
      let anim = null;
      sum.addEventListener('click', e => {
        e.preventDefault();
        if(anim) anim.cancel();
        if(!det.open){
          det.open = true;
          const h = body.offsetHeight;
          anim = body.animate({height:['0px', h + 'px'], opacity:[0,1]}, {duration:220, easing:'ease-out'});
          anim.onfinish = anim.oncancel = () => { anim = null; };
        } else {
          const h = body.offsetHeight;
          anim = body.animate({height:[h + 'px','0px'], opacity:[1,0]}, {duration:180, easing:'ease-in'});
          anim.onfinish = () => { det.open = false; anim = null; };
          anim.oncancel = () => { anim = null; };
        }
      });
    });
  }

  function initCities(){
    const box = $('homeAllCities'), btn = $('allCitiesBtn');
    if(!btn || !box) return;
    btn.addEventListener('click', () => {
      const open = box.hidden;
      box.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if(open) box.scrollIntoView({behavior:'smooth', block:'nearest'});
    });
  }

  function initServices(){
    // ikone grupa usluga su slike ugrađene u HTML (img/usluge/); ovde samo ikonica "Sve usluge"
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

  // Podaci o ordinacijama (js/imported-clinics.js, ~1,8 MB) se ne učitavaju za prvi prikaz: tek kad korisnik
  // skroluje blizu odeljka sa potvrđenim profilima, ili krene da koristi formu pretrage.
  const DATA_SCRIPTS = ['js/data.js', 'js/imported-clinics.js', 'js/imported-coords.js', 'js/imported-services.js',
                        'js/profile-common.js', 'js/new-clinics.js', 'js/profile-overrides.js', 'js/cards.js'];
  let dataPromise = null;
  function loadData(){
    if(dataPromise) return dataPromise;
    dataPromise = DATA_SCRIPTS.reduce((p, src) => p.then(() => new Promise((res, rej) => {
      const sc = document.createElement('script');
      sc.src = src; sc.async = false; sc.onload = res; sc.onerror = rej;
      document.head.appendChild(sc);
    })), Promise.resolve()).then(() => (window.profilesReady || Promise.resolve())).then(enhanceFromData);
    dataPromise.catch(() => {});   // stranica ostaje upotrebljiva i bez dinamičkog dela
    return dataPromise;
  }

  function enhanceFromData(){
    try{
      const all = getAllPublicListings();
      initServiceSelect();
      initClaimed(all);
      addNewClinicsToNumbers();
    } catch(e){ /* bez dinamičkog dela */ }
  }

  // Objavljene nove ordinacije iz baze dodaju se na statične brojeve (ukupno, gradovi, pločice gradova).
  function addNewClinicsToNumbers(){
    if(typeof NEW_PUBLISHED === 'undefined' || !NEW_PUBLISHED.length) return;
    const num = e => parseInt(e.textContent.replace(/\D/g, ''), 10) || 0;
    const plural = n => (n % 10 === 1 && n % 100 !== 11) ? 'ordinacija' : ((n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? 'ordinacije' : 'ordinacija');
    const total = $('statOrdinacije'), cities = $('statGradovi');
    if(total){ const v = (parseInt(total.dataset.target, 10) || num(total)) + NEW_PUBLISHED.length; total.dataset.target = v; total.textContent = fmt(v); }
    if(cities){
      const known = new Set(getImportedClinics().map(c => c.city));
      const fresh = new Set(NEW_PUBLISHED.map(c => c.city).filter(g => g && g !== 'Nepoznato' && !known.has(g)));
      if(fresh.size){ const v = (parseInt(cities.dataset.target, 10) || num(cities)) + fresh.size; cities.dataset.target = v; cities.textContent = fmt(v); }
    }
    document.querySelectorAll('.home-tile-count[data-city]').forEach(n => {
      const extra = NEW_PUBLISHED.filter(c => c.city === n.getAttribute('data-city')).length;
      if(extra){ const v = num(n) + extra; n.textContent = fmt(v) + ' ' + plural(v); }
    });
  }

  function initServiceSelect(){
    const svcSel = document.querySelector('#heroSearchForm [name="service"]');
    if(!svcSel) return;
    const counts = getServiceCounts();
    const available = SERVICES.filter(s => counts[s.slug] > 0);
    svcSel.innerHTML = '<option value="">Sve usluge</option>' +
      available.map(s => `<option value="${esc(s.slug)}">${esc(s.name)} (${fmt(counts[s.slug])})</option>`).join('');
    if(available.length > 1){ svcSel.disabled = false; $('heroServiceField').hidden = false; }
  }

  function init(){
    try{
      initSearchForm();
      initNumbers();
      initCities();
      initServices();
    } catch(e){ /* stranica ostaje upotrebljiva */ }
    document.querySelectorAll('[data-icon]').forEach(n => { const k = n.getAttribute('data-icon'); if(typeof ICONS !== 'undefined' && ICONS[k] && !n.innerHTML) n.innerHTML = ICONS[k]; });
    initFaq();
    initReveal();
    // lazy učitavanje podataka
    const trigger = () => { loadData(); };
    const sentinel = $('dataSentinel');
    if(sentinel && 'IntersectionObserver' in window){
      const io = new IntersectionObserver(es => { if(es.some(e => e.isIntersecting)){ io.disconnect(); trigger(); } }, {rootMargin:'300px 0px'});
      io.observe(sentinel);
    } else {
      setTimeout(trigger, 3000);
    }
    const form = $('heroSearchForm');
    if(form) form.addEventListener('focusin', trigger, {once:true});
  }
  document.addEventListener('DOMContentLoaded', init);
})();
