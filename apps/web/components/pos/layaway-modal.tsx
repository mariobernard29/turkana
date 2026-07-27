"use client";

// Apartar las piezas del carrito: reserva el inventario y cobra el anticipo.
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { createLayawayFromCart } from "@/app/pos/account-actions";
import { CustomerSearch } from "@/components/pos/customer-search";
import type { PosCustomer } from "@/app/pos/customer-actions";
import { printReceiptHTML } from "@/lib/print";
import { POS_METHODS } from "@/lib/payments";
import { formatMXN } from "@/lib/utils";

type Method = "cash" | "debit" | "credit_card" | "amex" | "transfer";

export function LayawayModal({
  sessionId,
  lines,
  total,
  customer,
  onDone,
  onClose,
}: {
  sessionId: string;
  lines: { variantId: string; name: string; qty: number; priceCents: number }[];
  total: number;
  customer: PosCustomer | null;
  onDone: () => void;
  onClose: () => void;
}) {
  const [client, setClient] = useState<PosCustomer | null>(customer);
  const [anticipoStr, setAnticipoStr] = useState("");
  const [method, setMethod] = useState<Method>("cash");
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = "w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-sm outline-none focus:border-gold";
  const anticipo = Math.min(total, Math.max(0, Math.round((Number(anticipoStr) || 0) * 100)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) { setError("Selecciona el cliente del apartado"); return; }
    setBusy(true); setError(null);
    const res = await createLayawayFromCart({
      sessionId,
      customerId: client.id,
      items: lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
      anticipoCents: anticipo,
      method,
      dueDate,
    });
    setBusy(false);
    if (!res.ok) { setError(res.error ?? "No se pudo apartar"); return; }
    if (res.comprobante) printReceiptHTML(res.comprobante);
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6">
        <h3 className="mb-1 text-lg text-ink">Apartar piezas</h3>
        <p className="mb-4 text-sm text-muted">Las piezas quedan reservadas hasta liquidar.</p>

        <div className="mb-4 space-y-1 rounded-xl bg-cream p-4 text-sm">
          {lines.map((l) => (
            <div key={l.variantId} className="flex justify-between text-muted">
              <span>{l.qty}× {l.name}</span>
              <span className="text-ink">{formatMXN(l.priceCents * l.qty)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-ink/10 pt-1 text-muted">
            <span>Total</span><span className="text-ink">{formatMXN(total)}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>Saldo tras el anticipo</span>
            <span className="text-lg font-semibold tabular-nums text-ink">{formatMXN(total - anticipo)}</span>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Cliente</label>
            {client ? (
              <div className="flex items-center justify-between rounded-xl bg-gold/10 px-3 py-2.5 text-sm">
                <span className="text-ink">{client.name}{client.phone ? ` · ${client.phone}` : ""}</span>
                <button type="button" onClick={() => setClient(null)} className="text-muted hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <CustomerSearch onSelect={setClient} />
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Anticipo</label>
            <input className={field} type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00"
              value={anticipoStr} onChange={(e) => setAnticipoStr(e.target.value)} />
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => setAnticipoStr((total / 200).toFixed(2))}
                className="rounded-full border border-ink/15 px-3 py-1.5 text-xs text-muted hover:text-ink">50%</button>
              <button type="button" onClick={() => setAnticipoStr((total / 100).toFixed(2))}
                className="rounded-full border border-ink/15 px-3 py-1.5 text-xs text-muted hover:text-ink">Liquidar</button>
            </div>
          </div>
          {anticipo > 0 && (
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Método del anticipo</label>
              <select className={field} value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                {POS_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Fecha límite</label>
            <input className={field} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>

        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-full border border-ink/15 py-3 text-sm text-ink">Cancelar</button>
          <button type="submit" disabled={busy || !client}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-ink py-3 text-sm uppercase tracking-widest text-cream hover:bg-gold-dark disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Apartar
          </button>
        </div>
      </form>
    </div>
  );
}
