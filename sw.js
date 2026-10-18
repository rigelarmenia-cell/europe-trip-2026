// Increment on every app-shell release. trip.json has its own version and update flow.
const RELEASE = '0.6.5';
const PREFIX = `champa-shell:${self.registration.scope}:`;
const CACHE = PREFIX + RELEASE;
const FILES = ['./', './index.html', './styles.css', './app.js', './lib/core.js', './lib/map.js', './manifest.webmanifest', './icons/favicon-64.png', './icons/mark.png', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png', './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css', './vendor/leaflet/images/layers.png', './vendor/leaflet/images/layers-2x.png', './vendor/leaflet/images/marker-icon.png', './vendor/leaflet/images/marker-icon-2x.png', './vendor/leaflet/images/marker-shadow.png'];
FILES.push('./lib/itinerary.js', './lib/airports.js', './lib/format.js', './lib/paths.js');
FILES.push('./lib/alerts.js');
const urls = new Set(FILES.map(file => new URL(file, self.registration.scope).href));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(file => new Request(new URL(file, self.registration.scope), { cache: 'reload' })))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => { if (event.data?.type === 'ACTIVATE') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const shellUrl = new URL(url.href); shellUrl.search = '';
  if (url.origin !== self.location.origin) return; // No tile or photo prefetch/cache.
  // Only our shell: data is validated and saved in app.js, never silently frozen here.
  if (urls.has(shellUrl.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match(shellUrl.href)) || fetch(request);
    })());
  } else if (request.mode === 'navigate' && url.pathname === new URL('./', self.registration.scope).pathname) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(new URL('./', self.registration.scope))));
  }
});

