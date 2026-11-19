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
    const serviceCounts = getServiceCounts();
    serviceSelect.innerHTML = '<option value="">Sve usluge</option>' +
      // samo usluge koje imaju bar jednu ordinaciju (isto kao filter u pretrazi)
      SERVICES.filter(s => serviceCounts[s.slug] > 0)
        .map(s=>`<option value="${s.slug}">${s.name} (${serviceCounts[s.slug].toLocaleString('sr-RS')})</option>`).join('');
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
    // Recenzije i prosečna ocena se prikazuju samo ako postoje prave recenzije
    // (uvezene ordinacije ih nemaju), inače se ti blokovi sakrivaju.
    const reviewed = allListings.filter(c => c.reviewCount > 0);
    const totalReviews = reviewed.reduce((a,c)=>a+c.reviewCount,0);
    const statRecenzije = document.getElementById('statRecenzije');
    const statOcena = document.getElementById('statOcena');
    if(totalReviews > 0){
      const avgRating = reviewed.reduce((a,c)=>a+c.rating*c.reviewCount,0) / totalReviews;
      statRecenzije.textContent = totalReviews.toLocaleString('sr-RS');
      statOcena.textContent = avgRating.toFixed(1);
    } else {
      statRecenzije.closest('.stat').style.display = 'none';
      statOcena.closest('.stat').style.display = 'none';
    }
  }

  // Izdvojene ordinacije (najbolje ocenjene) — sekcija je skrivena dok ne
  // postoje ordinacije sa pravim recenzijama.
  const featuredGrid = document.getElementById('featuredGrid');
  if(featuredGrid){
    const featured = allListings.filter(c => c.reviewCount > 0)
      .sort((a,b)=>b.rating-a.rating || b.reviewCount-a.reviewCount).slice(0,6);
    const featuredSection = featuredGrid.closest('section');
    if(featured.length){
      featuredGrid.innerHTML = featured.map(c=>renderClinicCard(c)).join('');
      bindFavoriteButtons(featuredGrid);
      if(featuredSection) featuredSection.style.display = '';
    } else if(featuredSection){
      featuredSection.style.display = 'none';
    }
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
