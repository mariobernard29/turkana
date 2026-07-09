// Service Worker del POS Turkana — app shell offline (network-first para
// navegación, stale-while-revalidate para assets del mismo origen).
const CACHE = "turkana-pos-v2";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navegación: red primero; si falla, sirve la página cacheada (o /pos).
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put(req, net.clone());
          return net;
        } catch {
          const cache = await caches.open(CACHE);
          return (await cache.match(req)) || (await cache.match("/pos")) || Response.error();
        }
      })(),
    );
    return;
  }

  // Assets: stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((net) => {
          if (net && net.status === 200) cache.put(req, net.clone());
          return net;
        })
        .catch(() => cached);
      return cached || network;
    })(),
  );
});
