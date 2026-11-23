/* Učitava objavljene nove ordinacije iz baze (NEWC.loadPublished, najviše 1,5 s) pa tek onda skriptu stranice
   (data-next), da getClinicById razreši i id-jeve "nova-…" (naziv ordinacije u Moj nalog, izmeni profila,
   preuzimanju i adminu). Greška ili tajmaut: stranica radi kao pre (prikazuje se id umesto naziva). */
(function(){
  var cur = document.currentScript, next = cur && cur.getAttribute('data-next');
  if(!next) return;
  var started = false;
  function go(){ if(started) return; started = true; var s = document.createElement('script'); s.src = next; s.async = false; document.body.appendChild(s); }
  try{
    if(typeof NEWC !== 'undefined' && typeof PF !== 'undefined' && PF.configured()) NEWC.loadPublished().then(go, go); else go();
  }catch(e){ go(); }
})();
