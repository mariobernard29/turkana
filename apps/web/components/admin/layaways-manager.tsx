"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, X } from "lucide-react";
import { addLayawayPayment, convertLayawayToSale, cancelLayaway } from "@/app/admin/clientes/actions";
import { formatMXN, cn } from "@/lib/utils";

export type LayawayRow = {
  id: string; customer: string; item: string; total: number; paid: number; dueDate: string | null; status: string;
};

export function LayawaysManager({ rows, showCustomer = true }: { rows: LayawayRow[]; showCustomer?: boolean }) {
  const router = useRouter();
  const [amount, setAmount] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ k: "ok" | "err"; t: string } | null>(null);

  const run = async (id: string, fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) => {
    setBusy(id); setMsg(null);
    const res = await fn();
    setBusy(null);
    if (res.ok) { setMsg({ k: "ok", t: okText }); router.refresh(); }
    else setMsg({ k: "err", t: res.error ?? "Error" });
  };

  if (rows.length === 0) return <p className="rounded-2xl border border-ink/10 bg-white p-6 text-sm text-muted">Sin apartados.</p>;

  return (
    <div className="space-y-3">
      {msg && <p className={cn("rounded-lg px-4 py-2.5 text-sm", msg.k === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>{msg.t}</p>}
      {rows.map((l) => {
        const pending = l.total - l.paid;
        const active = l.status === "active";
        const pct = l.total > 0 ? Math.min(100, Math.round((l.paid / l.total) * 100)) : 0;
        return (
          <div key={l.id} className="rounded-2xl border border-ink/10 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-ink">{l.item}{showCustomer && <span className="text-muted"> · {l.customer}</span>}</p>
                <p className="text-xs text-muted">
                  {formatMXN(l.paid)} de {formatMXN(l.total)} · resta {formatMXN(pending)}
                  {l.dueDate ? ` · vence ${new Date(l.dueDate).toLocaleDateString("es-MX")}` : ""}
                  {!active && <span className="ml-1 uppercase">· {l.status}</span>}
                </p>
              </div>
              {active && (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number" min="1" placeholder="Abono $"
                    value={amount[l.id] ?? ""} onChange={(e) => setAmount({ ...amount, [l.id]: e.target.value })}
                    className="w-28 rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm outline-none focus:border-gold"
                  />
                  <button disabled={busy === l.id || !amount[l.id]} onClick={() => run(l.id, () => addLayawayPayment(l.id, Number(amount[l.id])), "Abono registrado")}
                    className="rounded-full bg-ink px-4 py-1.5 text-xs uppercase tracking-widest text-cream hover:bg-gold-dark disabled:opacity-40">Abonar</button>
                  <button disabled={busy === l.id || pending > 0} title={pending > 0 ? "Aún hay saldo pendiente" : "Convertir en venta"}
                    onClick={() => run(l.id, () => convertLayawayToSale(l.id), "Apartado convertido en venta")}
                    className="rounded-full border border-gold/40 bg-gold/5 px-4 py-1.5 text-xs text-gold-dark hover:bg-gold/10 disabled:opacity-40">Entregar</button>
                  <button disabled={busy === l.id} onClick={() => { if (confirm("¿Cancelar apartado?")) run(l.id, () => cancelLayaway(l.id), "Apartado cancelado"); }}
                    className="text-muted hover:text-red-600"><X className="h-4 w-4" /></button>
                </div>
              )}
              {busy === l.id && <Loader2 className="h-4 w-4 animate-spin text-gold" />}
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-sand">
              <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
            </div>
            {pending === 0 && active && <p className="mt-1 flex items-center gap-1 text-xs text-green-600"><Check className="h-3 w-3" /> Liquidado · listo para entregar</p>}
          </div>
        );
      })}
    </div>
  );
}
