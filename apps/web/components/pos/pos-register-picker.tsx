"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Monitor, Tablet } from "lucide-react";
import { selectRegister } from "@/app/pos/actions";
import { setRegisterId } from "@/lib/offline/device";

export type PickerRegister = {
  id: string;
  name: string;
  openTurn: { cashier: string; openedAt: string } | null;
};

// Primera pantalla de un equipo nuevo: decir qué caja es. Se pregunta una sola
// vez y queda guardado; a partir de ahí este equipo siempre cobra en esa caja,
// con su propio fondo y su propio corte.
export function PosRegisterPicker({ registers }: { registers: PickerRegister[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (id: string) => {
    setError(null);
    setBusy(id);
    const res = await selectRegister(id);
    if (!res.ok) {
      setBusy(null);
      setError(res.error ?? "Error");
      return;
    }
    setRegisterId(id);
    router.refresh();
  };

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md">
        <h1 className="text-center font-serif text-3xl text-ink">¿Cuál caja es este equipo?</h1>
        <p className="mb-8 mt-2 text-center text-sm text-muted">
          Se pregunta una sola vez. Cada caja lleva su propio fondo y su propio corte.
        </p>

        <div className="space-y-3">
          {registers.length === 0 && (
            <p className="rounded-xl bg-white px-4 py-6 text-center text-sm text-muted">
              No hay cajas configuradas. Créalas en Admin → Ajustes → Cajas.
            </p>
          )}
          {registers.map((r) => {
            const isTablet = /ipad|tablet|tableta/i.test(r.name);
            const Icon = isTablet ? Tablet : Monitor;
            return (
              <button
                key={r.id}
                onClick={() => pick(r.id)}
                disabled={busy !== null}
                className="flex w-full items-center gap-4 rounded-2xl border border-ink/10 bg-white px-5 py-5 text-left transition-colors hover:border-gold disabled:opacity-50"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink/5 text-ink">
                  {busy === r.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" strokeWidth={1.5} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-lg text-ink">{r.name}</span>
                  <span className="block text-xs text-muted">
                    {r.openTurn
                      ? `Turno abierto por ${r.openTurn.cashier}`
                      : "Sin turno abierto"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}
      </div>
    </div>
  );
}
