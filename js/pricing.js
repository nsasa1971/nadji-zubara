/* Definicija paketa i logika izbora paketa (cenovnik.html) */

const PLANS = [
  {
    key:'besplatno', name:'Besplatno', price:0, badge:null,
    desc:'Osnovni unos u imenik ordinacija.',
    features:[
      {text:'Osnovni profil ordinacije', included:true},
      {text:'Kontakt podaci i radno vreme', included:true},
      {text:'Do 3 fotografije', included:true},
      {text:'Prikaz u pretrazi i na mapi', included:true},
      {text:'Isticanje u vrhu pretrage', included:false},
      {text:'Sopstveni logo na mapi', included:false},
      {text:'Isticanje na početnoj strani', included:false}
    ]
  },
  {
    key:'standard', name:'Standard', price:1990, badge:null,
    desc:'Za ordinacije koje žele da se izdvoje u pretrazi.',
    features:[
      {text:'Sve iz Besplatnog paketa', included:true},
      {text:'Do 10 fotografija', included:true},
      {text:'Odgovaranje na recenzije', included:true},
      {text:'Prioritet iznad besplatnih oglasa', included:true},
      {text:'Isticanje u vrhu pretrage', included:false},
      {text:'Sopstveni logo na mapi', included:false},
      {text:'Isticanje na početnoj strani', included:false}
    ]
  },
  {
    key:'premium', name:'Premium', price:3990, badge:'Najpopularniji',
    desc:'Maksimalna vidljivost i najviše novih pacijenata.',
    features:[
      {text:'Sve iz Standard paketa', included:true},
      {text:'Neograničen broj fotografija', included:true},
      {text:'Sopstveni logo na mapi', included:true},
      {text:'Isticanje u vrhu pretrage', included:true},
      {text:'Isticanje na početnoj strani', included:true},
      {text:'Online zakazivanje termina', included:true},
      {text:'Prioritetna podrška', included:true}
    ]
  }
];

document.addEventListener('DOMContentLoaded', () => {
  renderPricingGrid();
  bindPlanButtons();
});

function renderPricingGrid(){
  const grid = document.getElementById('pricingGrid');
  if(!grid) return;
  grid.innerHTML = PLANS.map(plan => `
    <div class="pricing-card ${plan.badge ? 'featured' : ''}" data-plan="${plan.key}">
      ${plan.badge ? `<span class="plan-badge">${plan.badge}</span>` : ''}
      <h3>${plan.name}</h3>
      <div class="price">${plan.price.toLocaleString('sr-RS')} <span>RSD / mesečno</span></div>
      <p class="plan-desc">${plan.desc}</p>
      <ul>
        ${plan.features.map(f => `
          <li class="${f.included ? '' : 'disabled'}">${f.included ? ICONS.check : ICONS.close} ${f.text}</li>
        `).join('')}
      </ul>
      <button type="button" class="btn ${plan.badge ? 'btn-primary' : 'btn-outline-navy'} btn-block" data-choose-plan="${plan.key}">
        Izaberi ${plan.name}
      </button>
    </div>
  `).join('');
}

function bindPlanButtons(){
  document.querySelectorAll('[data-choose-plan]').forEach(btn => {
    btn.addEventListener('click', () => handlePlanChoice(btn.getAttribute('data-choose-plan')));
  });
}

function handlePlanChoice(planKey){
  const session = getSession();
  const panel = document.getElementById('planActionPanel');

  if(!session){
    window.location.href = 'prijava.html?redirect=' + encodeURIComponent('cenovnik.html');
    return;
  }

  if(session.role !== 'business'){
    panel.innerHTML = `
      <div class="location-banner warn">
        ${ICONS.info}
        <span class="grow">Paketi za oglašavanje su dostupni vlasnicima ordinacija. Prebacite svoj nalog da biste nastavili.</span>
        <button class="btn btn-dark btn-sm" id="switchToBusinessBtn" type="button">Prebaci se na vlasnika ordinacije</button>
      </div>`;
    panel.scrollIntoView({behavior:'smooth', block:'center'});
    document.getElementById('switchToBusinessBtn').addEventListener('click', () => {
      switchRole('business');
      renderAuthArea();
      handlePlanChoice(planKey);
    });
    return;
  }

  const listings = getMyListings();

  if(listings.length === 0){
    panel.innerHTML = `
      <div class="location-banner warn">
        ${ICONS.info}
        <span class="grow">Prvo dodajte svoju ordinaciju da biste joj mogli dodeliti paket.</span>
        <a href="dodaj-ordinaciju.html" class="btn btn-dark btn-sm">Dodaj ordinaciju</a>
      </div>`;
    panel.scrollIntoView({behavior:'smooth', block:'center'});
    return;
  }

  if(listings.length === 1){
    applyPlanToListing(listings[0].id, planKey);
    return;
  }

  panel.innerHTML = `
    <div class="location-banner">
      ${ICONS.building}
      <span class="grow">Izaberite ordinaciju kojoj dodeljujete paket:</span>
      <select id="listingPickSelect" style="border:1.5px solid var(--border);border-radius:8px;padding:8px 12px;">
        ${listings.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
      </select>
      <button class="btn btn-dark btn-sm" id="confirmListingPickBtn" type="button">Potvrdi</button>
    </div>`;
  panel.scrollIntoView({behavior:'smooth', block:'center'});
  document.getElementById('confirmListingPickBtn').addEventListener('click', () => {
    applyPlanToListing(document.getElementById('listingPickSelect').value, planKey);
  });
}

function applyPlanToListing(listingId, planKey){
  const panel = document.getElementById('planActionPanel');
  const listing = updateListingPlan(listingId, planKey);
  const plan = PLANS.find(p => p.key === planKey);

  panel.innerHTML = `
    <div class="location-banner">
      ${ICONS.checkCircle}
      <span class="grow"><b>${plan.name}</b> paket je aktiviran za ordinaciju <b>${listing ? listing.name : ''}</b>. (Demo — nema pravog naplaćivanja.)</span>
      <a href="nalog.html#moji-oglasi" class="btn btn-dark btn-sm">Pogledaj u nalogu</a>
    </div>`;
  panel.scrollIntoView({behavior:'smooth', block:'center'});
}
