// MediAfrica offline app-shell — Phase 3 of the offline effort (Phase 1/2
// are the IndexedDB mutation queue at src/lib/offlineQueue.ts, which this
// file does not touch or duplicate).
//
// Scope: let a page that was already opened once (while online) keep
// working — and a cold app launch render something — when connectivity
// drops entirely, including a full page reload with zero network. This is
// runtime caching (populate-as-you-browse), not a build-time precache list:
// Next/Turbopack hashes static chunk names per build, so a fixed precache
// manifest here would silently go stale on every deploy. Pages and API GETs
// a user has actually visited become available offline; nothing else does.
//
// Hard rule: only GET requests are ever intercepted. POST/PUT/PATCH/DELETE
// always go straight to the network untouched — this is what keeps CSRF,
// auth, and the offlineQueue's own network-failure detection (api.ts's
// status === 0 signal) working exactly as before. A service worker that
// swallowed a failed mutation here instead of letting it reject would break
// the queue silently.

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `mediafrica-static-${CACHE_VERSION}`;
const PAGES_CACHE = `mediafrica-pages-${CACHE_VERSION}`;
const API_CACHE = `mediafrica-api-${CACHE_VERSION}`;
const CURRENT_CACHES = new Set([STATIC_CACHE, PAGES_CACHE, API_CACHE]);

const OFFLINE_FALLBACK_HTML = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hors-ligne · MediAfrica</title>
<style>
  body { font-family: system-ui, sans-serif; background: #f9f9f7; color: #0b0b0b;
    display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; }
  main { max-width: 360px; text-align: center; }
  h1 { font-size: 1.25rem; margin-bottom: 8px; }
  p { color: #52514e; font-size: 0.9rem; line-height: 1.5; }
  button { margin-top: 16px; background: #2a78d6; color: #fff; border: none; border-radius: 6px;
    padding: 10px 20px; font-size: 0.9rem; cursor: pointer; }
</style></head>
<body><main>
  <h1>Pas de connexion</h1>
  <p>Cette page n'a pas encore été consultée hors-ligne. Reconnectez-vous puis réessayez.</p>
  <button onclick="location.reload()">Réessayer</button>
</main></body></html>`;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('mediafrica-') && !CURRENT_CACHES.has(name))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

function isAuthOrCron(pathname) {
  return pathname.startsWith('/api/auth/') || pathname.startsWith('/api/cron/');
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isAuthOrCron(url.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await networkFirst(request, PAGES_CACHE);
        } catch {
          const cache = await caches.open(PAGES_CACHE);
          const cachedRoot = await cache.match('/');
          return (
            cachedRoot ??
            new Response(OFFLINE_FALLBACK_HTML, {
              status: 200,
              headers: { 'content-type': 'text/html; charset=utf-8' },
            })
          );
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icon')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
});
