/* ============================================================
   KHALED WATCH — Service Worker
   • chargement instantané des visites suivantes
   • le site s'ouvre même avec une connexion instable
   • le catalogue (produits.json) est toujours rechargé en priorité depuis internet
   ============================================================ */
const VERSION = 'kw-v1';
const SHELL = VERSION + '-shell';
const IMGS  = VERSION + '-img';
const DATA  = VERSION + '-data';
const MAX_IMGS = 140;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(['./', 'icons/icon-192.png']).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trim(name, max){
  const c = await caches.open(name), keys = await c.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map(k => c.delete(k)));
}
function withTimeout(p, ms){ return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]); }

async function networkFirst(req, cacheName, ms){
  const cache = await caches.open(cacheName);
  try {
    const res = await withTimeout(fetch(req, { cache: 'no-cache' }), ms);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw e;
  }
}
async function staleWhileRevalidate(req, cacheName){
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}
async function cachedImage(req){
  const cache = await caches.open(IMGS);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  try {
    const res = await fetch(new Request(req.url, { mode: 'cors', credentials: 'omit' }));   // réponse lisible (pas "opaque")
    if (res && res.ok){ cache.put(req.url, res.clone()); trim(IMGS, MAX_IMGS); }
    return res;
  } catch (e) {
    return fetch(req);
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.headers.has('range') || /\.(mp4|webm|mov)(\?|$)/i.test(url.pathname)) return;          // vidéos : directement le réseau
  if (url.hostname.endsWith('workers.dev')) return;                                                // Club, Del, avis : toujours en direct

  if (url.origin === location.origin){
    if (url.pathname.endsWith('/produits.json')) return e.respondWith(networkFirst(req, DATA, 5000));
    if (req.mode === 'navigate' || req.destination === 'document') return e.respondWith(networkFirst(req, SHELL, 3500));
    return e.respondWith(staleWhileRevalidate(req, SHELL));
  }
  if (/(^|\.)(weserv\.nl|unsplash\.com|githubusercontent\.com)$/.test(url.hostname) && req.destination === 'image') return e.respondWith(cachedImage(req));
  if (/(^|\.)(gstatic\.com|googleapis\.com)$/.test(url.hostname) && url.hostname.includes('font')) return e.respondWith(staleWhileRevalidate(req, SHELL));
});
