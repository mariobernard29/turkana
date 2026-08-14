"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { EarPicker } from "@/components/admin/ear-picker";
import { savePiercing, type PiercingInput } from "@/app/admin/perforaciones/actions";

const inputCls =
  "w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold";
const labelCls = "mb-1 block text-xs uppercase tracking-wider text-muted";

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD en hora local

export function PiercingForm({ initial }: { initial?: PiercingInput }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [performedAt, setPerformedAt] = useState(initial?.performedAt ?? today());
  const [batchNumber, setBatchNumber] = useState(initial?.batchNumber ?? "");
  const [spots, setSpots] = useState<string[]>(initial?.spots ?? []);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ k: "ok" | "err"; t: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!name.trim()) return setMsg({ k: "err", t: "Escribe el nombre del cliente" });
    if (spots.length === 0) return setMsg({ k: "err", t: "Marca en el dibujo dónde se puso el arete" });

    setBusy(true);
    const res = await savePiercing({
      id: initial?.id,
      name, phone, email, performedAt, batchNumber, spots, notes,
    });
    setBusy(false);

    if (!res.ok || !res.id) {
      setMsg({ k: "err", t: res.error ?? "No se pudo guardar" });
      return;
    }
    router.push(`/admin/perforaciones/${res.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <section className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg text-ink">Cliente</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>Nombre del cliente *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} required />
            </div>
            <div>
              <label className={labelCls}>Teléfono</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                placeholder="668 123 4567"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Correo</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="cliente@correo.com"
                className={inputCls}
              />
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">
            Si el cliente ya existe (mismo correo o teléfono), se reutiliza su ficha en vez de duplicarla.
            Sin correo no se le podrán enviar las instrucciones ni los seguimientos.
          </p>
        </section>

        <section className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg text-ink">Perforación</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Fecha</label>
              <input
                type="date"
                value={performedAt}
                onChange={(e) => setPerformedAt(e.target.value)}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Número de lote del arete</label>
              <input
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                placeholder="Ej. L-2026-08"
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Notas</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className={inputCls}
                placeholder="Observaciones, alergias, quién realizó la perforación…"
              />
            </div>
          </div>
        </section>
      </div>

      <div className="space-y-6">
        <section className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-lg text-ink">¿Dónde se puso?</h2>
          <p className="mb-4 text-xs text-muted">Izquierda y derecha del cliente.</p>
          <EarPicker value={spots} onChange={setSpots} />
        </section>

        {msg && (
          <p
            className={`rounded-lg px-4 py-3 text-sm ${
              msg.k === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}
          >
            {msg.t}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 text-sm uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {initial?.id ? "Guardar cambios" : "Registrar perforación"}
        </button>
      </div>
    </form>
  );
}
