"use client";

import { useEffect } from "react";

// En desarrollo desregistra cualquier Service Worker y limpia las cachés,
// para evitar que sirva chunks viejos (errores de "module factory not available").
export function SWCleanup() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
    }
    if (typeof caches !== "undefined") {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
    }
  }, []);
  return null;
}
