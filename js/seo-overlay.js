/* Statične SEO stranice (grad, opština, ordinacija): kad za ordinaciju postoji objavljen profil,
   zamenjuje prikazani naziv, adresu i telefon. Naslov, opis stranice, JSON-LD i radno vreme/sajt
   ostaju iz uvezenih podataka (menjaju se pri narednom generisanju). Nema profila ili mreže = bez promene.
   Zavisi od: supabase-config.js, safe.js, profile-common.js. */
(function(){
  if(typeof PF === 'undefined' || !PF.configured()) return;
  const roots = document.querySelectorAll('[data-cid]');
  if(!roots.length) return;
  PF.withTimeout(s => PF.fetchProfiles(s), 4000, null).then(map => {
    if(!map) return;
    roots.forEach(root => {
      const p = map[root.getAttribute('data-cid')];
      if(!p) return;
      const targets = [];
      if(root.hasAttribute('data-pf')) targets.push(root);
      root.querySelectorAll('[data-pf]').forEach(n => targets.push(n));
      targets.forEach(n => {
        const kind = n.getAttribute('data-pf');
        if(kind === 'name' && p.name) n.textContent = p.name;
        else if(kind === 'address' && p.address) n.textContent = p.address;
        else if(kind === 'phone' && p.phones) n.textContent = p.phones[0];
        else if(kind === 'phone-link' && p.phones){
          n.setAttribute('href', 'tel:' + p.phones[0].replace(/\s/g, ''));
          if(!n.classList.contains('btn')) n.textContent = p.phones[0];
        }
        else if(kind === 'phone-p' && p.phones){
          // stranica ordinacije: red "Telefon" (i kad je ranije pisalo "nije dostupan")
          n.textContent = '';
          const b = document.createElement('strong'); b.textContent = 'Telefon:';
          const a = document.createElement('a');
          a.setAttribute('href', 'tel:' + p.phones[0].replace(/\s/g, '')); a.textContent = p.phones[0];
          n.appendChild(b); n.appendChild(document.createTextNode(' ')); n.appendChild(a);
        }
      });
    });
  });
})();
