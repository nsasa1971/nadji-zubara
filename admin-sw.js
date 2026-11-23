/* Service worker administracije: samo instalacija i keš statičkih fajlova (css, js, slike, fontovi, admin.html).
   NE dira pozive ka Supabase-u ni bilo koji drugi spoljni zahtev (oni se uopšte ne presreću), pa se podaci nikad ne keširaju.
   Strategija: prvo mreža, a keš samo kad mreže nema (da izmene stignu odmah posle objave). */
const CACHE = 'nz-admin-v1';
const STATIC = /^\/(css|js|img|fonts)\/|^\/admin\.html$|^\/favicon|^\/admin\.webmanifest$/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/admin.html', '/css/style.css', '/js/admin.js']).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;          // Supabase, jsDelivr i sve spoljno: bez presretanja
  if(!STATIC.test(url.pathname)) return;                    // samo statični fajlovi
  e.respondWith(
    fetch(req).then(res => {
      if(res && res.ok && res.type === 'basic'){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req))
  );
});
