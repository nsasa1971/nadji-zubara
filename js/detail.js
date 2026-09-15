/* Logika stranice pojedinačne ordinacije (ordinacija.html) */

document.addEventListener('DOMContentLoaded', () => {
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
});


function renderClinic(c){
  document.title = c.name + ' — Nađi Zubara';
  document.getElementById('pageTitle').textContent = c.name + ' — Nađi Zubara';

  document.getElementById('coverImg').src = clinicImageUrl(c.images[0], 1600, 500);
  document.getElementById('coverImg').alt = c.name;

  const avatarBox = document.getElementById('avatarBox');
  avatarBox.textContent = c.logoInitials;
  avatarBox.style.background = c.logoColor;

  document.getElementById('clinicName').textContent = c.name;
  document.getElementById('verifiedBadge').style.display = c.verified ? 'inline-flex' : 'none';
  document.getElementById('clinicShort').innerHTML =
    `<span style="display:inline-flex;width:14px;height:14px;vertical-align:-2px;margin-right:4px;color:var(--muted)">${ICONS.location}</span>${c.address}`;

  const extra = getExtraReviews(c.id);
  const totalReviewCount = c.reviewCount + extra.length;
  const hasReviews = totalReviewCount > 0;

  document.getElementById('clinicStars').innerHTML = hasReviews
    ? starRow(c.rating)
    : `<span style="color:var(--muted);font-size:13.5px;">Nema recenzija još</span>`;
  document.getElementById('reviewCountLine').textContent = hasReviews ? (totalReviewCount + ' recenzija') : '';

  const hoursKnown = !c.hoursUnknown;
  const open = hoursKnown ? isOpenNow(c.hours) : null;
  const statusHtml = hoursKnown
    ? `<span class="status-pill ${open?'open':'closed'}">${open?'Otvoreno sada':'Zatvoreno'}</span>`
    : `<span class="status-pill" style="color:var(--muted);">Radno vreme nepoznato</span>`;
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
  if(c.phone){
    callBtn.href = 'tel:' + c.phone.replace(/\s/g,'');
    callBtn.style.display = '';
  } else {
    callBtn.style.display = 'none';
  }

  document.getElementById('directionsChip').href = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(c.address);
  document.getElementById('websiteChip').href = c.website;
  document.getElementById('websiteChip').style.display = (c.website && c.website !== '#') ? '' : 'none';
  document.getElementById('websiteLink').href = c.website;
  document.getElementById('websiteLink').textContent = c.website.replace(/^https?:\/\//,'');
  document.getElementById('phoneLink').href = 'tel:' + c.phone.replace(/\s/g,'');
  document.getElementById('phoneLink').textContent = c.phone || 'Nije dostupno';

  const emailLine = document.getElementById('emailLine');
  if(emailLine){
    if(c.email){
      emailLine.style.display = '';
      emailLine.querySelector('a').href = 'mailto:' + c.email;
      emailLine.querySelector('a').textContent = c.email;
    } else {
      emailLine.style.display = 'none';
    }
  }

  document.getElementById('clinicDescription').textContent = c.description;

  document.getElementById('galleryGrid').innerHTML = c.images.map(img =>
    `<img src="${clinicImageUrl(img, 320, 220)}" alt="${c.name}" loading="lazy">`
  ).join('');

  // Radno vreme
  const order = ['mon','tue','wed','thu','fri','sat','sun'];
  const today = todayKey();
  document.getElementById('hoursTable').innerHTML = order.map(k=>`
    <tr class="${k===today?'today':''}">
      <td>${DAY_LABELS[k]}</td>
      <td>${hoursKnown ? (c.hours[k] ? c.hours[k] : 'Zatvoreno') : 'Pozovite ordinaciju'}</td>
    </tr>`).join('');

  document.getElementById('addressText').textContent = c.address;
  document.getElementById('mapFrame').src = 'https://www.google.com/maps?q=' + encodeURIComponent(c.address) + '&output=embed';

  // Usluge
  document.getElementById('servicesList').innerHTML = c.services.map(slug => `
    <li>
      <span class="s-name"><span class="icon-wrap" style="background:var(--primary-light);color:var(--primary-dark);">${serviceIcon(slug)}</span> ${serviceName(slug)}</span>
      <span class="s-price">Kontaktirajte za cenu</span>
    </li>`).join('');

  renderReviews(c);
  renderSimilar(c);
}

function renderReviews(c){
  const extra = getExtraReviews(c.id);
  const allReviews = extra.concat(c.reviews);
  const totalCount = c.reviewCount + extra.length;
  const hasReviews = totalCount > 0;

  document.getElementById('tabReviewCount').textContent = totalCount;
  document.getElementById('reviewCountLine').textContent = hasReviews ? (totalCount + ' recenzija') : '';
  document.getElementById('reviewScoreBig').textContent = hasReviews ? c.rating.toFixed(1) : '—';
  document.getElementById('reviewScoreStars').innerHTML = hasReviews ? starRow(c.rating) : '';
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

function renderSimilar(c){
  let similar = CLINICS.filter(x => x.id !== c.id && x.city === c.city);
  if(similar.length < 3){
    const others = CLINICS.filter(x => x.id !== c.id && x.city !== c.city)
      .sort((a,b)=>b.rating-a.rating);
    similar = similar.concat(others).slice(0,3);
  } else {
    similar = similar.slice(0,3);
  }
  document.getElementById('similarGrid').innerHTML = similar.map(renderClinicCard).join('');
  bindFavoriteButtons(document.getElementById('similarGrid'));
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

function renderBookingCard(c){
  const card = document.getElementById('bookingCard');
  if(!c.featured){
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
  serviceSelect.innerHTML = c.services.map(slug => `<option value="${slug}">${serviceName(slug)}</option>`).join('');

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
