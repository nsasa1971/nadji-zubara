/* Cenovnik (cenovnik.html).
   Prikazuje se samo paket "Besplatno" i ono što zaista postoji. Plaćeni paketi i cene biće
   objavljeni kasnije. Preuzimanje profila već radi: dugme vodi na pretragu. */

const PLANS = [
  {
    key:'besplatno', name:'Besplatno',
    desc:'Osnovni profil ordinacije u imeniku.',
    features:['Naziv, adresa i kontakt podaci', 'Prikaz u pretrazi']
  }
];

document.addEventListener('DOMContentLoaded', renderPricingGrid);

function renderPricingGrid(){
  const grid = document.getElementById('pricingGrid');
  if(!grid) return;
  grid.innerHTML = PLANS.map(plan => `
    <div class="pricing-card" data-plan="${plan.key}">
      <h3>${plan.name}</h3>
      <p class="plan-desc">${plan.desc}</p>
      <ul>${plan.features.map(f => `<li>${ICONS.check} ${f}</li>`).join('')}</ul>
      <a class="btn btn-primary btn-block" href="pretraga.html">Pronađite svoju ordinaciju</a>
    </div>
  `).join('');
}
