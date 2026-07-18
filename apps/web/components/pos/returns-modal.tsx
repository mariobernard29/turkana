"use client";

import { useState } from "react";
import { X, Loader2, Printer } from "lucide-react";
import { registerExchange } from "@/app/pos/caja-actions";
import type { PosVariant } from "@/components/pos/pos-sale";
import { printReceiptHTML } from "@/lib/print";
import { VariantSearch } from "@/components/pos/variant-search";
import { formatMXN } from "@/lib/utils";
import { POS_METHODS } from "@/lib/payments";

type Method = "cash" | "debit" | "credit_card" | "amex" | "transfer";
const field = "w-full rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-gold";
const label = "mb-1.5 block text-xs uppercase tracking-wider text-muted";

export function ReturnsModal({
  sessionId, variants, onClose,
}: {
  sessionId: string; variants: PosVariant[]; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ k: "ok" | "err"; t: string } | null>(null);

  const [oldV, setOldV] = useState("");
  const [newV, setNewV] = useState("");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<Method>("cash");

  const doExchange = async () => {
    setBusy(true); setMsg(null);
    const res = await registerExchange({ sessionId, returnVariantId: oldV, newVariantId: newV, qty: Number(qty), reason, method });
    setBusy(false);
    if (!res.ok) { setMsg({ k: "err", t: res.error ?? "Error" }); return; }
    if (res.comprobante) printReceiptHTML(res.comprobante);
    const diff = res.difference ?? 0;
    setMsg({ k: "ok", t: diff > 0 ? `Cambio hecho · cobrar ${formatMXN(diff)}` : diff < 0 ? `Cambio hecho · reembolsar ${formatMXN(-diff)}` : "Cambio hecho · sin diferencia" });
    setOldV(""); setNewV(""); setQty("1"); setReason("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg text-ink">Cambio de pieza</h3>
          <button onClick={onClose} className="text-muted hover:text-ink"><X className="h-5 w-5" /></button>
        </div>

        {msg && <p className={`mb-4 rounded-lg px-4 py-2.5 text-sm ${msg.k === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.t}</p>}

        <div className="space-y-3">
          <div>
            <label className={label}>Pieza devuelta</label>
            <VariantSearch variants={variants} value={oldV} onChange={setOldV} placeholder="Buscar por nombre o SKU…" />
          </div>
          <div>
            <label className={label}>Pieza nueva</label>
            <VariantSearch variants={variants} value={newV} onChange={setNewV} placeholder="Buscar por nombre o SKU…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Cantidad</label><input className={field} type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
            <div><label className={label}>Método (diferencia)</label>
              <select className={field} value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                {POS_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </div>
          </div>
          <div><label className={label}>Motivo</label><input className={field} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <button disabled={busy || !oldV || !newV} onClick={doExchange} className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3 text-sm uppercase tracking-widest text-cream disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Registrar cambio
          </button>
        </div>
      </div>
    </div>
  );
}
