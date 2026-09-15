/* Zajednička logika: mobilni meni, footer godina, i sadržaj početne strane. */

document.addEventListener('DOMContentLoaded', () => {
  // Mobilni meni
  const burger = document.getElementById('burgerBtn');
  const mobileNav = document.getElementById('mobileNav');
  if(burger && mobileNav){
    burger.addEventListener('click', () => {
      mobileNav.classList.toggle('open');
      burger.innerHTML = mobileNav.classList.contains('open') ? ICONS.close : ICONS.menu;
    });
    mobileNav.querySelectorAll('a').forEach(a=>{
      a.addEventListener('click', ()=>{
        mobileNav.classList.remove('open');
        burger.innerHTML = ICONS.menu;
      });
    });
  }

  // Footer godina
  document.querySelectorAll('[data-year]').forEach(el => el.textContent = new Date().getFullYear());

  // Popuni ikone sa data-icon atributom
  document.querySelectorAll('[data-icon]').forEach(el=>{
    const name = el.getAttribute('data-icon');
    if(ICONS[name]) el.innerHTML = ICONS[name];
  });

  initHeroSearch();
  renderHomepage();
});

function initHeroSearch(){
  const form = document.getElementById('heroSearchForm');
  if(!form) return;
  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const city = form.querySelector('[name="city"]').value;
    const service = form.querySelector('[name="service"]').value;
    const q = form.querySelector('[name="q"]').value;
    const params = new URLSearchParams();
    if(city) params.set('city', city);
    if(service) params.set('service', service);
    if(q) params.set('q', q);
    window.location.href = 'pretraga.html' + (params.toString() ? '?'+params.toString() : '');
  });
}

function renderHomepage(){
  if(typeof CLINICS === 'undefined') return;
  const cityFilterSelect = document.querySelector('#heroSearchForm [name="city"]');
  if(cityFilterSelect){
    cityFilterSelect.innerHTML = '<option value="">Svi gradovi</option>' +
      getAllCityNames().map(name=>`<option value="${name}">${name}</option>`).join('');
  }
  const serviceSelect = document.querySelector('#heroSearchForm [name="service"]');
  if(serviceSelect){
    serviceSelect.innerHTML = '<option value="">Sve usluge</option>' +
      SERVICES.map(s=>`<option value="${s.slug}">${s.name}</option>`).join('');
  }

  const allListings = getAllPublicListings();
  const allCityCount = getAllCityNames().length;

  const heroBadgeText = document.getElementById('heroBadgeText');
  if(heroBadgeText){
    heroBadgeText.textContent = `Preko ${allListings.length.toLocaleString('sr-RS')} ordinacija u ${allCityCount} gradova širom Srbije`;
  }

  // Statistika u hero sekciji
  const statOrdinacije = document.getElementById('statOrdinacije');
  if(statOrdinacije){
    document.getElementById('statOrdinacije').textContent = allListings.length + '+';
    document.getElementById('statGradovi').textContent = allCityCount;
    const totalReviews = allListings.reduce((a,c)=>a+c.reviewCount,0);
    document.getElementById('statRecenzije').textContent = totalReviews.toLocaleString('sr-RS') + '+';
    const avgRating = (CLINICS.reduce((a,c)=>a+c.rating,0)/CLINICS.length).toFixed(1);
    document.getElementById('statOcena').textContent = avgRating;
  }

  // Izdvojene ordinacije (najbolje ocenjene)
  const featuredGrid = document.getElementById('featuredGrid');
  if(featuredGrid){
    const featured = [...CLINICS].sort((a,b)=>b.rating-a.rating || b.reviewCount-a.reviewCount).slice(0,6);
    featuredGrid.innerHTML = featured.map(c=>renderClinicCard(c)).join('');
    bindFavoriteButtons(featuredGrid);
  }

  // Gradovi (slajder)
  const citySliderTrack = document.getElementById('citySliderTrack');
  if(citySliderTrack){
    const cardsHtml = CITIES.map(c=>{
      const count = allListings.filter(x => x.city === c.name).length;
      return `
      <a class="city-card" href="pretraga.html?city=${encodeURIComponent(c.name)}">
        <img src="${c.img}" alt="${c.name}" loading="lazy">
        <div class="cc-content">
          <h4>${c.name}</h4>
          <span>${count} ordinacija${count===1?'a':''}</span>
        </div>
      </a>`;
    }).join('');
    // Sadržaj se duplira radi neprekidnog (beskonačnog) efekta klizanja.
    citySliderTrack.innerHTML = cardsHtml + cardsHtml;
  }
}
