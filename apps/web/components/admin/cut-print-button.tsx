"use client";

// Reimprime el ticket de un corte de caja ya cerrado (mismo contenido que el correo).
import { useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { getCashCutReceipt } from "@/app/pos/corte-actions";
import { printReceiptHTML } from "@/lib/print";

export function CutPrintButton({ sessionId }: { sessionId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const print = async () => {
    setBusy(true); setError(null);
    const res = await getCashCutReceipt(sessionId);
    setBusy(false);
    if (!res.ok || !res.receipt) { setError(res.error ?? "No se pudo armar el corte"); return; }
    printReceiptHTML({ ...res.receipt, reprint: true });
  };

  return (
    <div className="text-right">
      <button
        onClick={print}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 text-sm text-ink hover:border-gold disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
        Imprimir corte
      </button>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
