"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2 } from "lucide-react";
import { getSessionTotals, closeSession } from "@/app/pos/actions";
import { formatMXN, cn } from "@/lib/utils";

type Totals = {
  openingFloat: number; expectedCash: number; expectedTransfer: number; salesCount: number;
  expectedDebit: number; expectedCredit: number; expectedAmex: number; expectedCard: number;
  refundsCents: number; dropsCents: number; discountsCents: number; precutsCents: number;
};

export function PosClose({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [totals, setTotals] = useState<Totals | null>(null);
  const [cash, setCash] = useState("");
  const [debit, setDebit] = useState("");
  const [credit, setCredit] = useState("");
  const [amex, setAmex] = useState("");
  const [transfer, setTransfer] = useState("");
  const [people, setPeople] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ expectedCash: number; countedCash: number; difference: number } | null>(null);

  useEffect(() => {
    getSessionTotals(sessionId).then((t) => setTotals(t as Totals));
  }, [sessionId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await closeSession({
      sessionId,
      countedCashPesos: Number(cash) || 0,
      countedDebitPesos: Number(debit) || 0,
      countedCreditPesos: Number(credit) || 0,
      countedAmexPesos: Number(amex) || 0,
      countedTransferPesos: Number(transfer) || 0,
      peopleServed: Number(people) || 0,
    });
    setBusy(false);
    if (!res.ok) { setError(res.error ?? "Error"); return; }
    setDone(res.summary ?? null);
  };

  const field = "w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-lg outline-none focus:border-gold";
  const label = "mb-1.5 block text-xs uppercase tracking-wider text-muted";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl text-ink">Corte de caja</h3>
          {!done && <button onClick={onClose} className="text-muted hover:text-ink"><X className="h-5 w-5" /></button>}
        </div>

        {!totals ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
        ) : done ? (
          <div className="text-center">
            <p className="text-sm text-muted">Efectivo esperado</p>
            <p className="font-serif text-2xl text-ink">{formatMXN(done.expectedCash)}</p>
            <p className="mt-3 text-sm text-muted">Contado</p>
            <p className="font-serif text-2xl text-ink">{formatMXN(done.countedCash)}</p>
            <p className="mt-4 text-sm text-muted">Diferencia</p>
            <p className={cn("font-serif text-3xl", done.difference === 0 ? "text-green-600" : done.difference > 0 ? "text-blue-600" : "text-red-600")}>
              {done.difference >= 0 ? "+" : ""}{formatMXN(done.difference)}
            </p>
            <button
              onClick={() => { router.refresh(); }}
              className="mt-8 w-full rounded-full bg-ink py-3.5 text-sm uppercase tracking-widest text-cream hover:bg-gold-dark"
            >
              Cerrar turno
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="mb-5 space-y-1 rounded-xl bg-cream p-4 text-sm">
              <div className="flex justify-between text-muted"><span>Fondo inicial</span><span>{formatMXN(totals.openingFloat)}</span></div>
              <div className="flex justify-between text-muted"><span>Ventas</span><span>{totals.salesCount}</span></div>
              {totals.discountsCents > 0 && <div className="flex justify-between text-muted"><span>Descuentos otorgados</span><span className="text-gold">−{formatMXN(totals.discountsCents)}</span></div>}
              {totals.refundsCents > 0 && <div className="flex justify-between text-muted"><span>Reembolsos / cambios</span><span className="text-red-600">−{formatMXN(totals.refundsCents)}</span></div>}
              {totals.dropsCents > 0 && <div className="flex justify-between text-muted"><span>Resguardos</span><span>−{formatMXN(totals.dropsCents)}</span></div>}
              {totals.precutsCents > 0 && <div className="flex justify-between text-muted"><span>Precortes</span><span>{formatMXN(totals.precutsCents)}</span></div>}
              <div className="mt-1 flex justify-between border-t border-ink/10 pt-1 text-muted"><span>Efectivo esperado</span><span className="text-ink">{formatMXN(totals.expectedCash)}</span></div>
              <div className="flex justify-between text-muted"><span>Débito esperado</span><span className="text-ink">{formatMXN(totals.expectedDebit)}</span></div>
              <div className="flex justify-between text-muted"><span>Crédito esperado</span><span className="text-ink">{formatMXN(totals.expectedCredit)}</span></div>
              <div className="flex justify-between text-muted"><span>Amex esperado</span><span className="text-ink">{formatMXN(totals.expectedAmex)}</span></div>
              {totals.expectedCard > 0 && <div className="flex justify-between text-muted"><span>Tarjeta (histórico)</span><span className="text-ink">{formatMXN(totals.expectedCard)}</span></div>}
              <div className="flex justify-between text-muted"><span>Transferencia esperada</span><span className="text-ink">{formatMXN(totals.expectedTransfer)}</span></div>
            </div>

            <div className="space-y-4">
              <div><label className={label}>Efectivo contado</label><input type="number" step="0.01" inputMode="decimal" className={field} value={cash} onChange={(e) => setCash(e.target.value)} required /></div>
              <div><label className={label}>Débito contado</label><input type="number" step="0.01" inputMode="decimal" className={field} value={debit} onChange={(e) => setDebit(e.target.value)} /></div>
              <div><label className={label}>Crédito contado</label><input type="number" step="0.01" inputMode="decimal" className={field} value={credit} onChange={(e) => setCredit(e.target.value)} /></div>
              <div><label className={label}>American Express contado</label><input type="number" step="0.01" inputMode="decimal" className={field} value={amex} onChange={(e) => setAmex(e.target.value)} /></div>
              <div><label className={label}>Transferencias</label><input type="number" step="0.01" inputMode="decimal" className={field} value={transfer} onChange={(e) => setTransfer(e.target.value)} /></div>
              <div><label className={label}>Personas atendidas</label><input type="number" min="0" step="1" inputMode="numeric" className={field} value={people} onChange={(e) => setPeople(e.target.value)} placeholder="¿A cuántas personas atendiste hoy?" /></div>
            </div>

            {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3.5 text-sm uppercase tracking-widest text-cream hover:bg-gold-dark disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Cerrar caja
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
