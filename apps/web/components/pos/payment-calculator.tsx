"use client";

import { useState } from "react";
import { X, Delete, Check, Bookmark, HandCoins } from "lucide-react";
import { formatMXN, cn } from "@/lib/utils";
import type { PaymentMethod } from "@/lib/payments";

type Split = { method: PaymentMethod; amountCents: number };

export function PaymentCalculator({
  total,
  rewardsMax = 0,
  canLayaway = false,
  canCredit = false,
  title = "Cobro",
  confirmLabel = "Cobrar",
  onConfirm,
  onLayaway,
  onCredit,
  onClose,
}: {
  total: number;
  rewardsMax?: number;
  canLayaway?: boolean;
  canCredit?: boolean;
  // El admin la reutiliza para corregir el desglose de una venta ya cobrada.
  title?: string;
  confirmLabel?: string;
  onConfirm: (payments: Split[]) => void;
  // Alternativas al cobro completo: dejar la pieza apartada o fiarla.
  onLayaway?: () => void;
  onCredit?: () => void;
  onClose: () => void;
}) {
  // Métodos disponibles. Los no-efectivo se aplican en este orden; efectivo cubre el resto.
  const methods: { key: PaymentMethod; label: string }[] = [
    { key: "debit", label: "Débito" },
    { key: "credit_card", label: "Crédito" },
    { key: "amex", label: "American Express" },
    { key: "transfer", label: "Transferencia" },
    ...(rewardsMax > 0 ? [{ key: "rewards" as PaymentMethod, label: "Rewards" }] : []),
    { key: "cash", label: "Efectivo" },
  ];
  const nonCashKeys = methods.map((m) => m.key).filter((k) => k !== "cash");

  const [active, setActive] = useState<PaymentMethod>(rewardsMax > 0 ? "rewards" : "cash");
  // Montos en centavos como cadena de dígitos (los 2 últimos son decimales).
  const [d, setD] = useState<Record<string, string>>(() =>
    Object.fromEntries(methods.map((m) => [m.key, ""])),
  );

  const cents = (s: string) => Number(s || "0");
  const cashReceived = cents(d.cash ?? "");

  // Aplicar cada método no-efectivo en orden, capando a lo que falta (rewards además al saldo).
  const applied: Record<string, number> = {};
  let acc = 0;
  for (const key of nonCashKeys) {
    const cap = key === "rewards" ? Math.min(rewardsMax, total - acc) : total - acc;
    const a = Math.max(0, Math.min(cents(d[key] ?? ""), Math.max(0, cap)));
    applied[key] = a;
    acc += a;
  }
  const nonCashTotal = acc;
  const cashNeeded = Math.max(0, total - nonCashTotal);
  const tendered = nonCashTotal + cashReceived;
  const change = Math.max(0, cashReceived - cashNeeded);
  const remaining = Math.max(0, total - tendered);
  const valid = tendered >= total;

  const press = (digit: string) => setD((p) => ({ ...p, [active]: ((p[active] ?? "") + digit).replace(/^0+/, "").slice(0, 9) }));
  const back = () => setD((p) => ({ ...p, [active]: (p[active] ?? "").slice(0, -1) }));
  const clear = () => setD((p) => ({ ...p, [active]: "" }));
  // Rellena el método activo con lo que falta para llegar al total.
  const exact = () => {
    const already = methods
      .map((m) => m.key)
      .filter((k) => k !== active)
      .reduce((s, k) => s + Math.min(cents(d[k] ?? ""), k === "rewards" ? rewardsMax : total), 0);
    let fill = Math.max(0, total - already);
    if (active === "rewards") fill = Math.min(fill, rewardsMax);
    setD((p) => ({ ...p, [active]: String(fill) }));
  };

  const confirm = () => {
    const payments: Split[] = [];
    for (const key of nonCashKeys) {
      if (applied[key] > 0) payments.push({ method: key, amountCents: applied[key] });
    }
    if (cashNeeded > 0) payments.push({ method: "cash", amountCents: cashNeeded });
    if (payments.length === 0) payments.push({ method: "cash", amountCents: total });
    onConfirm(payments);
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "del"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          {/* El h3 es serif por defecto (globals.css); el importe va en sans. */}
          <h3 className="text-lg text-ink">
            {title} · <span className="font-sans font-semibold tabular-nums">{formatMXN(total)}</span>
          </h3>
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
                {/* Importes en sans con tabular-nums, igual que Total/Pagado/Falta */}
                <span className="text-lg font-semibold tabular-nums text-ink">{formatMXN(cents(d[m.key]))}</span>
              </button>
            ))}

            <div className="space-y-1 rounded-xl bg-cream p-4 text-sm">
              <div className="flex justify-between text-muted"><span>Total</span><span className="tabular-nums text-ink">{formatMXN(total)}</span></div>
              <div className="flex justify-between text-muted"><span>Pagado</span><span className="tabular-nums text-ink">{formatMXN(Math.min(tendered, total))}</span></div>
              {remaining > 0
                ? <div className="flex justify-between font-medium text-amber-700"><span>Falta</span><span className="tabular-nums">{formatMXN(remaining)}</span></div>
                : <div className="flex justify-between font-medium text-green-700"><span>Cambio</span><span className="tabular-nums">{formatMXN(change)}</span></div>}
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
            {/* Alternativas al cobro completo, junto al teclado para no alargar el modal */}
            {(onLayaway || onCredit) && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {onLayaway && (
                  <button
                    onClick={onLayaway}
                    disabled={!canLayaway}
                    title={!canLayaway ? "Agrega piezas al ticket (requiere conexión)" : "La pieza se queda en tienda hasta liquidar"}
                    className="flex items-center justify-center gap-2 rounded-xl border border-ink/15 py-3 text-sm text-ink hover:bg-cream disabled:opacity-40"
                  >
                    <Bookmark className="h-4 w-4" /> Apartar
                  </button>
                )}
                {onCredit && (
                  <button
                    onClick={onCredit}
                    disabled={!canCredit}
                    title={!canCredit ? "Adjunta un cliente para fiar (requiere conexión)" : "El cliente se lleva la pieza y queda el saldo"}
                    className="flex items-center justify-center gap-2 rounded-xl border border-ink/15 py-3 text-sm text-ink hover:bg-cream disabled:opacity-40"
                  >
                    <HandCoins className="h-4 w-4" /> Fiado
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={confirm}
          disabled={!valid}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-4 text-sm uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark disabled:opacity-40"
        >
          <Check className="h-4 w-4" /> {confirmLabel} <span className="tabular-nums">{formatMXN(total)}</span>
          {change > 0 ? <> · cambio <span className="tabular-nums">{formatMXN(change)}</span></> : ""}
        </button>
      </div>
    </div>
  );
}
