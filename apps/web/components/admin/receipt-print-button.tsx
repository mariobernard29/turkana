"use client";

// Reimprime el ticket de una venta ya registrada (el ReceiptData se arma en el
// server component desde la orden guardada).
import { Printer } from "lucide-react";
import { printReceiptHTML } from "@/lib/print";
import type { ReceiptData } from "@/lib/escpos";

export function ReceiptPrintButton({
  receipt,
  label = "Reimprimir ticket",
}: {
  receipt: ReceiptData;
  label?: string;
}) {
  return (
    <button
      onClick={() => printReceiptHTML(receipt)}
      className="inline-flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 text-sm text-ink hover:border-gold"
    >
      <Printer className="h-4 w-4" /> {label}
    </button>
  );
}
