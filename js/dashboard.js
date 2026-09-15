/* Logika stranice naloga (nalog.html) — prilagođena ulozi (pacijent / vlasnik ordinacije). */

document.addEventListener('DOMContentLoaded', () => {
  const session = requireLogin('nalog.html');
  if(!session) return;

  renderDashUser(session);
  applyRoleVisibility(session.role);
  bindDashTabs();
  bindLogout();
  renderStats(session.role);
  renderWelcomeCard(session.role);
  renderAppointments();
  renderMyListings();
  renderOwnerAppointments();
  renderOwnerReviews();
  renderSaved();
  bindSettingsForm(session);
  bindRoleSwitch(session);
  bindBlockSlotForm();

  const hash = window.location.hash.replace('#', '');
  if(hash) selectDashTab(hash);
});

function renderDashUser(session){
  document.getElementById('dashAvatar').textContent = initialsOf(session.name);
  document.getElementById('dashName').textContent = session.name;
  document.getElementById('dashRole').textContent = session.role === 'business' ? 'Vlasnik ordinacije' : 'Pacijent';
}

function applyRoleVisibility(role){
  document.querySelectorAll('[data-role]').forEach(el => {
    el.style.display = (el.getAttribute('data-role') === role) ? '' : 'none';
  });
}

function bindDashTabs(){
  document.querySelectorAll('.dash-nav-item[data-dash-tab]').forEach(btn => {
    btn.addEventListener('click', () => selectDashTab(btn.getAttribute('data-dash-tab')));
  });
}

function selectDashTab(tab){
  const btn = document.querySelector(`.dash-nav-item[data-dash-tab="${tab}"]`);
  const panel = document.getElementById('dash-' + tab);
  if(!btn || !panel) return;
  // Ne dozvoli prelazak na tab koji nije namenjen trenutnoj ulozi (npr. iz stare veze/hash-a).
  if(btn.hasAttribute('data-role') && btn.style.display === 'none') return;

  document.querySelectorAll('.dash-nav-item[data-dash-tab]').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  panel.classList.add('active');
}

function bindLogout(){
  document.getElementById('dashLogoutBtn').addEventListener('click', () => {
    clearSession();
    window.location.href = 'index.html';
  });
}

function renderStats(role){
  const grid = document.getElementById('dashStatsGrid');
  if(role === 'business'){
    const listings = getMyListings();
    const listingIds = listings.map(l => l.id);
    const ownerAppts = getAllAppointments().filter(a => listingIds.includes(a.clinicId) && !a.blocked);
    const reviewCount = listings.reduce((sum, l) => sum + getExtraReviews(l.id).length, 0);
    const planOrder = {besplatno:0, standard:1, premium:2};
    const planLabels = {besplatno:'Besplatno', standard:'Standard', premium:'Premium'};
    let bestPlan = null;
    listings.forEach(l => { if(bestPlan === null || planOrder[l.plan] > planOrder[bestPlan]) bestPlan = l.plan; });

    grid.innerHTML = `
      <div class="dash-stat"><b>${listings.length}</b><span>Vaših oglasa</span></div>
      <div class="dash-stat"><b>${ownerAppts.length}</b><span>Termina kod vas</span></div>
      <div class="dash-stat"><b>${reviewCount}</b><span>Recenzija</span></div>
      <div class="dash-stat"><b>${bestPlan ? planLabels[bestPlan] : '—'}</b><span>Trenutni paket</span></div>
    `;
  } else {
    const appointments = getMyAppointments();
    const saved = getFavorites();
    grid.innerHTML = `
      <div class="dash-stat"><b>${appointments.length}</b><span>Zakazanih termina</span></div>
      <div class="dash-stat"><b>${saved.length}</b><span>Sačuvanih ordinacija</span></div>
    `;
  }
}

function renderWelcomeCard(role){
  const card = document.getElementById('welcomeCard');
  if(role === 'business'){
    const hasListings = getMyListings().length > 0;
    card.innerHTML = `
      <h3><span data-icon="sparkle"></span> Dobrodošli nazad!</h3>
      <p style="color:var(--muted);margin-bottom:18px;">Upravljajte oglasima svojih ordinacija, odgovarajte na recenzije pacijenata i pratite zakazane termine.</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        ${hasListings
          ? `<button type="button" class="btn btn-primary" data-goto-tab="moji-oglasi">Moji oglasi</button>`
          : `<a href="dodaj-ordinaciju.html" class="btn btn-primary">Dodaj ordinaciju</a>`}
        <button type="button" class="btn btn-outline-navy" data-goto-tab="recenzije-vlasnik">Odgovori na recenzije</button>
      </div>`;
  } else {
    card.innerHTML = `
      <h3><span data-icon="sparkle"></span> Dobrodošli nazad!</h3>
      <p style="color:var(--muted);margin-bottom:18px;">Pratite svoje zakazane termine i sačuvane omiljene ordinacije.</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <a href="pretraga.html" class="btn btn-primary">Pronađi ordinaciju</a>
        <button type="button" class="btn btn-outline-navy" data-goto-tab="termini">Moji termini</button>
      </div>`;
  }
  card.querySelectorAll('[data-goto-tab]').forEach(btn => {
    btn.addEventListener('click', () => selectDashTab(btn.getAttribute('data-goto-tab')));
  });
  document.querySelectorAll('#welcomeCard [data-icon]').forEach(el=>{
    const name = el.getAttribute('data-icon');
    if(ICONS[name]) el.innerHTML = ICONS[name];
  });
}

function renderAppointments(){
  const wrap = document.getElementById('appointmentsWrap');
  if(!wrap) return;
  const appointments = getMyAppointments().filter(a => !a.blocked);

  if(appointments.length === 0){
    wrap.innerHTML = `
      <div class="empty-dash">
        ${ICONS.calendar}
        <h4>Još uvek nemate zakazanih termina</h4>
        <p>Ordinacije sa Premium paketom nude online zakazivanje termina direktno sa svog profila.</p>
        <a href="pretraga.html" class="btn btn-primary" style="margin-top:14px;">Pronađi ordinaciju</a>
      </div>`;
    return;
  }

  const dateFmt = (d) => new Date(d + 'T00:00:00').toLocaleDateString('sr-RS', {day:'numeric', month:'long', year:'numeric'});

  wrap.innerHTML = appointments.map(a => `
    <div class="appt-row" data-appt-id="${a.id}">
      <div class="appt-icon">${ICONS.calendar}</div>
      <div class="info">
        <h4>${a.clinicName}</h4>
        <span class="meta">${a.serviceLabel || a.service} • ${dateFmt(a.date)} u ${a.time}</span>
      </div>
      <span class="appt-status">Zakazano</span>
      <button type="button" class="btn btn-ghost btn-sm" data-cancel-appt="${a.id}">Otkaži</button>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-cancel-appt]').forEach(btn => {
    btn.addEventListener('click', () => {
      if(!window.confirm('Da li ste sigurni da želite da otkažete ovaj termin?')) return;
      cancelAppointment(btn.getAttribute('data-cancel-appt'));
      renderAppointments();
      renderStats(getSession().role);
    });
  });
}

function renderMyListings(){
  const wrap = document.getElementById('myListingsWrap');
  if(!wrap) return;
  const listings = getMyListings();

  if(listings.length === 0){
    wrap.innerHTML = `
      <div class="empty-dash">
        ${ICONS.building}
        <h4>Još uvek nemate dodatih ordinacija</h4>
        <p>Dodajte svoju prvu ordinaciju i pojaviće se ovde — i uživo u pretrazi sajta.</p>
        <a href="dodaj-ordinaciju.html" class="btn btn-primary" style="margin-top:14px;">Dodaj ordinaciju</a>
      </div>`;
    return;
  }

  const planLabels = {besplatno:'Besplatno', standard:'Standard', premium:'Premium'};

  wrap.innerHTML = listings.map(l => `
    <div class="listing-row" data-listing-id="${l.id}">
      <div class="thumb-sm" style="background:${l.logoColor || '#0EA5A3'}">${l.logoImage ? `<img src="${l.logoImage}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">` : (l.name||'O').charAt(0).toUpperCase()}</div>
      <div class="info">
        <h4>${l.name}</h4>
        <span class="plan-tag ${l.plan}">${planLabels[l.plan] || l.plan}</span>
      </div>
      <a href="ordinacija.html?id=${l.id}" class="btn btn-ghost btn-sm">Pogledaj</a>
      <a href="dodaj-ordinaciju.html?edit=${l.id}" class="btn btn-outline-navy btn-sm">Uredi</a>
      <a href="cenovnik.html?listing=${l.id}" class="btn btn-ghost btn-sm">Promeni paket</a>
      <button type="button" class="btn btn-ghost btn-sm" data-remove-listing="${l.id}">Ukloni</button>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-remove-listing]').forEach(btn => {
    btn.addEventListener('click', () => {
      if(!window.confirm('Da li ste sigurni da želite da uklonite ovu ordinaciju sa sajta?')) return;
      removeMyListing(btn.getAttribute('data-remove-listing'));
      renderMyListings();
      renderStats(getSession().role);
      renderWelcomeCard(getSession().role);
    });
  });
}

/* ---------- Termini kod mene (vlasnik) ---------- */

function renderOwnerAppointments(){
  const wrap = document.getElementById('ownerAppointmentsWrap');
  if(!wrap) return;
  const listings = getMyListings();
  const listingIds = listings.map(l => l.id);
  const items = getAllAppointments().filter(a => listingIds.includes(a.clinicId));

  populateBlockListingSelect(listings);
  document.getElementById('blockSlotCard').style.display = listings.length ? 'block' : 'none';

  if(listings.length === 0){
    wrap.innerHTML = `
      <div class="empty-dash">
        ${ICONS.calendar}
        <h4>Prvo dodajte ordinaciju</h4>
        <p>Kada dodate ordinaciju sa Premium paketom, termini koje pacijenti zakažu će se prikazivati ovde.</p>
        <a href="dodaj-ordinaciju.html" class="btn btn-primary" style="margin-top:14px;">Dodaj ordinaciju</a>
      </div>`;
    return;
  }

  if(items.length === 0){
    wrap.innerHTML = `
      <div class="empty-dash">
        ${ICONS.calendar}
        <h4>Još uvek nema zakazanih termina</h4>
        <p>Termini koje pacijenti zakažu online pojaviće se ovde. Vaša ordinacija mora imati Premium paket da bi nudila online zakazivanje.</p>
        <a href="cenovnik.html" class="btn btn-primary" style="margin-top:14px;">Pogledaj pakete</a>
      </div>`;
    return;
  }

  const dateFmt = (d) => new Date(d + 'T00:00:00').toLocaleDateString('sr-RS', {day:'numeric', month:'long', year:'numeric'});

  wrap.innerHTML = items.map(a => `
    <div class="appt-row" data-appt-id="${a.id}">
      <div class="appt-icon">${a.blocked ? ICONS.close : ICONS.calendar}</div>
      <div class="info">
        <h4>${a.blocked ? (a.note || 'Blokiran termin') : a.patientName}</h4>
        <span class="meta">${a.clinicName} • ${a.serviceLabel || ''} ${a.serviceLabel ? '•' : ''} ${dateFmt(a.date)} u ${a.time}</span>
      </div>
      <span class="appt-status" style="${a.blocked ? 'background:var(--bg);color:var(--muted);' : ''}">${a.blocked ? 'Blokirano' : 'Zakazano'}</span>
      <button type="button" class="btn btn-ghost btn-sm" data-cancel-owner-appt="${a.id}">${a.blocked ? 'Ukloni blokadu' : 'Otkaži'}</button>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-cancel-owner-appt]').forEach(btn => {
    btn.addEventListener('click', () => {
      cancelAppointment(btn.getAttribute('data-cancel-owner-appt'));
      renderOwnerAppointments();
      renderStats(getSession().role);
    });
  });
}

function populateBlockListingSelect(listings){
  const select = document.getElementById('blockListingSelect');
  if(!select) return;
  select.innerHTML = listings.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
}

function bindBlockSlotForm(){
  const form = document.getElementById('blockSlotForm');
  if(!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const listingId = form.querySelector('[name="listingId"]').value;
    const date = form.querySelector('[name="date"]').value;
    const time = form.querySelector('[name="time"]').value;
    const reason = form.querySelector('[name="reason"]').value.trim();
    const listing = getMyListingById(listingId);
    if(!listing || !date || !time) return;

    addAppointment({
      clinicId: listingId,
      clinicName: listing.name,
      service: null,
      serviceLabel: reason || 'Blokiran termin',
      date, time,
      note: reason,
      blocked: true
    });
    form.reset();
    renderOwnerAppointments();
  });
}

/* ---------- Recenzije (vlasnik) ---------- */

function renderOwnerReviews(){
  const wrap = document.getElementById('ownerReviewsWrap');
  if(!wrap) return;
  const listings = getMyListings();

  if(listings.length === 0){
    wrap.innerHTML = `
      <div class="empty-dash">
        ${ICONS.chat}
        <h4>Prvo dodajte ordinaciju</h4>
        <p>Kada pacijenti počnu da ostavljaju recenzije, moći ćete da im odgovorite ovde.</p>
        <a href="dodaj-ordinaciju.html" class="btn btn-primary" style="margin-top:14px;">Dodaj ordinaciju</a>
      </div>`;
    return;
  }

  const allReviews = [];
  listings.forEach(l => {
    getExtraReviews(l.id).forEach(r => allReviews.push(Object.assign({listingId: l.id, listingName: l.name}, r)));
  });

  if(allReviews.length === 0){
    wrap.innerHTML = `
      <div class="empty-dash">
        ${ICONS.chat}
        <h4>Još uvek nema recenzija</h4>
        <p>Recenzije koje pacijenti ostave na vašim ordinacijama pojaviće se ovde.</p>
      </div>`;
    return;
  }

  wrap.innerHTML = allReviews.map(r => `
    <div class="info-card">
      <div class="review-head">
        <div class="review-avatar">${r.name.charAt(0)}</div>
        <div class="review-meta">
          <b>${r.name}</b>
          <span>${r.listingName} • ${r.date}</span>
        </div>
      </div>
      ${starRow(r.rating)}
      <p>${r.text}</p>
      <div id="reply-view-${r.id}">
        ${r.reply ? `
          <div style="background:var(--bg);border-radius:10px;padding:12px 14px;margin-top:10px;">
            <b style="font-size:13px;color:var(--navy);">Vaš odgovor:</b>
            <p style="margin:4px 0 0;font-size:13.5px;">${r.reply.text}</p>
          </div>` : ''}
      </div>
      <button type="button" class="btn btn-outline-navy btn-sm" style="margin-top:12px;" data-reply-toggle="${r.id}">${r.reply ? 'Izmeni odgovor' : 'Odgovori'}</button>
      <form class="reply-form" id="reply-form-${r.id}" data-listing-id="${r.listingId}" data-review-id="${r.id}" style="display:none;margin-top:12px;">
        <textarea name="reply" placeholder="Napišite odgovor na ovu recenziju..." style="width:100%;min-height:70px;border:1.5px solid var(--border);border-radius:10px;padding:10px 12px;font-family:inherit;font-size:14px;">${r.reply ? r.reply.text : ''}</textarea>
        <button type="submit" class="btn btn-primary btn-sm" style="margin-top:8px;">Sačuvaj odgovor</button>
      </form>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-reply-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const form = document.getElementById('reply-form-' + btn.getAttribute('data-reply-toggle'));
      form.style.display = form.style.display === 'none' ? 'block' : 'none';
    });
  });

  wrap.querySelectorAll('.reply-form').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const listingId = form.getAttribute('data-listing-id');
      const reviewId = form.getAttribute('data-review-id');
      const text = form.querySelector('[name="reply"]').value.trim();
      if(!text) return;
      updateExtraReview(listingId, reviewId, {reply: {text, date: new Date().toLocaleDateString('sr-RS', {day:'numeric', month:'long', year:'numeric'})}});
      renderOwnerReviews();
    });
  });
}

function renderSaved(){
  const grid = document.getElementById('savedGrid');
  if(!grid) return;
  const empty = document.getElementById('savedEmpty');
  const ids = getFavorites();
  const clinics = ids.map(id => getClinicById(id)).filter(Boolean);

  if(clinics.length === 0){
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  grid.innerHTML = clinics.map(c => renderClinicCard(c)).join('');
  bindFavoriteButtons(grid);
}

function bindSettingsForm(session){
  document.getElementById('settingsName').value = session.name;
  document.getElementById('settingsUsername').value = session.username;
  document.getElementById('settingsEmail').value = session.email;

  document.getElementById('settingsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const updated = updateSessionDetails({
      name: document.getElementById('settingsName').value.trim(),
      username: document.getElementById('settingsUsername').value.trim(),
      email: document.getElementById('settingsEmail').value.trim()
    });
    renderDashUser(updated);
    renderAuthArea();
  });
}

function bindRoleSwitch(session){
  const label = document.getElementById('currentRoleLabel');
  const btn = document.getElementById('switchRoleBtn');

  function refresh(s){
    label.textContent = s.role === 'business' ? 'Vlasnik ordinacije' : 'Pacijent';
    btn.textContent = s.role === 'business' ? 'Prebaci na nalog pacijenta' : 'Prebaci na nalog vlasnika ordinacije';
  }
  refresh(session);

  btn.addEventListener('click', () => {
    const current = getSession();
    const updated = switchRole(current.role === 'business' ? 'customer' : 'business');
    refresh(updated);
    renderDashUser(updated);
    renderAuthArea();
    applyRoleVisibility(updated.role);
    renderStats(updated.role);
    renderWelcomeCard(updated.role);
    selectDashTab('pregled');
  });
}
