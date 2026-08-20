// Service Worker del POS Turkana — app shell offline (network-first para
// navegación, stale-while-revalidate para assets del mismo origen).
const CACHE = "turkana-pos-v3";

// Sólo el POS necesita funcionar sin red. El panel se cacheaba también —el
// scope del worker es "/"— y cuando el WiFi de la tienda fallaba servía HTML
// congelado: el dashboard llegó a mostrar la misma cifra de ventas tres días
// seguidos. El panel siempre va a la red.
const isOffline = (url) => url.pathname === "/pos" || url.pathname.startsWith("/pos/");

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

  // Navegación: sólo el POS se guarda para poder abrirlo sin red.
  if (req.mode === "navigate") {
    if (!isOffline(url)) return; // el panel y la tienda, directo a la red
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
