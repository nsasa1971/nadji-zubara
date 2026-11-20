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
