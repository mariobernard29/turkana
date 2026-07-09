"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { addCreditCharge, addCreditPayment, setCreditLimit, toggleCreditStatus } from "@/app/admin/clientes/actions";
import { formatMXN, cn } from "@/lib/utils";

export type CreditRow = {
  id: string; customer: string; limit: number; balance: number; status: string; overdue: boolean;
};

export function CreditsManager({ rows, showCustomer = true }: { rows: CreditRow[]; showCustomer?: boolean }) {
  const router = useRouter();
  const [charge, setCharge] = useState<Record<string, string>>({});
  const [pay, setPay] = useState<Record<string, string>>({});
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

  const input = "w-24 rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm outline-none focus:border-gold";

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
              <input className={input} type="number" min="1" placeholder="Cargo $" value={charge[a.id] ?? ""} onChange={(e) => setCharge({ ...charge, [a.id]: e.target.value })} />
              <button disabled={busy === a.id || suspended || !charge[a.id]} onClick={() => run(a.id, () => addCreditCharge(a.id, Number(charge[a.id])), "Cargo registrado")}
                className="rounded-full border border-ink/15 px-4 py-1.5 text-xs text-ink hover:border-gold disabled:opacity-40">Cargar</button>
              <input className={input} type="number" min="1" placeholder="Abono $" value={pay[a.id] ?? ""} onChange={(e) => setPay({ ...pay, [a.id]: e.target.value })} />
              <button disabled={busy === a.id || !pay[a.id]} onClick={() => run(a.id, () => addCreditPayment(a.id, Number(pay[a.id])), "Pago registrado")}
                className="rounded-full bg-ink px-4 py-1.5 text-xs uppercase tracking-widest text-cream hover:bg-gold-dark disabled:opacity-40">Abonar</button>
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
