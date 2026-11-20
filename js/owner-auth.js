/* Prijava vlasnika ordinacije preko magic linka (Supabase Auth). */

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

// Crta formu za prijavu u kontejner. redirectPath: gde vodi link iz e-pošte (npr. 'preuzmi.html?id=...').
function renderLoginForm(container, redirectPath, intro){
  container.textContent = '';
  const input = el('input', {type:'email', id:'ownerEmail', placeholder:'vasa@adresa.com', autocomplete:'email', maxlength:'254', required:''});
  const btn = el('button', {type:'submit', class:'btn btn-primary'}, 'Pošalji link za prijavu');
  const msg = el('p', {class:'hint', id:'ownerLoginMsg', role:'status', style:'margin:12px 0 0;font-size:14px;'});
  const form = el('form', {novalidate:''}, [
    el('div', {class:'form-field'}, [
      el('label', {for:'ownerEmail'}, 'E-adresa'),
      input
    ]),
    el('div', {style:'margin-top:14px;'}, [btn]),
    msg
  ]);
  if(intro) container.appendChild(el('p', {style:'margin:0 0 14px;color:var(--muted);'}, intro));
  container.appendChild(form);

  let timer = null;
  function cooldown(){
    let left = MAGIC_LINK_COOLDOWN_S;
    btn.disabled = true;
    timer = setInterval(() => {
      left--;
      btn.textContent = left > 0 ? `Pošalji ponovo (${left} s)` : 'Pošalji link za prijavu';
      if(left <= 0){ clearInterval(timer); btn.disabled = false; }
    }, 1000);
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = input.value.trim();
    msg.style.color = '';
    if(!isValidEmailFormat(email)){ msg.textContent = 'Unesite ispravnu e-adresu.'; msg.style.color = 'var(--closed)'; return; }
    if(!sb){ msg.textContent = 'Prijava trenutno nije dostupna.'; msg.style.color = 'var(--closed)'; return; }
    btn.disabled = true;
    const { error } = await sb.auth.signInWithOtp({
      email,
      options:{ emailRedirectTo: new URL(redirectPath, location.href).href, shouldCreateUser:true }
    });
    if(error){
      msg.style.color = 'var(--closed)';
      msg.textContent = (error.status === 429 || /rate|limit/i.test(error.message || ''))
        ? 'Previše pokušaja. Sačekajte malo pa pokušajte ponovo.'
        : 'Slanje nije uspelo. Pokušajte ponovo za nekoliko minuta.';
      btn.disabled = false;
      return;
    }
    msg.textContent = 'Proverite e-poštu: poslali smo vam link za prijavu. Link važi kratko i radi samo jednom.';
    cooldown();
  });
}
