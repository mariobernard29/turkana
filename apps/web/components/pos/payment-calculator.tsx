"use client";

import { useState } from "react";
import { X, Delete, Check } from "lucide-react";
import { formatMXN, cn } from "@/lib/utils";

type Method = "card" | "transfer" | "rewards" | "cash";
type Split = { method: "cash" | "card" | "transfer" | "rewards"; amountCents: number };

export function PaymentCalculator({
  total,
  rewardsMax = 0,
  onConfirm,
  onClose,
}: {
  total: number;
  rewardsMax?: number;
  onConfirm: (payments: Split[]) => void;
  onClose: () => void;
}) {
  const methods: { key: Method; label: string }[] = [
    { key: "card", label: "Tarjeta" },
    { key: "transfer", label: "Transferencia" },
    ...(rewardsMax > 0 ? [{ key: "rewards" as Method, label: "Rewards" }] : []),
    { key: "cash", label: "Efectivo" },
  ];

  const [active, setActive] = useState<Method>(rewardsMax > 0 ? "rewards" : "cash");
  // Montos en centavos como cadena de dígitos (los 2 últimos son decimales).
  const [d, setD] = useState<Record<Method, string>>({ card: "", transfer: "", rewards: "", cash: "" });

  const cents = (s: string) => Number(s || "0");
  const cashReceived = cents(d.cash);

  const cardApplied = Math.min(cents(d.card), total);
  const transferApplied = Math.min(cents(d.transfer), total - cardApplied);
  const rewardsApplied = Math.min(cents(d.rewards), rewardsMax, total - cardApplied - transferApplied);
  const cashNeeded = Math.max(0, total - cardApplied - transferApplied - rewardsApplied);
  const tendered = cardApplied + transferApplied + rewardsApplied + cashReceived;
  const change = Math.max(0, cashReceived - cashNeeded);
  const remaining = Math.max(0, total - tendered);
  const valid = tendered >= total;

  const press = (digit: string) => setD((p) => ({ ...p, [active]: (p[active] + digit).replace(/^0+/, "").slice(0, 9) }));
  const back = () => setD((p) => ({ ...p, [active]: p[active].slice(0, -1) }));
  const clear = () => setD((p) => ({ ...p, [active]: "" }));
  // Rellena el método activo con lo que falta para llegar al total.
  const exact = () => {
    const already = (["card", "transfer", "rewards", "cash"] as Method[])
      .filter((m) => m !== active)
      .reduce((s, m) => s + Math.min(cents(d[m]), m === "rewards" ? rewardsMax : total), 0);
    let fill = Math.max(0, total - already);
    if (active === "rewards") fill = Math.min(fill, rewardsMax);
    setD((p) => ({ ...p, [active]: String(fill) }));
  };

  const confirm = () => {
    const payments: Split[] = [];
    if (cardApplied > 0) payments.push({ method: "card", amountCents: cardApplied });
    if (transferApplied > 0) payments.push({ method: "transfer", amountCents: transferApplied });
    if (rewardsApplied > 0) payments.push({ method: "rewards", amountCents: rewardsApplied });
    if (cashNeeded > 0) payments.push({ method: "cash", amountCents: cashNeeded });
    if (payments.length === 0) payments.push({ method: "cash", amountCents: total });
    onConfirm(payments);
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "del"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg text-ink">Cobro · {formatMXN(total)}</h3>
          <button onClick={onClose} className="text-muted hover:text-ink"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {/* Resumen + métodos */}
          <div className="space-y-3">
            {methods.map((m) => (
              <button
                key={m.key}
                onClick={() => setActive(m.key)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors",
                  active === m.key ? "border-ink bg-cream" : "border-ink/15",
                )}
              >
                <span className="text-sm text-ink">
                  {m.label}
                  {m.key === "cash" ? " (recibido)" : ""}
                  {m.key === "rewards" ? <span className="ml-1 text-xs text-gold">máx {formatMXN(rewardsMax)}</span> : ""}
                </span>
                <span className="font-serif text-lg text-ink">{formatMXN(cents(d[m.key]))}</span>
              </button>
            ))}

            <div className="space-y-1 rounded-xl bg-cream p-4 text-sm">
              <div className="flex justify-between text-muted"><span>Total</span><span className="text-ink">{formatMXN(total)}</span></div>
              <div className="flex justify-between text-muted"><span>Pagado</span><span className="text-ink">{formatMXN(Math.min(tendered, total))}</span></div>
              {remaining > 0
                ? <div className="flex justify-between font-medium text-amber-700"><span>Falta</span><span>{formatMXN(remaining)}</span></div>
                : <div className="flex justify-between font-medium text-green-700"><span>Cambio</span><span>{formatMXN(change)}</span></div>}
            </div>
          </div>

          {/* Teclado */}
          <div>
            <div className="grid grid-cols-3 gap-2">
              {keys.map((k) => (
                <button
                  key={k}
                  onClick={() => (k === "del" ? back() : press(k))}
                  className="flex items-center justify-center rounded-xl border border-ink/15 py-4 text-xl text-ink transition-colors hover:bg-cream active:bg-sand"
                >
                  {k === "del" ? <Delete className="h-5 w-5" /> : k}
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button onClick={clear} className="rounded-xl border border-ink/15 py-3 text-sm text-ink hover:bg-cream">Limpiar</button>
              <button onClick={exact} className="rounded-xl border border-ink/15 py-3 text-sm text-ink hover:bg-cream">Exacto</button>
            </div>
          </div>
        </div>

        <button
          onClick={confirm}
          disabled={!valid}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-4 text-sm uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark disabled:opacity-40"
        >
          <Check className="h-4 w-4" /> Cobrar {formatMXN(total)}{change > 0 ? ` · cambio ${formatMXN(change)}` : ""}
        </button>
      </div>
    </div>
  );
}
