/* Service worker minimal (offline shell + GET cache).
 *
 * Stratégie :
 *   - install : pré-cache la coquille (manifest, icônes, page racine).
 *   - fetch GET : network-first puis cache si offline.
 *   - fetch POST/DELETE : laisse passer ; en cas d'échec réseau, le
 *     client (page) doit basculer la mutation dans `localStorage` via
 *     `lib/offline-queue.ts`. Ce SW n'intercepte pas les mutations
 *     pour rester simple et sûr (pas de risque de double-write côté API).
 *
 * Déploiement : enregistré par `app/layout.tsx` côté client (production).
 */

const CACHE_NAME = 'interim-portal-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.svg', '/icon-512.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Ne cache pas les API mutations ou les routes /api/auth (sensibles).
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match('/'))),
  );
});
