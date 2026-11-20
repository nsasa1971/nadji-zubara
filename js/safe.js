/* Bezbedan prikaz sadržaja koji unose korisnici (zaštita od XSS-a).
   Pravilo: korisnički tekst se NIKAD ne umeće kao HTML. Koristi se el()/textContent,
   a gde je HTML nužan — esc(). Adrese (href) idu isključivo kroz safeUrl(). */

function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"'`]/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'
  }[ch]));
}

// Dozvoljene su samo http/https adrese; sve ostalo (javascript:, data:, ...) vraća ''.
function safeUrl(u){
  try{
    const x = new URL(String(u || '').trim());
    return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : '';
  } catch(e){ return ''; }
}

// Telefon: samo cifre, razmaci i + - / ( ); inače ''.
function safePhone(p){
  const s = String(p || '').trim();
  return /^[0-9+\-\/() ]{6,20}$/.test(s) ? s : '';
}

// Pravi DOM element: el('p', {class:'x', href:'..'}, 'tekst' | [dete, ...]). Tekst ide kroz textContent.
function el(tag, attrs, children){
  const n = document.createElement(tag);
  Object.keys(attrs || {}).forEach(k => {
    if(k === 'href'){ const u = safeUrl(new URL(attrs[k], location.href).href); if(u) n.setAttribute('href', attrs[k]); }
    else if(k.startsWith('on')) return; // bez inline događaja
    else n.setAttribute(k, attrs[k]);
  });
  [].concat(children == null ? [] : children).forEach(c => {
    n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return n;
}
