"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { openSession } from "@/app/pos/actions";

export function PosOpen({ registers }: { registers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [registerId, setRegisterId] = useState(registers[0]?.id ?? "");
  const [float, setFloat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await openSession({ registerId, openingFloatPesos: Number(float) || 0 });
    setBusy(false);
    if (!res.ok) { setError(res.error ?? "Error"); return; }
    router.refresh();
  };

  const field = "w-full rounded-xl border border-ink/15 bg-white px-4 py-4 text-lg outline-none focus:border-gold";

  return (
    <div className="flex h-full items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl border border-ink/10 bg-white p-8">
        <h1 className="text-center text-3xl text-ink">Apertura de caja</h1>
        <p className="mb-8 mt-2 text-center text-sm text-muted">Inicia tu turno para comenzar a vender</p>

        <div className="space-y-5">
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Caja</label>
            <select className={field} value={registerId} onChange={(e) => setRegisterId(e.target.value)} required>
              {registers.length === 0 && <option value="">Sin cajas configuradas</option>}
              {registers.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Fondo inicial (efectivo)</label>
            <input
              type="number" min="0" step="0.01" inputMode="decimal"
              className={field} placeholder="0.00"
              value={float} onChange={(e) => setFloat(e.target.value)} required
            />
          </div>
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={busy || !registerId}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-4 text-sm uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Abrir caja
        </button>
      </form>
    </div>
  );
}
