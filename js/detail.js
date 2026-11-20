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
  bindReviewForm(clinic);
  renderBookingCard(clinic);
  bindBookingForm(clinic);
}


// Ocena prikazana na stranici: ako ordinacija nema ugrađenu ocenu (uvezene),
// a postoje recenzije ostavljene u ovom pregledaču, računa se njihov prosek.
function effectiveRating(c, extra){
  if(c.reviewCount > 0 || !extra.length) return c.rating;
  return extra.reduce((a,r)=>a+r.rating,0) / extra.length;
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

  const extra = getExtraReviews(c.id);
  const totalReviewCount = c.reviewCount + extra.length;
  const hasReviews = totalReviewCount > 0;

  document.getElementById('clinicStars').innerHTML = hasReviews
    ? starRow(effectiveRating(c, extra))
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
    (c.claimed && !c.description) ? 'Ordinacija još nije dodala opis.' : c.description;

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
  const extra = getExtraReviews(c.id);
  const allReviews = extra.concat(c.reviews);
  const totalCount = c.reviewCount + extra.length;
  const hasReviews = totalCount > 0;

  document.getElementById('tabReviewCount').textContent = totalCount;
  // Recenzije se prikazuju samo ako postoje (bez prijave nema ni ostavljanja novih).
  const reviewChip = document.getElementById('reviewChip');
  const reviewTab = document.querySelector('.tab-btn[data-tab="recenzije"]');
  if(reviewChip) reviewChip.style.display = hasReviews ? '' : 'none';
  if(reviewTab) reviewTab.style.display = hasReviews ? '' : 'none';
  document.getElementById('reviewCountLine').textContent = hasReviews ? (totalCount + ' recenzija') : '';
  document.getElementById('reviewScoreBig').textContent = hasReviews ? effectiveRating(c, extra).toFixed(1) : '—';
  document.getElementById('reviewScoreStars').innerHTML = hasReviews ? starRow(effectiveRating(c, extra)) : '';
  document.getElementById('reviewScoreCount').textContent = hasReviews ? (totalCount + ' recenzija') : 'Nema recenzija još';

  const session = getSession();
  document.getElementById('reviewsList').innerHTML = allReviews.map(r => {
    const isOwner = session && r.username && r.username === session.username;
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
      ${isOwner ? `
        <div class="review-owner-actions">
          <button type="button" data-edit-review="${r.id}">Izmeni</button>
          <button type="button" class="danger" data-delete-review="${r.id}">Obriši</button>
        </div>` : ''}
    </div>`;
  }).join('');

  bindReviewOwnerActions(c);
}

function bindReviewOwnerActions(c){
  document.querySelectorAll('[data-edit-review]').forEach(btn => {
    btn.addEventListener('click', () => startEditReview(c, btn.getAttribute('data-edit-review')));
  });
  document.querySelectorAll('[data-delete-review]').forEach(btn => {
    btn.addEventListener('click', () => {
      if(!window.confirm('Da li ste sigurni da želite da obrišete ovu recenziju?')) return;
      deleteExtraReview(c.id, btn.getAttribute('data-delete-review'));
      renderReviews(c);
    });
  });
}

function startEditReview(c, reviewId){
  const review = getExtraReviews(c.id).find(r => r.id === reviewId);
  if(!review) return;
  const form = document.getElementById('reviewForm');
  form.querySelector('[name="editId"]').value = reviewId;
  form.querySelector('[name="rating"]').value = review.rating;
  form.querySelector('[name="text"]').value = review.text;
  document.getElementById('reviewSubmitBtn').textContent = 'Sačuvaj izmenu';
  document.getElementById('reviewCancelEditBtn').style.display = 'inline-flex';
  document.querySelector('[data-tab="recenzije"]').click();
  document.getElementById('reviewFormWrap').scrollIntoView({behavior:'smooth', block:'center'});
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

function bindReviewForm(c){
  const loginPrompt = document.getElementById('reviewLoginPrompt');
  const formWrap = document.getElementById('reviewFormWrap');
  const session = getSession();

  if(!session){
    loginPrompt.style.display = 'block';
    formWrap.style.display = 'none';
    document.getElementById('reviewLoginBtn').href = 'prijava.html?redirect=' + encodeURIComponent('ordinacija.html?id=' + c.id);
    return;
  }

  loginPrompt.style.display = 'none';
  formWrap.style.display = 'block';
  document.getElementById('reviewAsName').textContent = session.name;

  const form = document.getElementById('reviewForm');
  const cancelBtn = document.getElementById('reviewCancelEditBtn');

  cancelBtn.addEventListener('click', () => {
    form.reset();
    form.querySelector('[name="editId"]').value = '';
    document.getElementById('reviewSubmitBtn').textContent = 'Objavi recenziju';
    cancelBtn.style.display = 'none';
  });

  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const editId = form.querySelector('[name="editId"]').value;
    const rating = Number(form.querySelector('[name="rating"]').value);
    const text = form.querySelector('[name="text"]').value.trim();
    if(!text) return;

    if(editId){
      updateExtraReview(c.id, editId, {rating, text});
      form.querySelector('[name="editId"]').value = '';
      document.getElementById('reviewSubmitBtn').textContent = 'Objavi recenziju';
      cancelBtn.style.display = 'none';
    } else {
      const review = {
        id: 'rev-' + Date.now(),
        username: session.username,
        name: session.name,
        rating, text,
        date: new Date().toLocaleDateString('sr-RS', {day:'numeric', month:'long', year:'numeric'})
      };
      saveExtraReview(c.id, review);
    }

    renderReviews(c);
    form.reset();

    document.querySelector('[data-tab="recenzije"]').click();
    document.getElementById('reviewsList').scrollIntoView({behavior:'smooth', block:'start'});
  });
}

/* ---------- Online zakazivanje termina (Premium) ---------- */

// Online zakazivanje je isključeno dok ne postoje prava prijava i slanje zahteva ordinaciji.
// Umesto kartice za zakazivanje prikazuje se kartica sa dugmetom "Pozovi" i linkom za prijavu
// netačnog podatka. Kad se omogući zakazivanje, ovde postaviti true.
const BOOKING_ENABLED = false;

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
  card.style.display = BOOKING_ENABLED ? 'none' : '';
}

function renderBookingCard(c){
  const card = document.getElementById('bookingCard');
  renderContactActionsCard(c);
  if(!BOOKING_ENABLED || !c.featured){
    card.style.display = 'none';
    return;
  }
  card.style.display = 'block';

  const session = getSession();
  const loginPrompt = document.getElementById('bookingLoginPrompt');
  const form = document.getElementById('bookingForm');
  const successBox = document.getElementById('bookingSuccess');
  successBox.style.display = 'none';

  if(!session){
    loginPrompt.style.display = 'block';
    form.style.display = 'none';
    document.getElementById('bookingLoginBtn').href = 'prijava.html?redirect=' + encodeURIComponent('ordinacija.html?id=' + c.id);
    return;
  }

  loginPrompt.style.display = 'none';
  form.style.display = 'block';

  const serviceSelect = document.getElementById('bookingServiceSelect');
  serviceSelect.innerHTML = knownServices(c.services).map(slug => `<option value="${slug}">${serviceName(slug)}</option>`).join('');

  const dateInput = document.getElementById('bookingDateInput');
  const todayStr = new Date().toISOString().slice(0,10);
  dateInput.min = todayStr;
  dateInput.value = todayStr;

  renderTimeSlotsForDate(c, dateInput.value);
  dateInput.addEventListener('change', () => renderTimeSlotsForDate(c, dateInput.value));
}

function renderTimeSlotsForDate(c, dateStr){
  const wrap = document.getElementById('bookingTimeSlots');
  const submitBtn = document.getElementById('bookingSubmitBtn');
  if(!dateStr){ wrap.innerHTML = ''; submitBtn.disabled = true; return; }

  const date = new Date(dateStr + 'T00:00:00');
  const dayKey = DAY_KEYS[date.getDay()];
  const range = c.hours[dayKey];

  if(!range){
    wrap.innerHTML = `<span style="color:var(--muted);font-size:13.5px;">Ordinacija ne radi ovog dana. Izaberite drugi datum.</span>`;
    submitBtn.disabled = true;
    return;
  }

  const [start, end] = range.split('-');
  const startHour = Number(start.split(':')[0]);
  const endHour = Number(end.split(':')[0]);

  const slots = [];
  for(let h = startHour; h < endHour; h++){
    slots.push(`${String(h).padStart(2,'0')}:00`);
  }

  const bookedTimes = getAllAppointments()
    .filter(a => a.clinicId === c.id && a.date === dateStr)
    .map(a => a.time);

  wrap.innerHTML = slots.map(t => {
    const taken = bookedTimes.includes(t);
    return `<button type="button" class="time-slot${taken ? ' taken' : ''}" data-slot="${t}" ${taken ? 'disabled title="Zauzeto"' : ''}>${t}</button>`;
  }).join('');
  submitBtn.disabled = true;

  wrap.querySelectorAll('.time-slot:not(.taken)').forEach(btn => {
    btn.addEventListener('click', () => {
      wrap.querySelectorAll('.time-slot').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      submitBtn.disabled = false;
    });
  });
}

function bindBookingForm(c){
  if(!BOOKING_ENABLED) return;
  const form = document.getElementById('bookingForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const selectedSlot = document.querySelector('#bookingTimeSlots .time-slot.selected');
    if(!selectedSlot) return;

    const service = form.querySelector('[name="service"]').value;
    const date = form.querySelector('[name="date"]').value;
    const note = form.querySelector('[name="note"]').value.trim();

    addAppointment({
      clinicId: c.id,
      clinicName: c.name,
      service,
      serviceLabel: serviceName(service),
      date,
      time: selectedSlot.getAttribute('data-slot'),
      note
    });

    form.style.display = 'none';
    document.getElementById('bookingSuccess').style.display = 'block';
  });
}
