"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { openSession, forgetRegister } from "@/app/pos/actions";
import { getDeviceId, deviceLabel, detectPlatform, setRegisterId } from "@/lib/offline/device";

// Si tras abrir el turno la pantalla no cambia en este tiempo, se recarga
// entera. El turno YA quedó abierto en la base: lo único que falta es que el
// equipo se entere. Pasó de verdad —la caja se quedó girando con el fondo ya
// registrado— y una cajera no tiene por qué saber que hay que recargar.
const ESPERA_ANTES_DE_RECARGAR = 6000;

export function PosOpen({ register }: { register: { id: string; name: string } }) {
  const router = useRouter();
  const [float, setFloat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [atorado, setAtorado] = useState(false);

  // Al aparecer la pantalla de venta este componente se desmonta y el temporizador
  // se cancela solo; si no se desmonta, es que algo se quedó a medias.
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (temporizador.current) clearTimeout(temporizador.current); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    setRegisterId(register.id);
    try {
      const res = await openSession({
        registerId: register.id,
        openingFloatPesos: Number(float) || 0,
        deviceId: getDeviceId(),
        deviceName: deviceLabel(),
        platform: detectPlatform(),
      });
      if (!res.ok) {
        setBusy(false);
        setError(res.error ?? "No se pudo abrir la caja");
        return;
      }
      router.refresh();
      setAtorado(true);
      temporizador.current = setTimeout(() => window.location.reload(), ESPERA_ANTES_DE_RECARGAR);
    } catch {
      // Sin conexión, o el equipo tiene una versión vieja de la página cargada.
      setBusy(false);
      setError("No se pudo contactar al sistema. Revisa la conexión y vuelve a intentar.");
    }
  };

  const changeRegister = async () => {
    setBusy(true);
    try {
      await forgetRegister();
      router.refresh();
    } catch {
      setBusy(false);
      setError("No se pudo cambiar de caja. Revisa la conexión.");
    }
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
            <div className="flex items-center justify-between rounded-xl border border-ink/10 bg-cream/40 px-4 py-4">
              <span className="text-lg text-ink">{register.name}</span>
              <button
                type="button" onClick={changeRegister} disabled={busy}
                className="text-xs uppercase tracking-wider text-muted transition-colors hover:text-gold-dark disabled:opacity-50"
              >
                Cambiar
              </button>
            </div>
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

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-1.5 text-xs uppercase tracking-wider underline"
            >
              Recargar la página
            </button>
          </div>
        )}

        {atorado && (
          <p className="mt-4 rounded-lg bg-cream px-4 py-2.5 text-sm text-muted">
            Caja abierta. Entrando…
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-4 text-sm uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Abrir caja
        </button>
      </form>
    </div>
  );
}
