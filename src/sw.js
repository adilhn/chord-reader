// Chord Reader service worker.
// Network first for everything: while online the app always comes from the server, and each good
// response is copied into the cache so the last version seen keeps working offline.
// All URLs are relative to this file, so it works from /chord-reader/ (GitHub Pages) and from /src/ in development.

// The build replaces the version marker with a build id, so each deploy gets a fresh cache.
// The scope path is part of the name because every GitHub Pages project site of a user shares one origin
// (and so one CacheStorage); cleanup below only ever touches caches that belong to this scope.
const PREFIX = 'chord-reader:' + new URL('./', self.location).pathname + ':';
const CACHE = PREFIX + '__BUILD_VERSION__';

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];
const SHELL = new URL('./index.html', self.location).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 'no-cache' revalidates with the server, so a new build never precaches files from the HTTP cache.
    // Each file is cached on its own: one missing file must not stop the worker from installing.
    // Redirected responses are skipped everywhere: Chrome refuses to replay one for a page load.
    await Promise.all(PRECACHE.map(async path => {
      try {
        const res = await fetch(new Request(path, { cache: 'no-cache' }));
        if (res.status === 200 && !res.redirected) await cache.put(path, res);
      } catch (e) { /* offline or missing: the fetch handler fills the cache later */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith(PREFIX) && n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  // Only same-origin GETs inside this app's folder; everything else goes straight to the network.
  if (req.method !== 'GET' || !req.url.startsWith(self.registration.scope)) return;
  event.respondWith(networkFirst(event, req));
});

async function networkFirst(event, req) {
  try {
    // 'no-cache' asks the server every time (a cheap 304 when nothing changed), so the HTTP cache
    // can never hand back an old build while we are online.
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.status === 200 && res.type === 'basic' && !res.redirected) {
      const copy = res.clone();
      event.waitUntil(caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}));
    }
    return res;
  } catch (err) {
    // Network failed: we are offline (or the server is unreachable). Serve the last good copy.
    const cache = await caches.open(CACHE);
    const nav = req.mode === 'navigate';
    const hit = await cache.match(req, { ignoreVary: true, ignoreSearch: nav })
      || (nav && await cache.match(SHELL, { ignoreVary: true }));
    return hit || Response.error();
  }
}
