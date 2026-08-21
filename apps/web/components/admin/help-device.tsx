"use client";

// Lo que sólo se puede saber desde el equipo que está mirando la pantalla:
// si tiene conexión, qué caja es y si arrastra una copia guardada del sistema.
import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { getRegisterId, deviceLabel } from "@/lib/offline/device";

// `cajas` viene del servidor para poder traducir el identificador guardado en
// este equipo a un nombre que le sirva a quien da soporte.
export function HelpDevice({ cajas }: { cajas: { id: string; name: string }[] }) {
  const [online, setOnline] = useState(true);
  const [equipo, setEquipo] = useState("—");
  const [caja, setCaja] = useState<string | null>(null);
  const [conCache, setConCache] = useState(false);
  const [limpiando, setLimpiando] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);

    try { setEquipo(deviceLabel()); } catch { /* sin localStorage */ }
    try { setCaja(getRegisterId()); } catch { /* sin localStorage */ }

    // ¿Este equipo guarda una copia del sistema? Es lo primero que hay que
    // descartar cuando una pantalla muestra información que ya no es cierta.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((rs) => setConCache(rs.length > 0))
        .catch(() => {});
    }

    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Borra la copia guardada y recarga: la salida de emergencia cuando un equipo
  // se quedó con una versión vieja del sistema.
  const limpiar = async () => {
    setLimpiando(true);
    try {
      if ("serviceWorker" in navigator) {
        const rs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(rs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch { /* da igual: lo que importa es recargar */ }
    window.location.reload();
  };

  return (
    <section className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
      <h2 className="text-lg text-ink">Este equipo</h2>
      <p className="mt-1 text-sm text-muted">
        Información de la computadora o tableta desde la que estás viendo esta página.
      </p>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted">Conexión</dt>
          <dd className={`flex items-center gap-1.5 ${online ? "text-green-700" : "text-red-700"}`}>
            {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {online ? "En línea" : "Sin conexión"}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted">Equipo</dt>
          <dd className="text-ink">{equipo}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted">Caja asignada</dt>
          <dd className="text-ink">
            {caja
              ? cajas.find((c) => c.id === caja)?.name ?? "Una caja que ya no existe"
              : "Sin caja asignada"}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted">Copia guardada del sistema</dt>
          <dd className="text-ink">{conCache ? "Sí" : "No"}</dd>
        </div>
      </dl>

      <button
        onClick={limpiar}
        disabled={limpiando}
        className="mt-5 inline-flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 text-xs uppercase tracking-wider text-ink transition-colors hover:border-gold disabled:opacity-50"
      >
        {limpiando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        Vaciar la copia y recargar
      </button>
      <p className="mt-2 text-xs text-muted">
        Úsalo si esta pantalla muestra datos viejos o si el sistema se comporta raro en este equipo.
        No borra ninguna venta: sólo la copia que guarda el navegador.
      </p>
    </section>
  );
}
