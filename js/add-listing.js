/* Logika dodavanja/izmene ordinacije (dodaj-ordinaciju.html) — samo UI, bez slanja na server.
   Tok: (1) izbor paketa -> (2) forma sa podacima -> (3) potvrda.
   Ako je prisutan ?edit=<id>, korak 1 se preskače i forma se popunjava postojećim podacima. */

const PLAN_LABELS = {besplatno:'Besplatno', standard:'Standard (1.990 RSD/mesečno)', premium:'Premium (3.990 RSD/mesečno)'};
const PLAN_PHOTO_LIMIT = {
  besplatno:'Prevucite fotografije ovde ili kliknite da izaberete fajlove (do 3 fotografije u Besplatnom paketu).',
  standard:'Prevucite fotografije ovde ili kliknite da izaberete fajlove (do 10 fotografija u Standard paketu).',
  premium:'Prevucite fotografije ovde ili kliknite da izaberete fajlove (neograničen broj fotografija u Premium paketu).'
};

const LOGO_COLORS = ['#0EA5A3','#7C3AED','#2563EB','#DB2777','#D97706','#059669'];

let selectedPlan = 'besplatno';
let editingId = null;
let logoImageData = null;
let logoColor = LOGO_COLORS[Math.floor(Math.random()*LOGO_COLORS.length)];

document.addEventListener('DOMContentLoaded', () => {
  const session = requireLogin('dodaj-ordinaciju.html');
  if(!session) return;

  const params = new URLSearchParams(window.location.search);
  editingId = params.get('edit');

  populateFormOptions();
  bindLogoInput();

  if(editingId){
    const listing = getMyListingById(editingId);
    if(listing){
      selectedPlan = listing.plan || 'besplatno';
      prefillForm(listing);
      document.getElementById('pageHeading').textContent = 'Izmenite podatke o ordinaciji';
      document.getElementById('step-plan').style.display = 'none';
      showFormStep();
    }
  } else {
    bindPlanButtons();
  }

  bindChangePlanButton();
  bindFormSubmit();
});

function bindLogoInput(){
  const input = document.getElementById('logoInput');
  const preview = document.getElementById('logoPreview');
  if(!input) return;

  input.addEventListener('change', () => {
    const file = input.files[0];
    if(!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const size = 160;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(size/img.width, size/img.height);
        const w = img.width*scale, h = img.height*scale;
        ctx.drawImage(img, (size-w)/2, (size-h)/2, w, h);
        logoImageData = canvas.toDataURL('image/jpeg', 0.85);
        preview.innerHTML = `<img src="${logoImageData}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`;
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function populateFormOptions(){
  const citySelect = document.getElementById('citySelectForm');
  if(citySelect){
    citySelect.innerHTML = '<option value="">Izaberite grad</option>' +
      getAllCityNames().map(name=>`<option value="${name}">${name}</option>`).join('');
  }

  const serviceWrap = document.getElementById('serviceCheckboxesForm');
  if(serviceWrap){
    serviceWrap.innerHTML = SERVICES.map(s=>`
      <label class="checkbox-row">
        <input type="checkbox" value="${s.slug}">
        ${s.name}
      </label>`).join('');
  }

  const hoursWrap = document.getElementById('hoursGridForm');
  if(hoursWrap){
    const days = [['mon','Ponedeljak'],['tue','Utorak'],['wed','Sreda'],['thu','Četvrtak'],['fri','Petak'],['sat','Subota'],['sun','Nedelja']];
    hoursWrap.innerHTML = days.map(([key,label])=>`
      <div class="hrow">
        <span>${label}</span>
        <input type="time" name="${key}_from" value="${key==='sat'||key==='sun' ? '' : '08:00'}">
        <input type="time" name="${key}_to" value="${key==='sat'||key==='sun' ? '' : '20:00'}">
        <label><input type="checkbox" name="${key}_closed" ${key==='sun'?'checked':''}> Zatvoreno</label>
      </div>`).join('');
  }
}

function bindPlanButtons(){
  document.querySelectorAll('[data-choose-add-plan]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedPlan = btn.getAttribute('data-choose-add-plan');
      showFormStep();
    });
  });
}

function bindChangePlanButton(){
  const btn = document.getElementById('changePlanBtn');
  if(!btn) return;
  btn.addEventListener('click', () => {
    document.getElementById('step-form').style.display = 'none';
    document.getElementById('step-plan').style.display = 'block';
    window.scrollTo({top:0, behavior:'smooth'});
  });
}

function showFormStep(){
  document.getElementById('step-plan').style.display = 'none';
  document.getElementById('step-form').style.display = 'block';
  document.getElementById('chosenPlanLabel').textContent = PLAN_LABELS[selectedPlan];
  document.getElementById('uploadLimitText').textContent = PLAN_PHOTO_LIMIT[selectedPlan];
  document.getElementById('logoPremiumHint').textContent = selectedPlan === 'premium'
    ? ' — u Premium paketu logo se prikazuje i na mapi umesto opšte oznake sajta.'
    : ' (na mapi se prikazuje opšta oznaka sajta — logo na mapi je Premium funkcionalnost).';
  if(editingId){
    document.getElementById('changePlanBtn').style.display = 'none';
  }
  window.scrollTo({top:0, behavior:'smooth'});
}

function prefillForm(listing){
  const form = document.getElementById('listingForm');
  form.querySelector('[name="name"]').value = listing.name || '';
  form.querySelector('[name="city"]').value = listing.city || '';
  form.querySelector('[name="price"]').value = listing.priceRange || 2;
  form.querySelector('[name="address"]').value = listing.address || '';
  form.querySelector('[name="phone"]').value = listing.phone || '';
  form.querySelector('[name="website"]').value = listing.website || '';
  form.querySelector('[name="description"]').value = listing.description || '';

  (listing.services || []).forEach(slug => {
    const cb = form.querySelector(`#serviceCheckboxesForm input[value="${slug}"]`);
    if(cb) cb.checked = true;
  });

  if(listing.hours){
    Object.keys(listing.hours).forEach(day => {
      const range = listing.hours[day];
      const fromInput = form.querySelector(`[name="${day}_from"]`);
      const toInput = form.querySelector(`[name="${day}_to"]`);
      const closedInput = form.querySelector(`[name="${day}_closed"]`);
      if(!range){
        if(closedInput) closedInput.checked = true;
      } else {
        const [from, to] = range.split('-');
        if(fromInput) fromInput.value = from;
        if(toInput) toInput.value = to;
      }
    });
  }

  if(listing.logoImage){
    logoImageData = listing.logoImage;
    document.getElementById('logoPreview').innerHTML = `<img src="${listing.logoImage}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`;
  } else {
    document.getElementById('logoPreview').textContent = (listing.name||'O').charAt(0).toUpperCase();
  }
  logoColor = listing.logoColor || logoColor;
  document.getElementById('logoPreview').style.background = logoColor;

  document.getElementById('submitListingBtn').textContent = 'Sačuvaj izmene';
}

function collectHours(form){
  const days = ['mon','tue','wed','thu','fri','sat','sun'];
  const hours = {};
  days.forEach(day => {
    const closed = form.querySelector(`[name="${day}_closed"]`).checked;
    if(closed){
      hours[day] = null;
    } else {
      const from = form.querySelector(`[name="${day}_from"]`).value || '08:00';
      const to = form.querySelector(`[name="${day}_to"]`).value || '20:00';
      hours[day] = `${from}-${to}`;
    }
  });
  return hours;
}

function bindFormSubmit(){
  const form = document.getElementById('listingForm');
  const successBox = document.getElementById('successBox');
  if(!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = form.querySelector('[name="name"]').value.trim() || 'Moja ordinacija';
    const city = form.querySelector('[name="city"]').value;
    const priceRange = Number(form.querySelector('[name="price"]').value);
    const address = form.querySelector('[name="address"]').value.trim();
    const phone = form.querySelector('[name="phone"]').value.trim();
    const website = form.querySelector('[name="website"]').value.trim();
    const description = form.querySelector('[name="description"]').value.trim();
    const services = Array.from(form.querySelectorAll('#serviceCheckboxesForm input:checked')).map(cb => cb.value);
    const hours = collectHours(form);

    const extra = document.getElementById('successExtra');

    if(editingId){
      updateMyListingData(editingId, {name, city, priceRange, address, phone, website, description, services, hours, plan: selectedPlan, logoColor, logoImage: logoImageData});
      document.getElementById('successHeading').textContent = 'Izmene su sačuvane!';
      document.getElementById('successText').textContent = 'Podaci o vašoj ordinaciji su ažurirani.';
      extra.innerHTML = `<p style="color:var(--muted);margin:0 0 4px;"><a href="nalog.html#moji-oglasi" style="color:var(--primary-dark);font-weight:600;">Nazad na Moji oglasi</a></p>`;
    } else {
      const entry = addMyListing({name, city, priceRange, address, phone, website, description, services, hours, plan: selectedPlan, logoColor, logoImage: logoImageData});
      extra.innerHTML = `<p style="color:var(--muted);margin:0 0 4px;">Vaša ordinacija je dodata u <a href="nalog.html#moji-oglasi" style="color:var(--primary-dark);font-weight:600;">Moji oglasi</a>, i sada je vidljiva u pretrazi sajta, sa paketom <b>${PLAN_LABELS[selectedPlan]}</b>. <a href="ordinacija.html?id=${entry.id}" style="color:var(--primary-dark);font-weight:600;">Pogledajte svoju stranicu →</a></p>`;
    }

    document.getElementById('step-form').style.display = 'none';
    successBox.classList.add('show');
    successBox.scrollIntoView({behavior:'smooth', block:'start'});
  });
}
