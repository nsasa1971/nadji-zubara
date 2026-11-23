/* Service worker administracije: samo instalacija i keš statičkih fajlova (css, js, slike, fontovi, admin.html).
   NE dira pozive ka Supabase-u ni bilo koji drugi spoljni zahtev (oni se uopšte ne presreću), pa se podaci nikad ne keširaju.
   Strategija: prvo mreža, a keš samo kad mreže nema. Mrežni zahtev ide sa cache:'no-cache', pa se HTTP keš
   pregledača uvek proverava kod servera (ranije je fetch(req) mogao da vrati stariji HTTP-keširan css/js čak i
   u režimu "prvo mreža"). Verzija aplikacije je naziv keša: promena CACHE menja i prikaz "Verzija aplikacije". */
const CACHE = 'nz-admin-v2';
const PRECACHE = ['/admin.html', '/css/style.css', '/js/admin.js', '/js/new-clinics.js', '/js/with-new-clinics.js', '/js/profile-common.js', '/js/owner-auth.js'];
const STATIC = /^\/(css|js|img|fonts)\/|^\/admin\.html$|^\/favicon|^\/admin\.webmanifest$/;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(PRECACHE.map(u => fetch(u, {cache:'no-cache'}).then(r => (r && r.ok) ? c.put(u, r) : null).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => {
  const d = e.data;
  if(d && d.type === 'SKIP_WAITING') self.skipWaiting();
  else if(d && d.type === 'GET_VERSION' && e.source) e.source.postMessage({type:'VERSION', cache: CACHE});
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;          // Supabase, jsDelivr i sve spoljno: bez presretanja
  if(!STATIC.test(url.pathname)) return;                    // samo statični fajlovi
  e.respondWith(
    fetch(req, {cache:'no-cache'}).then(res => {
      if(res && res.ok && res.type === 'basic'){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req))
  );
});
