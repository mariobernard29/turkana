"use client";

// Acciones de administrador sobre una venta de tienda: corregir las formas de pago
// y cancelar el folio. Sólo se monta para super_admin / admin.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Ban, CreditCard } from "lucide-react";
import { cancelSale, updateSalePayments } from "@/app/admin/ventas/actions";
import { PaymentCalculator } from "@/components/pos/payment-calculator";
import { methodLabel } from "@/lib/payments";
import { formatMXN, cn } from "@/lib/utils";

export function SaleAdminActions({
  orderId,
  orderNumber,
  totalCents,
  payments,
}: {
  orderId: string;
  orderNumber: string;
  totalCents: number;
  payments: { method: string; amount_cents: number }[];
}) {
  const router = useRouter();
  const [showCalc, setShowCalc] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const savePayments = async (splits: { method: string; amountCents: number }[]) => {
    setShowCalc(false); setBusy(true); setMsg(null);
    const res = await updateSalePayments(orderId, splits);
    setBusy(false);
    if (!res.ok) { setMsg({ kind: "err", text: res.error ?? "Error" }); return; }
    setMsg({ kind: "ok", text: "Formas de pago actualizadas" });
    router.refresh();
  };

  const doCancel = async () => {
    setBusy(true); setMsg(null);
    const res = await cancelSale(orderId, reason);
    setBusy(false);
    if (!res.ok) { setMsg({ kind: "err", text: res.error ?? "Error" }); return; }
    setShowCancel(false); setReason("");
    setMsg({ kind: "ok", text: res.note ?? "Venta cancelada" });
    router.refresh();
  };

  return (
    <section className="rounded-2xl border border-ink/10 bg-white p-6">
      <h2 className="mb-1 text-lg text-ink">Administración de la venta</h2>
      <p className="mb-4 text-xs text-muted">
        Cobrado hoy como: {payments.length
          ? payments.map((p) => `${methodLabel(p.method)} ${formatMXN(p.amount_cents)}`).join(" · ")
          : "sin pagos registrados"}
      </p>

      {msg && (
        <p className={cn("mb-4 rounded-lg px-4 py-2.5 text-sm", msg.kind === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>
          {msg.text}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowCalc(true)}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2.5 text-sm text-ink hover:border-gold disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          Modificar formas de pago
        </button>
        <button
          onClick={() => setShowCancel(true)}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full border border-red-300 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          <Ban className="h-4 w-4" /> Cancelar venta
        </button>
      </div>

      {showCalc && (
        <PaymentCalculator
          total={totalCents}
          title="Formas de pago"
          confirmLabel="Guardar desglose de"
          onClose={() => setShowCalc(false)}
          onConfirm={(splits) => savePayments(splits.map((s) => ({ method: s.method, amountCents: s.amountCents })))}
        />
      )}

      {showCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setShowCancel(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-lg text-ink">Cancelar {orderNumber}</h3>
            <p className="mb-4 text-sm text-muted">
              Las piezas regresan al inventario y el dinero se deshace: si el turno sigue abierto el corte
              queda como si no hubiera pasado; si ya se cerró, se registra el reembolso en la caja de hoy.
            </p>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Motivo</label>
            <input
              className="w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-sm outline-none focus:border-gold"
              placeholder="Ej. se cobró la pieza equivocada"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
            <div className="mt-5 flex gap-2">
              <button onClick={() => setShowCancel(false)} className="flex-1 rounded-full border border-ink/15 py-3 text-sm text-ink">
                Volver
              </button>
              <button
                onClick={doCancel}
                disabled={busy || !reason.trim()}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-red-600 py-3 text-sm uppercase tracking-widest text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Cancelar venta
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
