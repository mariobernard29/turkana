"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { WifiOff, RefreshCw, Check, AlertTriangle } from "lucide-react";
import { useOnline } from "./use-online";
import { getDeviceId } from "@/lib/offline/device";
import { getPendingOps, markOp, statusCounts } from "@/lib/offline/db";
import { processSyncBatch } from "@/app/pos/actions";

export function PosBootstrap() {
  const online = useOnline();
  const router = useRouter();
  const [counts, setCounts] = useState({ pending: 0, conflict: 0 });
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  // Registrar el Service Worker (PWA instalable + offline) SOLO en producción.
  // En desarrollo cachea chunks de Turbopack y rompe la app con módulos viejos.
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  const refresh = useCallback(async () => {
    try { setCounts(await statusCounts()); } catch { /* idb no disponible */ }
  }, []);

  const flush = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    const ops = await getPendingOps();
    if (ops.length === 0) { await refresh(); return; }
    syncingRef.current = true;
    setSyncing(true);
    try {
      const res = await processSyncBatch(
        getDeviceId(),
        ops.map((o) => ({
          clientOpId: o.clientOpId, sessionId: o.sessionId, items: o.items, services: o.services,
          payments: o.payments, customerId: o.customerId, discount: o.discount, createdAtIso: o.createdAtIso,
        })),
      );
      for (const r of res.results) await markOp(r.clientOpId, r.status, r.error);
      await refresh();
      router.refresh();
    } catch { /* sigue sin conexión */ } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [refresh, router]);

  // Refresca conteos y reintenta sincronizar periódicamente / al volver la red.
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const h = () => refresh();
    window.addEventListener("turkana-outbox", h);
    return () => window.removeEventListener("turkana-outbox", h);
  }, [refresh]);
  useEffect(() => { if (online) flush(); }, [online, flush]);
  useEffect(() => {
    const i = setInterval(() => { if (navigator.onLine) flush(); }, 15000);
    return () => clearInterval(i);
  }, [flush]);

  const showOffline = !online;
  const showSync = online && (syncing || counts.pending > 0);
  const showConflict = counts.conflict > 0;

  return (
    <div className="flex items-center gap-2">
      {showConflict && (
        <Pill className="bg-red-600 text-white">
          <AlertTriangle className="h-3 w-3" /> {counts.conflict}
        </Pill>
      )}
      {showOffline ? (
        <Pill className="bg-amber-500 text-white">
          <WifiOff className="h-3 w-3" /> Sin conexión{counts.pending > 0 ? ` · ${counts.pending}` : ""}
        </Pill>
      ) : showSync ? (
        <Pill className="bg-blue-600 text-white">
          <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Sincronizando" : `${counts.pending} en cola`}
        </Pill>
      ) : (
        <Pill className="bg-green-600/90 text-white">
          <Check className="h-3 w-3" /> En línea
        </Pill>
      )}
    </div>
  );
}

function Pill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium ${className}`}>
      {children}
    </div>
  );
}
