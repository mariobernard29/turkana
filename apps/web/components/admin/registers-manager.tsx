"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Monitor, Plus, Tablet } from "lucide-react";
import { saveRegister, deactivateRegister, type RegisterRow } from "@/app/admin/ajustes/pos-actions";

const PLATFORM_LABEL: Record<string, string> = {
  ipad: "iPad", ios: "iPhone", android: "Android", windows: "PC Windows", mac: "Mac", web: "Navegador",
};

const field = "w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold";

export function RegistersManager({ registers }: { registers: RegisterRow[] }) {
  const router = useRouter();
  const [nueva, setNueva] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ k: "ok" | "err"; t: string } | null>(null);

  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    setBusy(key); setMsg(null);
    const res = await fn();
    setBusy(null);
    if (!res.ok) { setMsg({ k: "err", t: res.error ?? "Error" }); return; }
    setMsg({ k: "ok", t: okMsg });
    router.refresh();
  };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nueva.trim()) return;
    await run("nueva", () => saveRegister({ name: nueva, isActive: true }), "Caja creada");
    setNueva("");
  };

  return (
    <div className="space-y-6">
      {msg && (
        <p className={`rounded-xl px-4 py-2.5 text-sm ${msg.k === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
          {msg.t}
        </p>
      )}

      <section className="space-y-3">
        {registers.map((r) => (
          <div key={r.id} className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg text-ink">{r.name}</h3>
                  {!r.isActive && (
                    <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] uppercase tracking-wider text-muted">
                      Dada de baja
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted">
                  {r.openTurn
                    ? `Turno abierto por ${r.openTurn.cashier} desde ${new Date(r.openTurn.openedAt).toLocaleString("es-MX")}`
                    : "Sin turno abierto"}
                </p>
              </div>

              {r.isActive && (
                <button
                  onClick={() => run(r.id, () => deactivateRegister(r.id), "Caja dada de baja")}
                  disabled={busy !== null}
                  className="rounded-full border border-ink/15 px-4 py-2 text-xs uppercase tracking-wider text-muted transition-colors hover:border-red-300 hover:text-red-700 disabled:opacity-50"
                >
                  {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Dar de baja"}
                </button>
              )}
            </div>

            {/* Los equipos que se han identificado como esta caja. Sirve para
                notar a tiempo que dos aparatos están cobrando en la misma. */}
            <div className="mt-4 border-t border-ink/5 pt-3">
              <p className="mb-2 text-xs uppercase tracking-wider text-muted">Equipos</p>
              {r.devices.length === 0 ? (
                <p className="text-sm text-muted">Ningún equipo se ha identificado con esta caja todavía.</p>
              ) : (
                <ul className="space-y-1.5">
                  {r.devices.map((d) => {
                    const Icon = d.platform === "ipad" || d.platform === "android" ? Tablet : Monitor;
                    return (
                      <li key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <Icon className="h-4 w-4 text-muted" strokeWidth={1.5} />
                        <span className="text-ink">{PLATFORM_LABEL[d.platform ?? ""] ?? d.name}</span>
                        <span className="text-xs text-muted">
                          {d.lastSeenAt ? `visto ${new Date(d.lastSeenAt).toLocaleString("es-MX")}` : "sin actividad"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {r.devices.length > 1 && (
                <p className="mt-2 text-xs text-amber-700">
                  Hay más de un equipo en esta caja. Comparten fondo y corte: si son dos cajones distintos, dale su propia caja a cada uno.
                </p>
              )}
            </div>
          </div>
        ))}
      </section>

      <form onSubmit={crear} className="flex flex-wrap items-end gap-3 rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Nueva caja</label>
          <input
            className={field} value={nueva} onChange={(e) => setNueva(e.target.value)}
            placeholder="Caja mostrador 2"
          />
        </div>
        <button
          type="submit" disabled={busy !== null || !nueva.trim()}
          className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-xs uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark disabled:opacity-50"
        >
          {busy === "nueva" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Crear
        </button>
      </form>
    </div>
  );
}
