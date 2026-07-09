"use client";

import { useState } from "react";
import { Check, Printer, Usb } from "lucide-react";
import type { SaleResult } from "@/app/pos/actions";
import { formatMXN } from "@/lib/utils";
import { printReceiptHTML, printEscPosUSB } from "@/lib/print";

const METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia", rewards: "Rewards",
};

export function TicketModal({
  ticket,
  onClose,
}: {
  ticket: NonNullable<SaleResult["ticket"]>;
  onClose: () => void;
}) {
  const [printErr, setPrintErr] = useState<string | null>(null);
  const receipt = {
    orderNumber: ticket.orderNumber,
    items: ticket.items.map((it) => ({ name: it.name, quantity: it.quantity, total_cents: it.total_cents })),
    subtotal: ticket.subtotal, tax: ticket.tax, total: ticket.total, discountCents: ticket.discountCents, payments: ticket.payments,
  };
  const printUsb = async () => {
    setPrintErr(null);
    try { await printEscPosUSB(receipt); } catch (e) { setPrintErr(String((e as Error).message ?? e)); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-xs rounded-2xl bg-white p-6">
        <div className="mb-4 flex flex-col items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-600">
            <Check className="h-6 w-6" />
          </div>
          <h3 className="text-lg text-ink">Venta realizada</h3>
          <p className="text-xs text-muted">{ticket.orderNumber}</p>
        </div>

        <div className="space-y-1.5 border-y border-dashed border-ink/20 py-3 text-sm">
          {ticket.items.map((it, i) => (
            <div key={i} className="flex justify-between">
              <span className="text-muted">{it.quantity}× {it.name}</span>
              <span className="text-ink">{formatMXN(it.total_cents)}</span>
            </div>
          ))}
        </div>

        <div className="space-y-1 py-3 text-sm">
          {ticket.discountCents > 0 && (
            <div className="flex justify-between text-gold"><span>Descuento</span><span>−{formatMXN(ticket.discountCents)}</span></div>
          )}
          <div className="flex justify-between text-muted"><span>Subtotal</span><span>{formatMXN(ticket.subtotal)}</span></div>
          <div className="flex justify-between text-muted"><span>IVA (16%)</span><span>{formatMXN(ticket.tax)}</span></div>
          <div className="flex justify-between text-base text-ink"><span className="font-serif">Total</span><span className="font-serif">{formatMXN(ticket.total)}</span></div>
          {ticket.payments.map((p, i) => (
            <div key={i} className="flex justify-between pt-1 text-muted"><span>Pago {METHOD_LABEL[p.method] ?? p.method}</span><span>{formatMXN(p.amount_cents)}</span></div>
          ))}
        </div>

        {printErr && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{printErr}</p>}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => printReceiptHTML(receipt)}
            className="flex items-center justify-center gap-2 rounded-full border border-ink/15 py-3 text-sm text-ink hover:border-gold"
          >
            <Printer className="h-4 w-4" /> Imprimir
          </button>
          <button
            onClick={printUsb}
            className="flex items-center justify-center gap-2 rounded-full border border-ink/15 py-3 text-sm text-ink hover:border-gold"
            title="Impresora térmica USB (ESC/POS)"
          >
            <Usb className="h-4 w-4" /> ESC/POS
          </button>
        </div>
        <button
          onClick={onClose}
          className="mt-2 w-full rounded-full bg-ink py-3 text-sm uppercase tracking-widest text-cream hover:bg-gold-dark"
        >
          Nueva venta
        </button>
      </div>
    </div>
  );
}
