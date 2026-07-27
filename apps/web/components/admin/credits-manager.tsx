"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { setCreditLimit, toggleCreditStatus } from "@/app/admin/clientes/actions";
import { formatMXN, cn } from "@/lib/utils";

export type CreditRow = {
  id: string; customer: string; limit: number; balance: number; status: string; overdue: boolean;
};

// Consulta y administración (límite / suspensión). Los cargos nacen de una venta
// a crédito en el POS y los abonos se cobran ahí mismo, para que cuadren en caja.
export function CreditsManager({ rows, showCustomer = true }: { rows: CreditRow[]; showCustomer?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ k: "ok" | "err"; t: string } | null>(null);

  const run = async (id: string, fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) => {
    setBusy(id); setMsg(null);
    const res = await fn();
    setBusy(null);
    if (res.ok) { setMsg({ k: "ok", t: okText }); router.refresh(); }
    else setMsg({ k: "err", t: res.error ?? "Error" });
  };

  if (rows.length === 0) return <p className="rounded-2xl border border-ink/10 bg-white p-6 text-sm text-muted">Sin cuentas de crédito.</p>;

  return (
    <div className="space-y-3">
      {msg && <p className={cn("rounded-lg px-4 py-2.5 text-sm", msg.k === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>{msg.t}</p>}
      {rows.map((a) => {
        const available = a.limit - a.balance;
        const suspended = a.status === "suspended";
        return (
          <div key={a.id} className={cn("rounded-2xl border bg-white p-4 shadow-sm", a.overdue ? "border-red-200" : "border-ink/10")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                {showCustomer && <p className="text-ink">{a.customer}</p>}
                <p className="text-xs text-muted">
                  Debe <span className={a.balance > 0 ? "text-ink" : ""}>{formatMXN(a.balance)}</span> de {formatMXN(a.limit)} · disponible {formatMXN(available)}
                  {a.overdue && <span className="ml-1 font-medium text-red-600">· VENCIDO</span>}
                  {suspended && <span className="ml-1 uppercase text-amber-700">· suspendida</span>}
                </p>
              </div>
              {busy === a.id && <Loader2 className="h-4 w-4 animate-spin text-gold" />}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="mr-1 text-xs text-muted">Cargos y abonos en el POS</span>
              <button disabled={busy === a.id} onClick={() => run(a.id, () => toggleCreditStatus(a.id, suspended ? "active" : "suspended"), suspended ? "Reactivada" : "Suspendida")}
                className="rounded-full border border-ink/15 px-4 py-1.5 text-xs text-muted hover:border-gold disabled:opacity-40">{suspended ? "Reactivar" : "Suspender"}</button>
              <button disabled={busy === a.id} onClick={() => { const v = prompt("Nuevo límite en pesos:", String(a.limit / 100)); if (v) run(a.id, () => setCreditLimit(a.id, Number(v)), "Límite actualizado"); }}
                className="rounded-full border border-ink/15 px-4 py-1.5 text-xs text-muted hover:border-gold disabled:opacity-40">Límite</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
