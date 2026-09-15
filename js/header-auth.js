/* Prikaz oblasti za prijavu/korisnički meni u zaglavlju — na svim stranicama. */

document.addEventListener('DOMContentLoaded', renderAuthArea);

function initialsOf(name){
  return (name || 'K').trim().split(/\s+/).map(w => w[0]).join('').slice(0,2).toUpperCase();
}

function renderAuthArea(){
  const area = document.getElementById('authArea');
  const mobileArea = document.getElementById('mobileAuthArea');
  if(!area && !mobileArea) return;

  const session = getSession();

  if(!session){
    if(area) area.innerHTML = `<a href="prijava.html" class="icon-btn" aria-label="Prijava / Registracija" title="Prijava / Registracija">${ICONS.user}</a>`;
    if(mobileArea) mobileArea.innerHTML = `<a href="prijava.html">${ICONS.user} Prijava / Registracija</a>`;
    return;
  }

  const initials = initialsOf(session.name);
  const firstName = session.name.split(' ')[0];

  const linksHtml = `
    <a href="nalog.html">${ICONS.list} Dashboard</a>
    <a href="nalog.html#moji-oglasi">${ICONS.building} Moji oglasi</a>
    <a href="cenovnik.html">${ICONS.sparkle} Promocije</a>
    <a href="nalog.html#sacuvano">${ICONS.heart} Sačuvano</a>
    <a href="nalog.html#podesavanja">${ICONS.user} Podešavanja naloga</a>
  `;

  if(area){
    area.innerHTML = `
      <div class="user-menu">
        <button class="user-menu-trigger" id="userMenuTrigger" type="button">
          <span class="user-avatar-sm">${initials}</span>
          <span class="user-menu-name">${firstName}</span>
          <span class="chev">${ICONS.chevronDown}</span>
        </button>
        <div class="user-menu-dropdown" id="userMenuDropdown">
          ${linksHtml}
          <button type="button" class="logout-btn" id="logoutBtn">${ICONS.close} Odjava</button>
        </div>
      </div>`;

    const trigger = document.getElementById('userMenuTrigger');
    const dropdown = document.getElementById('userMenuDropdown');
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
    document.addEventListener('click', () => dropdown.classList.remove('open'));
    document.getElementById('logoutBtn').addEventListener('click', () => {
      clearSession();
      window.location.href = 'index.html';
    });
  }

  if(mobileArea){
    mobileArea.innerHTML = `
      <div class="mobile-user-block">
        <span class="user-avatar-sm">${initials}</span> ${session.name}
      </div>
      <div class="user-menu-dropdown open">
        ${linksHtml}
        <button type="button" class="logout-btn" id="logoutBtnMobile">${ICONS.close} Odjava</button>
      </div>`;
    const btn = document.getElementById('logoutBtnMobile');
    if(btn) btn.addEventListener('click', () => {
      clearSession();
      window.location.href = 'index.html';
    });
  }
}
