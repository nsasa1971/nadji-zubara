/* Prijava vlasnika ordinacije kodom iz e-pošte (Supabase Auth); link iz poruke ostaje kao rezerva. */

const OWNER_CONSENT_VERSION = 'nacrt-2026-11-20'; // verzija nacrta uslova/privatnosti koju korisnik prihvata
const MAGIC_LINK_COOLDOWN_S = 60;

function isValidEmailFormat(s){
  return typeof s === 'string' && s.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}

async function getOwnerUser(){
  if(!sb) return null;
  const { data } = await sb.auth.getSession();
  return data && data.session ? data.session.user : null;
}

async function ownerSignOut(){
  if(sb) await sb.auth.signOut();
}

/* ---------------------------------------------------------------- prijava kodom
   Tok: e-adresa -> kod iz e-pošte (6 cifara) -> potvrda (verifyOtp) bez napuštanja stranice. Link iz iste poruke i dalje
   radi kao rezerva (otvara se u istom ili drugom pregledaču). Sesija se pamti (persistSession), pa se kod ne traži ponovo.
   Napomena: kod se vidi u poruci samo ako šablon "Magic Link" u Supabase-u sadrži {{ .Token }}. */
const OTP_MAX_WRONG = 5;

function otpSendErrorText(error){
  return (error && (error.status === 429 || /rate|limit|too many/i.test(error.message || '')))
    ? 'Previše pokušaja. Sačekajte malo pa pokušajte ponovo.'
    : 'Slanje nije uspelo. Pokušajte ponovo za nekoliko minuta.';
}
function otpVerifyErrorText(error, wrongCount){
  if(error && (error.status === 429 || /rate|limit|too many/i.test(error.message || ''))) return 'Previše pokušaja. Zatražite novi kod i pokušajte ponovo.';
  if(wrongCount >= OTP_MAX_WRONG) return 'Previše pogrešnih pokušaja. Zatražite novi kod.';
  if(error && /expired/i.test(error.message || '') && !/invalid/i.test(error.message || '')) return 'Kod je istekao. Zatražite novi kod.';
  return 'Kod nije ispravan ili je istekao. Proverite kod u poruci ili zatražite novi.';
}

// Crta prijavu u kontejner. opts: {redirectPath (gde vodi link iz poruke), intro, requireConsent, consentNode,
// onVerified(user), sendLabel}. Bez onVerified, stranice prate promenu prijave preko onAuthStateChange.
function ownerLoginFlow(container, opts){
  opts = opts || {};
  container.textContent = '';
  const redirectPath = opts.redirectPath || location.pathname + location.search;
  const emailIn = el('input', {type:'email', id:'ownerEmail', placeholder:'vasa@adresa.com', autocomplete:'email', maxlength:'254', required:''});
  const consent = opts.requireConsent ? el('input', {type:'checkbox', id:'ownerConsent'}) : null;
  const sendBtn = el('button', {type:'submit', class:'btn btn-primary'}, opts.sendLabel || 'Pošalji kod');
  const msg = el('p', {class:'hint', id:'ownerLoginMsg', role:'status', style:'margin:12px 0 0;font-size:14px;'});
  const rows = [
    el('div', {class:'form-field'}, [el('label', {for:'ownerEmail'}, 'E-adresa'), emailIn])
  ];
  if(consent){
    rows.push(el('label', {style:'display:flex;gap:10px;align-items:flex-start;margin:14px 0 4px;font-size:14px;'}, [
      consent,
      el('span', {}, ['Slažem se sa ', el('a', {href:'uslovi.html', target:'_blank', rel:'noopener'}, 'uslovima korišćenja'), ' i ',
        el('a', {href:'privatnost.html', target:'_blank', rel:'noopener'}, 'obaveštenjem o privatnosti'), ' (nacrt).'])
    ]));
  }
  rows.push(el('div', {style:'margin-top:14px;'}, [sendBtn]), msg);
  const form = el('form', {novalidate:''}, rows);
  if(opts.intro) container.appendChild(el('p', {style:'margin:0 0 14px;color:var(--muted);'}, opts.intro));
  container.appendChild(form);

  let timer = null;
  const bad = t => { msg.style.color = 'var(--closed)'; msg.textContent = t; };

  async function sendCode(email){
    const { error } = await sb.auth.signInWithOtp({
      email,
      options:{ emailRedirectTo: new URL(redirectPath, location.href).href, shouldCreateUser:true }
    });
    return error;
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = emailIn.value.trim();
    msg.style.color = '';
    if(!isValidEmailFormat(email)){ bad('Unesite ispravnu e-adresu.'); return; }
    if(consent && !consent.checked){ bad('Morate prihvatiti uslove i obaveštenje o privatnosti.'); return; }
    if(!sb){ bad('Prijava trenutno nije dostupna.'); return; }
    sendBtn.disabled = true;
    const error = await sendCode(email);
    if(error){ bad(otpSendErrorText(error)); sendBtn.disabled = false; return; }
    showCodeStep(email);
  });

  function showCodeStep(email){
    container.textContent = '';
    let wrong = 0, left = 60;
    const codeIn = el('input', {type:'text', id:'ownerCode', inputmode:'numeric', autocomplete:'one-time-code', pattern:'[0-9]*', maxlength:'8',
      placeholder:'••••••', 'aria-label':'Kod iz e-pošte', style:'letter-spacing:.4em;font-size:22px;text-align:center;font-weight:700;'});
    const okBtn = el('button', {type:'submit', class:'btn btn-primary'}, 'Potvrdi kod');
    const resend = el('button', {type:'button', class:'btn btn-outline-navy'}, 'Pošalji novi kod (60 s)');
    const change = el('button', {type:'button', class:'link-reset', style:'background:none;border:0;padding:6px 0;color:var(--primary-dark);text-decoration:underline;cursor:pointer;font:inherit;font-size:14px;'}, 'Promeni e-adresu');
    const m2 = el('p', {class:'hint', role:'status', style:'margin:12px 0 0;font-size:14px;'});
    const f2 = el('form', {novalidate:''}, [
      el('p', {style:'margin:0 0 12px;'}, ['Poslali smo kod na ', el('strong', {}, email), '. Unesite ga ovde (važi kratko). Ako vam je lakše, možete umesto toga da otvorite link iz iste poruke.']),
      el('div', {class:'form-field'}, [el('label', {for:'ownerCode'}, 'Kod iz e-pošte (6 cifara)'), codeIn]),
      el('div', {style:'display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;'}, [okBtn, resend]),
      m2, el('div', {style:'margin-top:6px;'}, [change])
    ]);
    container.appendChild(f2);
    // samo cifre (i nalepljen kod sa razmacima); dužina koda se podešava u Supabase panelu: prihvata se 6 do 8 cifara, očekuje se 6
    codeIn.addEventListener('input', () => { const v = codeIn.value.replace(/\D/g, '').slice(0, 8); if(v !== codeIn.value) codeIn.value = v; });
    codeIn.focus();
    const badM = t => { m2.style.color = 'var(--closed)'; m2.textContent = t; };

    function tick(){
      resend.disabled = true; left = 60; resend.textContent = 'Pošalji novi kod (' + left + ' s)';
      clearInterval(timer);
      timer = setInterval(() => {
        left--;
        if(left <= 0){ clearInterval(timer); resend.disabled = false; resend.textContent = 'Pošalji novi kod'; }
        else resend.textContent = 'Pošalji novi kod (' + left + ' s)';
      }, 1000);
    }
    tick();

    resend.addEventListener('click', async () => {
      m2.style.color = ''; m2.textContent = '';
      resend.disabled = true;
      const error = await sendCode(email);
      if(error){ badM(otpSendErrorText(error)); resend.disabled = false; return; }
      wrong = 0; okBtn.disabled = false; codeIn.value = ''; codeIn.focus();
      m2.style.color = 'var(--open)'; m2.textContent = 'Poslali smo novi kod.';
      tick();
    });
    change.addEventListener('click', () => { clearInterval(timer); ownerLoginFlow(container, opts); });

    f2.addEventListener('submit', async e => {
      e.preventDefault();
      m2.style.color = '';
      const code = codeIn.value.replace(/\s+/g, '');
      if(!/^[0-9]{6,8}$/.test(code)){ badM('Unesite kod iz poruke (samo cifre, obično 6).'); return; }
      if(wrong >= OTP_MAX_WRONG){ badM(otpVerifyErrorText(null, wrong)); return; }
      okBtn.disabled = true;
      const { data, error } = await sb.auth.verifyOtp({email, token: code, type:'email'});
      if(error || !(data && data.session)){
        wrong++;
        badM(otpVerifyErrorText(error, wrong));
        okBtn.disabled = wrong >= OTP_MAX_WRONG;
        codeIn.select();
        return;
      }
      clearInterval(timer);
      m2.style.color = 'var(--open)'; m2.textContent = 'Prijavljeni ste.';
      if(typeof opts.onVerified === 'function') opts.onVerified(data.session.user);
    });
  }
}

// Zadržano radi starih poziva (preuzmi, moj-nalog, admin, izmena profila): prijava kodom, uz link kao rezervu.
function renderLoginForm(container, redirectPath, intro){
  ownerLoginFlow(container, {redirectPath, intro});
}
