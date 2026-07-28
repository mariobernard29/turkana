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
  const raw = (k: string) => cents(d[k] ?? "");
  const cashReceived = raw("cash");

  // Los importes se toman TAL CUAL se teclean (antes las tarjetas se capaban en
  // silencio al total y el sobrepago desaparecía sin avisar).
  // Rewards es la excepción: nunca puede pasar del saldo del cliente.
  const rewardsTyped = raw("rewards");
  const rewardsApplied = Math.min(rewardsTyped, rewardsMax);
  const rewardsOver = rewardsTyped - rewardsApplied;
  const cardsTotal = nonCashKeys.filter((k) => k !== "rewards").reduce((s, k) => s + raw(k), 0);

  const nonCashTotal = cardsTotal + rewardsApplied;
  const cashNeeded = Math.max(0, total - nonCashTotal);
  const tendered = nonCashTotal + cashReceived;
  const remaining = Math.max(0, total - tendered);
  // El cambio sale del efectivo; de una tarjeta no se puede dar cambio.
  const change = Math.max(0, Math.min(cashReceived, tendered - total));
  const overNonCash = Math.max(0, nonCashTotal - total);
  const valid = tendered >= total && overNonCash === 0 && rewardsOver === 0;

  const press = (digit: string) => setD((p) => ({ ...p, [active]: ((p[active] ?? "") + digit).replace(/^0+/, "").slice(0, 9) }));
  const back = () => setD((p) => ({ ...p, [active]: (p[active] ?? "").slice(0, -1) }));
  const clear = () => setD((p) => ({ ...p, [active]: "" }));
  // Billetes: suman al efectivo recibido sin teclear los centavos.
  const addCash = (c: number) => setD((p) => ({ ...p, cash: String(cents(p.cash ?? "") + c) }));
  // Rellena el método activo con lo que falta para llegar al total.
  const exact = () => {
    const others = methods
      .filter((m) => m.key !== active)
      .reduce((s, m) => s + (m.key === "rewards" ? Math.min(raw("rewards"), rewardsMax) : raw(m.key)), 0);
    let fill = Math.max(0, total - others);
    if (active === "rewards") fill = Math.min(fill, rewardsMax);
    setD((p) => ({ ...p, [active]: String(fill) }));
  };

  // Se cobra exactamente el total: del efectivo sólo va lo necesario, el resto
  // es cambio. Los no-efectivo ya están validados para no exceder el total.
  const confirm = () => {
    const payments: Split[] = [];
    for (const key of nonCashKeys) {
      const amount = key === "rewards" ? rewardsApplied : raw(key);
      if (amount > 0) payments.push({ method: key, amountCents: amount });
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
              <div className="flex justify-between text-muted"><span>Recibido</span><span className="tabular-nums text-ink">{formatMXN(tendered)}</span></div>
              {remaining > 0 && (
                <div className="flex justify-between border-t border-ink/10 pt-1 font-medium text-amber-700">
                  <span>Falta</span><span className="tabular-nums">{formatMXN(remaining)}</span>
                </div>
              )}
              {change > 0 && (
                <div className="flex items-baseline justify-between border-t border-ink/10 pt-1 text-green-700">
                  <span className="font-medium">Cambio a entregar</span>
                  <span className="text-2xl font-semibold tabular-nums">{formatMXN(change)}</span>
                </div>
              )}
              {remaining === 0 && change === 0 && overNonCash === 0 && !rewardsOver && (
                <div className="flex justify-between border-t border-ink/10 pt-1 font-medium text-green-700">
                  <span>Pago exacto</span><span className="tabular-nums">{formatMXN(0)}</span>
                </div>
              )}
            </div>

            {/* De una tarjeta no se puede dar cambio: hay que corregir el importe. */}
            {overNonCash > 0 && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                Los pagos sin efectivo exceden el total por <strong>{formatMXN(overNonCash)}</strong>.
                No se puede dar cambio de una tarjeta o transferencia: ajusta el importe cobrado.
              </p>
            )}
            {rewardsOver > 0 && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                Rewards excede el saldo disponible por <strong>{formatMXN(rewardsOver)}</strong>.
              </p>
            )}
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
            {/* El teclado captura centavos (los 2 últimos dígitos), así que para
                efectivo se ofrecen billetes: "mil pesos" es un toque, no 6 teclas. */}
            {active === "cash" && (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {[10000, 20000, 50000, 100000].map((c) => (
                  <button key={c} onClick={() => addCash(c)}
                    className="rounded-xl border border-ink/15 py-2.5 text-sm tabular-nums text-ink hover:bg-cream">
                    +{formatMXN(c).replace(".00", "")}
                  </button>
                ))}
              </div>
            )}
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
