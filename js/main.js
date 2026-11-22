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
});

/* Logika početne stranice je u js/home.js. */

/* Dugme "Na vrh": pojavljuje se posle skrolovanja, na svim stranicama koje učitavaju main.js. */
document.addEventListener('DOMContentLoaded', () => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'to-top'; b.hidden = true;
  b.setAttribute('aria-label', 'Na vrh stranice'); b.title = 'Na vrh';
  b.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  document.body.appendChild(b);
  let on = false;
  const upd = () => { const s = window.scrollY > 700; if(s !== on){ on = s; b.hidden = false; b.classList.toggle('is-on', s); if(!s) setTimeout(() => { if(!on) b.hidden = true; }, 200); } };
  window.addEventListener('scroll', upd, {passive:true});
  b.addEventListener('click', () => window.scrollTo({top:0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'}));
});
