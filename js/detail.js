/* Logika stranice pojedinačne ordinacije (ordinacija.html) */

document.addEventListener('DOMContentLoaded', () => {
  // sačekaj objavljene profile (najviše 1,5 s) da stranica odmah prikaže izmene vlasnika
  (window.profilesReady || Promise.resolve()).then(initClinicPage);
});

function initClinicPage(){
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const clinic = id ? getClinicById(id) : null;

  if(!clinic){
    document.getElementById('notFound').style.display = 'block';
    return;
  }
  document.getElementById('detailContent').style.display = 'block';
  renderClinic(clinic);
  bindTabs();
  bindActions(clinic);
  renderContactActionsCard(clinic);
}


function renderClinic(c){
  const contactBase = '&clinic=' + encodeURIComponent(c.name) + '&city=' + encodeURIComponent(c.city) +
    '&id=' + encodeURIComponent(c.id);
  const reportLink = document.getElementById('reportLink');
  if(reportLink) reportLink.href = 'kontakt.html?subject=netacan-podatak' + contactBase;
  const removeLink = document.getElementById('removeLink');
  if(removeLink) removeLink.href = 'kontakt.html?subject=uklanjanje-profila' + contactBase;
  // preuzet profil: uklanjanje ide preko vlasnika ili administratora (link "Prijavi netačan podatak" ostaje)
  const removeWrap = document.getElementById('removeWrap');
  if(removeWrap) removeWrap.style.display = c.claimed ? 'none' : '';
  document.title = c.name + ' — Nađi Zubara';
  document.getElementById('pageTitle').textContent = c.name + ' — Nađi Zubara';

  document.getElementById('coverImg').src = clinicImageUrl(c.images[0], 1600, 500);
  document.getElementById('coverImg').alt = c.name;
  document.getElementById('coverImg').setAttribute('data-cover-id', c.id);   // odobrena slika vlasnika zamenjuje opštu

  const avatarBox = document.getElementById('avatarBox');
  avatarBox.textContent = c.logoInitials;
  avatarBox.style.background = c.logoColor;

  document.getElementById('clinicName').textContent = c.name;
  document.getElementById('verifiedBadge').style.display = c.verified ? 'inline-flex' : 'none';
  document.getElementById('clinicShort').innerHTML =
    `<span style="display:inline-flex;width:14px;height:14px;vertical-align:-2px;margin-right:4px;color:var(--muted)">${ICONS.location}</span>${esc(c.address)}`;

  const totalReviewCount = c.reviewCount;
  const hasReviews = totalReviewCount > 0;

  document.getElementById('clinicStars').innerHTML = hasReviews
    ? starRow(c.rating)
    : `<span style="color:var(--muted);font-size:13.5px;">Nema recenzija još</span>`;
  document.getElementById('reviewCountLine').textContent = hasReviews ? (totalReviewCount + ' recenzija') : '';

  const hoursKnown = !c.hoursUnknown;
  const open = hoursKnown ? openNowState(c.hours) : null;
  const statusHtml = !hoursKnown
    ? `<span class="status-pill" style="color:var(--muted);">Radno vreme nepoznato</span>`
    : (open === null
        ? `<span class="status-pill" style="color:var(--muted);">Pogledajte radno vreme</span>`
        : `<span class="status-pill ${open?'open':'closed'}">${open?'Otvoreno sada':'Zatvoreno'}</span>`);
  document.getElementById('statusPillTop').innerHTML = statusHtml;
  document.getElementById('statusPillSide').innerHTML = statusHtml;

  const priceBox = document.getElementById('priceRangeBox');
  const priceWrap = priceBox.closest('.price-range-box');
  if(c.priceRange){
    priceBox.textContent = priceLabel(c.priceRange);
    priceWrap.style.display = '';
  } else {
    priceWrap.style.display = 'none';
  }

  const callBtn = document.getElementById('callNowBtn');
  if(isValidPhone(c.phone)){
    callBtn.href = 'tel:' + c.phone.replace(/\s/g,'');
    callBtn.style.display = '';
  } else {
    callBtn.style.display = 'none';
  }

  document.getElementById('directionsChip').href = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(c.address);
  const siteUrl = (c.website && c.website !== '#') ? safeUrl(c.website) : '';   // samo http/https
  document.getElementById('websiteChip').href = siteUrl || '#';
  document.getElementById('websiteChip').style.display = siteUrl ? '' : 'none';
  document.getElementById('websiteLink').href = siteUrl || '#';
  document.getElementById('websiteLink').textContent = siteUrl ? siteUrl.replace(/^https?:\/\//,'') : '';
  const phoneOk = isValidPhone(c.phone);
  document.getElementById('phoneLink').href = phoneOk ? 'tel:' + c.phone.replace(/\s/g,'') : '#';
  document.getElementById('phoneLink').textContent = phoneOk ? c.phone : 'Nije dostupno';


  // preuzet profil bez opisa: bez šablona "Ako ste vlasnik..."; nepreuzete ordinacije ostaju kao pre
  document.getElementById('clinicDescription').textContent =
    (c.claimed && !c.description) ? 'Ordinacija još nije dodala opis.'
    : (PLACEHOLDER_DESCRIPTION_RE.test(c.description || '') ? 'Opis ove ordinacije još nije dostupan. Ako ste vlasnik ove ordinacije, potvrdite i uredite profil.' : c.description);

  // Radno vreme
  const order = ['mon','tue','wed','thu','fri','sat','sun'];
  const today = todayKey();
  document.getElementById('hoursTable').innerHTML = order.map(k=>`
    <tr class="${k===today?'today':''}">
      <td>${DAY_LABELS[k]}</td>
      <td>${esc(!hoursKnown ? 'Pozovite ordinaciju' : (c.hours[k] ? c.hours[k] : (c.hoursFromProfile ? 'Nije navedeno' : 'Zatvoreno')))}</td>
    </tr>`).join('');

  document.getElementById('addressText').textContent = c.address;
  document.getElementById('mapFrame').src = 'https://www.google.com/maps?q=' + encodeURIComponent(c.address) + '&output=embed';

  // Usluge: sekcija (tab) se prikazuje samo kad ordinacija ima bar jednu uslugu iz kataloga
  const serviceKeys = knownServices(c.services);
  const servicesTab = document.querySelector('.tab-btn[data-tab="usluge"]');
  if(servicesTab) servicesTab.style.display = serviceKeys.length ? '' : 'none';
  // Izvor usluga (sajt ordinacije), ako postoji: "Usluge prema sajtu ordinacije" + link
  const srcNote = document.getElementById('servicesSourceNote');
  if(srcNote){
    if(serviceKeys.length && c.servicesSource){
      const link = document.getElementById('servicesSourceLink');
      link.href = c.servicesSource;
      link.textContent = 'izvor: ' + c.servicesSource.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
      srcNote.style.display = '';
    } else {
      srcNote.style.display = 'none';
    }
  }
  document.getElementById('servicesList').innerHTML = serviceKeys.map(slug => `
    <li>
      <span class="s-name"><span class="icon-wrap" style="background:var(--primary-light);color:var(--primary-dark);">${serviceIcon(slug)}</span> <a class="s-link" href="pretraga.html?service=${encodeURIComponent(slug)}" title="Sve ordinacije: ${serviceName(slug)}">${serviceName(slug)}</a></span>
    </li>`).join('');

  renderProfileExtras(c);
  renderReviews(c);
  renderSimilar(c);
  if(typeof hydrateCovers === 'function') hydrateCovers(document);
}

// Dodaci iz profila koji je preuzeo vlasnik: dodatni telefoni, društvene mreže, tim, fotografije.
const SOCIAL_LABELS = {facebook:'Facebook', instagram:'Instagram', linkedin:'LinkedIn', tiktok:'TikTok', youtube:'YouTube'};
function renderProfileExtras(c){
  // dodatni telefoni (prvi je već prikazan)
  const more = document.getElementById('morePhones');
  if(more){
    more.textContent = '';
    (c.phones || []).slice(1).forEach(p => {
      const a = el('a', {href:'tel:' + p.replace(/\s/g,'')}, p);
      more.appendChild(el('p', {style:'margin:0 0 6px;'}, [a]));
    });
  }
  // društvene mreže
  const soc = document.getElementById('socialsLine');
  if(soc){
    soc.textContent = '';
    const keys = Object.keys(c.socials || {});
    keys.forEach((k, i) => {
      const u = safeUrl(c.socials[k]);
      if(!u || !SOCIAL_LABELS[k]) return;
      if(soc.childNodes.length) soc.appendChild(document.createTextNode(' · '));
      soc.appendChild(el('a', {href:u, target:'_blank', rel:'noopener nofollow ugc'}, SOCIAL_LABELS[k]));
    });
    soc.style.display = soc.childNodes.length ? '' : 'none';
  }
  // tim (samo odobren, bez fotografija)
  const teamCard = document.getElementById('teamCard');
  if(teamCard){
    const list = document.getElementById('teamList');
    list.textContent = '';
    (c.team || []).forEach(m => {
      list.appendChild(el('li', {}, [el('strong', {}, m.name)].concat(m.role ? [document.createTextNode(' — ' + m.role)] : [])));
    });
    teamCard.style.display = (c.team && c.team.length) ? '' : 'none';
  }
  // fotografije: odeljak tek sa 2 ili više odobrenih slika
  const photosCard = document.getElementById('photosCard');
  if(photosCard){
    const paths = c.approvedImages || [];
    if(paths.length >= 2 && typeof PF !== 'undefined'){
      PF.signUrls(paths).then(urls => {
        const grid = document.getElementById('photosGrid');
        grid.textContent = '';
        paths.forEach(p => { if(urls[p]){ const im = el('img', {alt: c.name, loading:'lazy'}); im.src = urls[p]; grid.appendChild(im); } });
        photosCard.style.display = grid.childNodes.length >= 2 ? '' : 'none';
      });
    } else photosCard.style.display = 'none';
  }
}

function renderReviews(c){
  const allReviews = c.reviews;
  const totalCount = c.reviewCount;
  const hasReviews = totalCount > 0;

  document.getElementById('tabReviewCount').textContent = totalCount;
  // Recenzije se prikazuju samo ako postoje u podacima; ostavljanje recenzija nije omogućeno.
  const reviewChip = document.getElementById('reviewChip');
  const reviewTab = document.querySelector('.tab-btn[data-tab="recenzije"]');
  if(reviewChip) reviewChip.style.display = hasReviews ? '' : 'none';
  if(reviewTab) reviewTab.style.display = hasReviews ? '' : 'none';
  document.getElementById('reviewCountLine').textContent = hasReviews ? (totalCount + ' recenzija') : '';
  document.getElementById('reviewScoreBig').textContent = hasReviews ? c.rating.toFixed(1) : '—';
  document.getElementById('reviewScoreStars').innerHTML = hasReviews ? starRow(c.rating) : '';
  document.getElementById('reviewScoreCount').textContent = hasReviews ? (totalCount + ' recenzija') : 'Nema recenzija još';

  document.getElementById('reviewsList').innerHTML = allReviews.map(r => {
    return `
    <div class="review-item">
      <div class="review-head">
        <div class="review-avatar">${r.name.charAt(0)}</div>
        <div class="review-meta">
          <b>${r.name}</b>
          <span>${r.date}</span>
        </div>
      </div>
      ${starRow(r.rating)}
      <p>${r.text}</p>
      ${r.reply ? `
        <div style="background:var(--bg);border-radius:10px;padding:12px 14px;margin-top:10px;">
          <b style="font-size:12.5px;color:var(--navy);">Odgovor ordinacije ${c.name}:</b>
          <p style="margin:4px 0 0;font-size:13.5px;">${r.reply.text}</p>
        </div>` : ''}
    </div>`;
  }).join('');

}

// Slične ordinacije: isti grad, bez ocena; najbliže po udaljenosti ako
// postoje koordinate, inače redom kojim su u podacima.
function renderSimilar(c){
  const grid = document.getElementById('similarGrid');
  let similar = getAllPublicListings().filter(x => x.id !== c.id && x.city === c.city);
  if(hasVerifiedCoords(c)){
    const d = x => hasVerifiedCoords(x)
      ? distanceKm(c.lat, c.lng, x.lat, x.lng) : 1e9;
    similar.sort((a,b) => d(a) - d(b));
  }
  similar = similar.slice(0,3);
  // sekcija (naslov + kartice) se krije ako u gradu nema drugih ordinacija
  const section = grid.previousElementSibling;
  if(!similar.length){
    grid.style.display = 'none';
    if(section) section.style.display = 'none';
    return;
  }
  grid.innerHTML = similar.map(x => renderClinicCard(x)).join('');
  bindFavoriteButtons(grid);
}

function bindTabs(){
  document.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-'+btn.getAttribute('data-tab')).classList.add('active');
    });
  });
}

function bindActions(c){
  const bookmarkChip = document.getElementById('bookmarkChip');
  const isFav = getFavorites().includes(c.id);
  updateBookmarkChip(bookmarkChip, isFav);
  bookmarkChip.addEventListener('click', ()=>{
    const active = toggleFavorite(c.id);
    updateBookmarkChip(bookmarkChip, active);
  });

  const shareChip = document.getElementById('shareChip');
  shareChip.addEventListener('click', ()=>{
    const url = window.location.href;
    const done = () => {
      const original = shareChip.innerHTML;
      shareChip.innerHTML = `${ICONS.check} Link kopiran!`;
      setTimeout(()=>{ shareChip.innerHTML = original; }, 2000);
    };
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(url).then(done).catch(()=>window.prompt('Kopirajte link:', url));
    } else {
      window.prompt('Kopirajte link:', url);
    }
  });
}

function updateBookmarkChip(chip, active){
  chip.classList.toggle('active', active);
  chip.innerHTML = active
    ? `${ICONS.heartFilled} Sačuvano`
    : `${ICONS.heart} Sačuvaj`;
}

// Kartica "Pozovite ordinaciju": dugme "Pozovi" samo za važeći telefon + link "Prijavi netačan podatak".
function renderContactActionsCard(c){
  const card = document.getElementById('contactActionsCard');
  if(!card) return;
  const callBtn = document.getElementById('cardCallBtn');
  if(isValidPhone(c.phone)){
    callBtn.href = 'tel:' + c.phone.replace(/\s/g,'');
    callBtn.style.display = '';
  } else {
    callBtn.style.display = 'none';
  }
  const reportLink = document.getElementById('reportLink');
  document.getElementById('cardReportLink').href = reportLink ? reportLink.getAttribute('href') : 'kontakt.html?subject=netacan-podatak';
  const claimLink = document.getElementById('claimLink');
  claimLink.href = 'preuzmi.html?id=' + encodeURIComponent(c.id);
  claimLink.textContent = 'Ovo je moja ordinacija';
  if(c.claimed){
    // preuzeta ordinacija: nema poziva na preuzimanje; verifikovanom vlasniku se nudi "Izmeni profil"
    claimLink.style.display = 'none';
    if(typeof PF !== 'undefined' && PF.myVerifiedClaim){
      PF.myVerifiedClaim(c.id).then(ok => {
        if(!ok) return;
        claimLink.textContent = 'Izmeni profil';
        claimLink.href = 'izmena-profila.html?id=' + encodeURIComponent(c.id);
        claimLink.style.display = '';
      });
    }
  } else {
    claimLink.style.display = '';
  }
  card.style.display = '';
}
