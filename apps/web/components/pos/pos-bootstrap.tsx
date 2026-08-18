"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { WifiOff, RefreshCw, Check, AlertTriangle, Printer } from "lucide-react";
import { useOnline } from "./use-online";
import { getDeviceId } from "@/lib/offline/device";
import { getPendingOps, markOp, statusCounts } from "@/lib/offline/db";
import { processSyncBatch } from "@/app/pos/actions";
import { getPrinterStatus, type PrinterStatus } from "@/app/pos/print-actions";

export function PosBootstrap() {
  const online = useOnline();
  const router = useRouter();
  const [counts, setCounts] = useState({ pending: 0, conflict: 0 });
  const [syncing, setSyncing] = useState(false);
  const [printer, setPrinter] = useState<PrinterStatus | null>(null);
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

  // Estado de la impresora: si el agente del mostrador se cayó, el cajero tiene
  // que enterarse ANTES de cobrar, no cuando el papel no sale.
  const refreshPrinter = useCallback(async () => {
    if (!navigator.onLine) return;
    try { setPrinter(await getPrinterStatus()); } catch { /* sin red */ }
  }, []);

  useEffect(() => { refreshPrinter(); }, [refreshPrinter]);
  useEffect(() => {
    const h = () => refreshPrinter();
    window.addEventListener("turkana-print", h);
    return () => window.removeEventListener("turkana-print", h);
  }, [refreshPrinter]);
  useEffect(() => {
    const i = setInterval(() => { if (navigator.onLine) refreshPrinter(); }, 60000);
    return () => clearInterval(i);
  }, [refreshPrinter]);

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
      {printer?.configured && <PrinterPill printer={printer} />}
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

function PrinterPill({ printer }: { printer: PrinterStatus }) {
  const name = printer.name ?? "Impresora";

  if (!printer.online) {
    return (
      <Pill className="bg-amber-500 text-white" title={`${name} no responde · los tickets saldrán por el diálogo del navegador`}>
        <Printer className="h-3 w-3" /> Sin impresora
      </Pill>
    );
  }
  if (printer.failed > 0) {
    return (
      <Pill className="bg-red-600 text-white" title={`${printer.failed} ticket(s) no se pudieron imprimir · revisa papel y encendido`}>
        <Printer className="h-3 w-3" /> {printer.failed}
      </Pill>
    );
  }
  return (
    <Pill className="bg-green-600/90 text-white" title={name}>
      <Printer className="h-3 w-3" />
      {printer.pending > 0 ? printer.pending : null}
    </Pill>
  );
}

function Pill({ children, className = "", title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <div title={title} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium ${className}`}>
      {children}
    </div>
  );
}
