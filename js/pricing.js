/* Paketi i cenovnik (cenovnik.html).
   Prikazuju se samo cene i kratki opisi; funkcije koje još ne postoje se ne obećavaju.
   Prijava i preuzimanje profila su "uskoro", pa izbor paketa još nije moguć. */

const PLANS = [
  {
    key:'besplatno', name:'Besplatno', price:0,
    desc:'Osnovni profil ordinacije u imeniku.',
    features:['Naziv, adresa i kontakt podaci', 'Prikaz u pretrazi']
  },
  {
    key:'standard', name:'Standard', price:1990,
    desc:'Proširene mogućnosti profila.',
    features:[]
  },
  {
    key:'premium', name:'Premium', price:3990,
    desc:'Najšire mogućnosti isticanja profila.',
    features:[]
  }
];

document.addEventListener('DOMContentLoaded', renderPricingGrid);

function renderPricingGrid(){
  const grid = document.getElementById('pricingGrid');
  if(!grid) return;
  grid.innerHTML = PLANS.map(plan => `
    <div class="pricing-card" data-plan="${plan.key}">
      <h3>${plan.name}</h3>
      <div class="price">${plan.price === 0 ? 'Besplatno' : plan.price.toLocaleString('sr-RS') + ' <span>RSD / mesečno</span>'}</div>
      <p class="plan-desc">${plan.desc}</p>
      ${plan.features.length
        ? `<ul>${plan.features.map(f => `<li>${ICONS.check} ${f}</li>`).join('')}</ul>`
        : `<p class="plan-desc" style="font-size:13.5px;">Spisak funkcija biće objavljen pre uvođenja paketa.</p>`}
      <span class="btn btn-outline-navy btn-block is-soon" aria-disabled="true">Preuzimanje profila · uskoro</span>
    </div>
  `).join('');
}
