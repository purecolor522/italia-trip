// Italia trip — Service Worker
// Bump CACHE_VERSION when shipping a new build that should invalidate caches.
const CACHE_VERSION = '2026-05-11-6';
const SHELL_CACHE = `italia-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `italia-runtime-${CACHE_VERSION}`;
const TILE_CACHE = `italia-tiles-${CACHE_VERSION}`;

const SHELL_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg',
];

const PRECACHE_EXTERNAL = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL_URLS);
    // External best-effort — don't block install on a single failure
    await Promise.all(PRECACHE_EXTERNAL.map(async (url) => {
      try {
        const resp = await fetch(url, { cache: 'no-cache' });
        if (resp.ok) await cache.put(url, resp);
      } catch (e) {}
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith('italia-') && !k.endsWith(CACHE_VERSION))
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (!url.protocol.startsWith('http')) return;

  // Map tiles (Google Maps) — stale-while-revalidate
  if (/^mt[0-3]\.google\.com$/.test(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req, TILE_CACHE));
    return;
  }

  // Google Fonts (CSS + woff2)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(req, RUNTIME_CACHE));
    return;
  }

  // Leaflet from unpkg
  if (url.hostname === 'unpkg.com') {
    event.respondWith(cacheFirst(req, RUNTIME_CACHE));
    return;
  }

  // External APIs — let the app handle offline using its in-memory caches.
  if (
    url.hostname.includes('open-meteo.com') ||
    url.hostname.includes('er-api.com') ||
    url.hostname.includes('nominatim')
  ) {
    return; // pass through to network
  }

  // Same-origin: network-first, fall back to cache, finally to index.html
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req, SHELL_CACHE));
    return;
  }
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const resp = await fetch(req);
    if (resp && (resp.ok || resp.type === 'opaque')) cache.put(req, resp.clone());
    return resp;
  } catch (e) {
    return new Response('', { status: 504 });
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const resp = await fetch(req);
    if (resp && resp.ok) cache.put(req, resp.clone());
    return resp;
  } catch (e) {
    const cached = (await cache.match(req)) || (await cache.match('./index.html'));
    if (cached) return cached;
    return new Response('Offline', { status: 504, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const networkPromise = fetch(req)
    .then((resp) => {
      if (resp && (resp.ok || resp.type === 'opaque')) cache.put(req, resp.clone());
      return resp;
    })
    .catch(() => null);
  return cached || (await networkPromise) || new Response('', { status: 504 });
}
