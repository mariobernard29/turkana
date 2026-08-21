// Service Worker del POS Turkana.
//
// Sirve para una sola cosa: que el POS abra aunque no haya red. Todo lo demás
// —y sobre todo los DATOS— tiene que ir siempre a la red, porque una caja que
// cobra con información vieja es peor que una caja que no abre.
const CACHE = "turkana-pos-v4";

// Sólo el POS necesita funcionar sin red. El panel se cacheaba también —el
// scope del worker es "/"— y cuando el WiFi de la tienda fallaba servía HTML
// congelado: el dashboard llegó a mostrar la misma cifra de ventas tres días
// seguidos. El panel siempre va a la red.
const esPos = (url) => url.pathname === "/pos" || url.pathname.startsWith("/pos/");

// Peticiones de DATOS de Next (las que hace router.refresh() al volver a pedir
// la página al servidor). Antes caían en el "stale-while-revalidate" de abajo,
// que responde primero con lo guardado: por eso, al abrir el turno, la pantalla
// recibía la respuesta de ANTES de que el turno existiera y se quedaba colgada
// en "Apertura de caja" hasta que algo forzaba una recarga completa.
// Nunca se tocan: van directas a la red.
function esDatos(req, url) {
  return (
    req.headers.has("RSC") ||
    req.headers.has("Next-Router-State-Tree") ||
    url.searchParams.has("_rsc") ||
    url.pathname.startsWith("/api/")
  );
}

// Lo único que vale la pena guardar: los archivos de compilación, que llevan
// hash en el nombre y por tanto nunca cambian de contenido, y las imágenes.
function esEstatico(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    /\.(?:png|jpg|jpeg|svg|webp|ico|woff2?|webmanifest)$/i.test(url.pathname)
  );
}

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

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (esDatos(req, url)) return; // datos: siempre a la red

  // Navegación: sólo el POS se guarda, para poder abrirlo sin red.
  if (req.mode === "navigate") {
    if (!esPos(url)) return; // el panel y la tienda, directo a la red
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(req);
          // Sólo se guarda una respuesta buena: guardar un 500 dejaba el POS
          // mostrando una página de error incluso al volver la conexión.
          if (net && net.ok) {
            const cache = await caches.open(CACHE);
            cache.put(req, net.clone());
          }
          return net;
        } catch {
          const cache = await caches.open(CACHE);
          return (await cache.match(req)) || (await cache.match("/pos")) || Response.error();
        }
      })(),
    );
    return;
  }

  if (!esEstatico(url)) return; // cualquier otra cosa, a la red

  // Archivos de compilación e imágenes: se sirven de la caché y se refrescan
  // por detrás. Llevan hash en el nombre, así que no pueden quedar obsoletos.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((net) => {
          if (net && net.ok) cache.put(req, net.clone());
          return net;
        })
        .catch(() => cached);
      return cached || network;
    })(),
  );
});
