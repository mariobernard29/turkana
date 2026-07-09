"use client";

import { useEffect, useState, useCallback } from "react";
import { X, Loader2, AlertTriangle, ShieldCheck, Printer } from "lucide-react";
import { getCajaInfo, createCashDrop, precut, type CajaInfo } from "@/app/pos/caja-actions";
import { printReceiptHTML } from "@/lib/print";
import { formatMXN, cn } from "@/lib/utils";

const field = "w-full rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-gold";
const label = "mb-1.5 block text-xs uppercase tracking-wider text-muted";

export function CajaPanel({
  sessionId, onClose,
}: {
  sessionId: string; onClose: () => void;
}) {
  const [tab, setTab] = useState<"resguardo" | "precorte">("resguardo");
  const [info, setInfo] = useState<CajaInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ k: "ok" | "err"; t: string } | null>(null);

  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const [cash, setCash] = useState("");
  const [card, setCard] = useState("");
  const [transfer, setTransfer] = useState("");
  const [newCashier, setNewCashier] = useState("");

  const reload = useCallback(async () => { setInfo(await getCajaInfo(sessionId)); }, [sessionId]);
  useEffect(() => { reload(); }, [reload]);

  const overLimit = info && info.thresholdCents > 0 && info.expectedCash >= info.thresholdCents;

  const doDrop = async () => {
    setBusy(true); setMsg(null);
    const res = await createCashDrop({ sessionId, amountPesos: Number(amount), notes });
    setBusy(false);
    if (!res.ok) { setMsg({ k: "err", t: res.error ?? "Error" }); return; }
    if (res.comprobante) printReceiptHTML(res.comprobante);
    setMsg({ k: "ok", t: "Resguardo registrado" });
    setAmount(""); setNotes(""); reload();
  };

  const doPrecut = async () => {
    setBusy(true); setMsg(null);
    const res = await precut({ sessionId, cashPesos: Number(cash), cardPesos: Number(card), transferPesos: Number(transfer), newCashierId: newCashier || undefined });
    setBusy(false);
    if (!res.ok) { setMsg({ k: "err", t: res.error ?? "Error" }); return; }
    if (res.comprobante) printReceiptHTML(res.comprobante);
    setMsg({ k: "ok", t: newCashier ? "Precorte hecho · cajero actualizado" : "Precorte registrado" });
    setCash(""); setCard(""); setTransfer(""); setNewCashier(""); reload();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex gap-1 rounded-lg bg-cream p-1">
            <button onClick={() => setTab("resguardo")} className={cn("rounded-md px-4 py-1.5 text-sm", tab === "resguardo" ? "bg-white text-ink shadow-sm" : "text-muted")}>Resguardo</button>
            <button onClick={() => setTab("precorte")} className={cn("rounded-md px-4 py-1.5 text-sm", tab === "precorte" ? "bg-white text-ink shadow-sm" : "text-muted")}>Precorte</button>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink"><X className="h-5 w-5" /></button>
        </div>

        {!info ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
        ) : (
          <>
            <div className="mb-4 space-y-1 rounded-xl bg-cream p-4 text-sm">
              <div className="flex justify-between text-muted"><span>Efectivo en caja</span><span className="text-ink">{formatMXN(info.expectedCash)}</span></div>
              <div className="flex justify-between text-muted"><span>Tarjeta</span><span className="text-ink">{formatMXN(info.expectedCard)}</span></div>
              <div className="flex justify-between text-muted"><span>Transferencias</span><span className="text-ink">{formatMXN(info.expectedTransfer)}</span></div>
            </div>

            {overLimit && (
              <p className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
                <AlertTriangle className="h-4 w-4" /> Supera el límite de {formatMXN(info.thresholdCents)} — haz un resguardo.
              </p>
            )}
            {msg && <p className={cn("mb-4 rounded-lg px-4 py-2.5 text-sm", msg.k === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>{msg.t}</p>}

            {tab === "resguardo" ? (
              <div className="space-y-3">
                <div><label className={label}>Importe a resguardar</label><input className={field} type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
                <div><label className={label}>Notas</label><input className={field} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Caja fuerte" /></div>
                <button disabled={busy} onClick={doDrop} className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3 text-sm uppercase tracking-widest text-cream disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Registrar resguardo
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div><label className={label}>Efectivo</label><input className={field} type="number" step="0.01" value={cash} onChange={(e) => setCash(e.target.value)} /></div>
                  <div><label className={label}>Tarjeta</label><input className={field} type="number" step="0.01" value={card} onChange={(e) => setCard(e.target.value)} /></div>
                  <div><label className={label}>Transfer.</label><input className={field} type="number" step="0.01" value={transfer} onChange={(e) => setTransfer(e.target.value)} /></div>
                </div>
                <div><label className={label}>Cambiar cajero (opcional)</label>
                  <select className={field} value={newCashier} onChange={(e) => setNewCashier(e.target.value)}>
                    <option value="">Mantener cajero actual</option>
                    {info.staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                </div>
                <button disabled={busy} onClick={doPrecut} className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3 text-sm uppercase tracking-widest text-cream disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Generar precorte
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
