"use client";

// Gasto o ingreso de caja: dinero que sale del cajón para una compra, o que entra
// por algo que no es una venta. Cada movimiento imprime su comprobante — el del
// gasto se engrapa al ticket de lo que se compró, el del ingreso se queda en la
// caja— y los dos entran al corte del turno.
import { useEffect, useState, useCallback } from "react";
import { X, Loader2, Printer, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { getCajaInfo, registerCashEntry } from "@/app/pos/caja-actions";
import { printReceiptHTML } from "@/lib/print";
import { formatMXN, cn } from "@/lib/utils";

const field = "w-full rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-gold";
const label = "mb-1.5 block text-xs uppercase tracking-wider text-muted";

type Kind = "gasto" | "ingreso";

export function CashEntryModal({
  sessionId, onClose, onDone,
}: {
  sessionId: string; onClose: () => void; onDone: () => void;
}) {
  const [kind, setKind] = useState<Kind>("gasto");
  const [amount, setAmount] = useState("");
  const [concept, setConcept] = useState("");
  const [cashInBox, setCashInBox] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ k: "ok" | "err"; t: string } | null>(null);

  const reload = useCallback(async () => {
    try { setCashInBox((await getCajaInfo(sessionId)).expectedCash); } catch { /* sin conexión */ }
  }, [sessionId]);
  useEffect(() => { reload(); }, [reload]);

  const monto = Number(amount);
  const esGasto = kind === "gasto";
  // Lo que va a quedar en el cajón: verlo antes evita el gasto que descuadra.
  const queda = cashInBox === null || !Number.isFinite(monto) || !amount
    ? null
    : cashInBox + (esGasto ? -1 : 1) * Math.round(monto * 100);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await registerCashEntry({ sessionId, kind, concept, amountPesos: monto });
    setBusy(false);
    if (!res.ok) { setMsg({ k: "err", t: res.error ?? "Error" }); return; }
    if (res.comprobante) printReceiptHTML(res.comprobante);
    setMsg({ k: "ok", t: esGasto ? "Gasto registrado · imprimiendo comprobante" : "Ingreso registrado · imprimiendo comprobante" });
    setAmount(""); setConcept("");
    reload();
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg text-ink">Gasto o ingreso de caja</h3>
          <button onClick={onClose} className="text-muted hover:text-ink"><X className="h-5 w-5" /></button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-cream p-1">
          <button
            type="button"
            onClick={() => { setKind("gasto"); setMsg(null); }}
            className={cn("flex items-center justify-center gap-1.5 rounded-md py-2 text-sm transition-colors", esGasto ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink")}
          >
            <ArrowUpRight className="h-4 w-4" /> Gasto
          </button>
          <button
            type="button"
            onClick={() => { setKind("ingreso"); setMsg(null); }}
            className={cn("flex items-center justify-center gap-1.5 rounded-md py-2 text-sm transition-colors", !esGasto ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink")}
          >
            <ArrowDownLeft className="h-4 w-4" /> Ingreso
          </button>
        </div>

        <p className="mb-4 text-xs text-muted">
          {esGasto
            ? "Dinero que sale del cajón para una compra. Engrapa el comprobante al ticket de lo que compraste."
            : "Dinero que entra al cajón y no es una venta. El comprobante se queda en la caja."}
        </p>

        {cashInBox !== null && (
          <div className="mb-4 flex justify-between rounded-xl bg-cream px-4 py-3 text-sm">
            <span className="text-muted">Efectivo en caja</span>
            <span className="tabular-nums text-ink">{formatMXN(cashInBox)}</span>
          </div>
        )}

        {msg && <p className={cn("mb-4 rounded-lg px-4 py-2.5 text-sm", msg.k === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>{msg.t}</p>}

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className={label}>Importe</label>
            <input
              className={field}
              type="number"
              step="0.01"
              min="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              required
            />
            {queda !== null && (
              <p className={cn("mt-1.5 text-xs", queda < 0 ? "text-red-600" : "text-muted")}>
                {queda < 0
                  ? `No alcanza: en caja hay ${formatMXN(cashInBox!)}`
                  : `En caja quedarían ${formatMXN(queda)}`}
              </p>
            )}
          </div>

          <div>
            <label className={label}>{esGasto ? "¿En qué se gastó?" : "¿Por qué entró este dinero?"}</label>
            <input
              className={field}
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder={esGasto ? "Ej. Bolsas de regalo, envío, comida" : "Ej. Fondo del dueño, devolución de proveedor"}
              required
            />
            <p className="mt-1.5 text-xs text-muted">Se imprime en el comprobante y sale en el corte.</p>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3 text-sm uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            Registrar {esGasto ? "gasto" : "ingreso"}
          </button>
        </form>
      </div>
    </div>
  );
}
