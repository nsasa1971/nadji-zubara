/* Deljena logika za renderovanje kartice ordinacije, koristi se na
   početnoj strani, stranici pretrage i na dnu strane ordinacije. */

// Vraća samo omiljene koje i dalje postoje: stari id-jevi obrisanih (demo)
// ordinacija iz localStorage-a se ignorišu, a pri sledećem upisu i brišu.
// Pozadina inicijala ordinacije: ako bela slova na njoj imaju kontrast ispod 4.5:1, boja se zatamnjuje (isti ton).
function avatarBg(hex){
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if(!m) return hex || '#0B857F';
  let rgb = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  for(let i = 0; i < 20 && 1.05 / (lum(rgb) + .05) < 4.5; i++) rgb = rgb.map(v => Math.round(v * .93));
  return '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
}

function getFavorites(){
  let ids;
  try{ ids = JSON.parse(localStorage.getItem('nz_favorites') || '[]'); }
  catch(e){ return []; }
  if(!Array.isArray(ids)) return [];
  return (typeof getClinicById === 'function') ? ids.filter(id => getClinicById(id)) : ids;
}
function toggleFavorite(id){
  let favs = getFavorites();
  if(favs.includes(id)) favs = favs.filter(x=>x!==id);
  else favs.push(id);
  localStorage.setItem('nz_favorites', JSON.stringify(favs));
  return favs.includes(id);
}

// Udaljenost za prikaz: ako je lokacija samo približna (pin na ulici, ne na kući), piše "oko X km".
function formatDistance(c, km){
  const text = km.toFixed(1) + ' km';
  return c && c.coordsPrecision === 'ulica' ? 'oko ' + text : text;
}

function scoreFromRating(rating){
  return (rating*2).toFixed(1);
}

function renderClinicCard(c, opts){
  opts = opts || {};
  const hoursKnown = !c.hoursUnknown;
  const open = hoursKnown ? openNowState(c.hours) : null;
  const hasReviews = c.reviewCount > 0;
  const favs = getFavorites();
  const isFav = favs.includes(c.id);
  const mainService = knownServices(c.services)[0];   // bez usluge nema ni oznake
  const distance = !hasVerifiedCoords(c) ? null : (typeof c._distance === 'number') ? c._distance : (typeof opts.distanceKm === 'number' ? opts.distanceKm : null);
  return `
  <article class="clinic-card" data-id="${c.id}">
    <div class="thumb">
      <a href="ordinacija.html?id=${c.id}"><img src="${clinicImageUrl(c.images[0], 500, 380)}" alt="${esc(c.name)}" data-cover-id="${esc(c.id)}" loading="lazy"></a>
      <div class="badges-top">
        <div class="chip-group">
          ${c.featured ? `<span class="chip chip-premium">${ICONS.sparkle} Premium</span>` : ''}
          ${c.priceRange ? `<span class="chip">${priceLabel(c.priceRange)}</span>` : ''}
          ${hasReviews ? `<span class="chip chip-score">${scoreFromRating(c.rating)}</span>` : ''}
          ${open===null ? '' : `<span class="chip ${open?'chip-open':'chip-closed'}">${open?'OTVORENO':'ZATVORENO'}</span>`}
        </div>
        <button class="fav-btn ${isFav?'active':''}" data-fav="${c.id}" title="Sačuvaj u omiljene" aria-label="Sačuvaj u omiljene">
          ${isFav?ICONS.heartFilled:ICONS.heart}
        </button>
      </div>
      <div class="avatar"${c.logoPath ? ' data-logo-id="' + esc(c.id) + '" data-logo-size="38"' : ''} style="background:${avatarBg(c.logoColor)}">${c.logoImage ? `<img src="${c.logoImage}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">` : c.logoInitials}</div>
    </div>
    <div class="body">
      <div class="name-row">
        <h3><a href="ordinacija.html?id=${c.id}">${esc(c.name)}</a></h3>
        ${c.verified ? `<span class="badge-verified-inline" title="Potvrđen profil">${ICONS.checkCircle} Potvrđen profil</span>` : ''}
        ${c.featured ? `<span class="premium-badge-inline" title="Premium ordinacija">${ICONS.sparkle} Premium</span>` : ''}
      </div>
      <p class="muted-line">${esc(c.address)}</p>
      <div class="meta-row">
        ${hasReviews ? starRow(c.rating) : `<span style="color:var(--muted);font-size:13px;">Nema recenzija još</span>`}
        ${hasReviews ? `<span>${c.reviewCount} recenzija${distance!=null ? ` <span class="distance-chip">• ${formatDistance(c, distance)}</span>` : ''}</span>` : (distance!=null ? `<span class="distance-chip">${formatDistance(c, distance)}</span>` : '')}
      </div>
      <div class="reveal-info">
        ${isValidPhone(c.phone) ? `<div class="reveal-row">${ICONS.phone} ${esc(c.phone)}</div>` : ''}
      </div>
      ${mainService ? `<div class="tag-row">
        <a class="tag tag-link" href="pretraga.html?service=${encodeURIComponent(SERVICE_INDEX[mainService].category)}" title="Sve ordinacije: ${serviceName(SERVICE_INDEX[mainService].category)}">${serviceName(SERVICE_INDEX[mainService].category)}</a>
        ${c.services.length>1 ? `<span class="tag">+${c.services.length-1} usluge</span>` : ''}
      </div>` : ''}
      <div class="actions">
        ${isValidPhone(c.phone)
          ? `<a class="btn btn-outline-navy btn-sm" href="tel:${c.phone.replace(/\s/g,'')}">${ICONS.phone} Pozovi</a>`
          : ''}
        <a class="btn btn-primary btn-sm" href="ordinacija.html?id=${c.id}">Detalji</a>
      </div>
    </div>
  </article>`;
}

function bindFavoriteButtons(root=document){
  if(typeof hydrateCovers === 'function') hydrateCovers(root);   // odobrene slike vlasnika (potpisani URL-ovi)
  root.querySelectorAll('[data-fav]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.preventDefault();
      const id = btn.getAttribute('data-fav');
      const active = toggleFavorite(id);
      btn.classList.toggle('active', active);
      btn.innerHTML = active ? ICONS.heartFilled : ICONS.heart;
    });
  });
}
