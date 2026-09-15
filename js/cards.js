/* Deljena logika za renderovanje kartice ordinacije, koristi se na
   početnoj strani, stranici pretrage i na dnu strane ordinacije. */

function getFavorites(){
  try{ return JSON.parse(localStorage.getItem('nz_favorites') || '[]'); }
  catch(e){ return []; }
}
function toggleFavorite(id){
  let favs = getFavorites();
  if(favs.includes(id)) favs = favs.filter(x=>x!==id);
  else favs.push(id);
  localStorage.setItem('nz_favorites', JSON.stringify(favs));
  return favs.includes(id);
}

function scoreFromRating(rating){
  return (rating*2).toFixed(1);
}

function renderClinicCard(c, opts){
  opts = opts || {};
  const hoursKnown = !c.hoursUnknown;
  const open = hoursKnown ? isOpenNow(c.hours) : null;
  const hasReviews = c.reviewCount > 0;
  const favs = getFavorites();
  const isFav = favs.includes(c.id);
  const mainService = c.services[0];
  const distance = (typeof c._distance === 'number') ? c._distance : (typeof opts.distanceKm === 'number' ? opts.distanceKm : null);
  return `
  <article class="clinic-card" data-id="${c.id}">
    <div class="thumb">
      <a href="ordinacija.html?id=${c.id}"><img src="${clinicImageUrl(c.images[0], 500, 380)}" alt="${c.name}" loading="lazy"></a>
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
      <div class="avatar" style="background:${c.logoColor}">${c.logoImage ? `<img src="${c.logoImage}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">` : c.logoInitials}</div>
    </div>
    <div class="body">
      <div class="name-row">
        <h3><a href="ordinacija.html?id=${c.id}">${c.name}</a></h3>
        ${c.verified ? `<span title="Verifikovana ordinacija">${ICONS.checkCircle}</span>` : ''}
        ${c.featured ? `<span class="premium-badge-inline" title="Premium ordinacija">${ICONS.sparkle} Premium</span>` : ''}
      </div>
      <p class="muted-line">${c.short}</p>
      <div class="meta-row">
        ${hasReviews ? starRow(c.rating) : `<span style="color:var(--muted);font-size:13px;">Nema recenzija još</span>`}
        ${hasReviews ? `<span>${c.reviewCount} recenzija${distance!=null ? ` <span class="distance-chip">• ${distance.toFixed(1)} km</span>` : ''}</span>` : (distance!=null ? `<span class="distance-chip">${distance.toFixed(1)} km</span>` : '')}
      </div>
      <div class="reveal-info">
        ${c.phone ? `<div class="reveal-row">${ICONS.phone} ${c.phone}</div>` : ''}
        <div class="reveal-row">${ICONS.location} ${c.address}</div>
      </div>
      <div class="tag-row">
        <span class="tag">${serviceName(mainService)}</span>
        ${c.services.length>1 ? `<span class="tag">+${c.services.length-1} usluge</span>` : ''}
      </div>
      <div class="actions">
        ${c.phone
          ? `<a class="btn btn-outline-navy btn-sm" href="tel:${c.phone.replace(/\s/g,'')}">${ICONS.phone} Pozovi</a>`
          : (c.email ? `<a class="btn btn-outline-navy btn-sm" href="mailto:${c.email}">${ICONS.mail} Pošalji mejl</a>` : '')}
        <a class="btn btn-primary btn-sm" href="ordinacija.html?id=${c.id}">Detalji</a>
      </div>
    </div>
  </article>`;
}

function bindFavoriteButtons(root=document){
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
