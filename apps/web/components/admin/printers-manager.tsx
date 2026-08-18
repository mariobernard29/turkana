"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Printer, RotateCcw } from "lucide-react";
import {
  savePrinter, retryJob, testPrint,
  type PrinterRow, type JobRow,
} from "@/app/admin/ajustes/pos-actions";

const field = "w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold";

const STATUS_LABEL: Record<string, string> = {
  pending: "En cola", printing: "Imprimiendo", done: "Impreso", error: "Error",
};
const STATUS_STYLE: Record<string, string> = {
  pending: "bg-blue-50 text-blue-800",
  printing: "bg-blue-50 text-blue-800",
  done: "bg-green-50 text-green-800",
  error: "bg-red-50 text-red-700",
};

export function PrintersManager({
  printers, jobs, registers,
}: {
  printers: PrinterRow[];
  jobs: JobRow[];
  registers: { id: string; name: string }[];
}) {
  const router = useRouter();
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

  return (
    <div className="space-y-6">
      {msg && (
        <p className={`rounded-xl px-4 py-2.5 text-sm ${msg.k === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
          {msg.t}
        </p>
      )}

      {printers.map((p) => (
        <PrinterCard key={p.id} printer={p} registers={registers} busy={busy} run={run} />
      ))}

      {printers.length === 0 && (
        <p className="rounded-2xl border border-ink/10 bg-white p-6 text-sm text-muted shadow-sm">
          No hay impresoras dadas de alta. Corre la migración <code>0029_impresion.sql</code> o agrégala en la base.
        </p>
      )}

      {/* La cola: es donde se ve si un ticket se atoró y por qué. */}
      <section className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
        <div className="border-b border-ink/10 px-6 py-4">
          <h2 className="text-lg text-ink">Últimos tickets</h2>
          <p className="mt-1 text-xs text-muted">
            Los impresos se borran solos a los 7 días. Un error casi siempre es papel o impresora apagada.
          </p>
        </div>
        {jobs.length === 0 ? (
          <p className="px-6 py-5 text-sm text-muted">Todavía no se ha mandado ningún ticket a imprimir.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink/10 text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-6 py-3 font-medium">Ticket</th>
                  <th className="px-3 py-3 font-medium">Estado</th>
                  <th className="px-3 py-3 font-medium">Enviado</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="border-b border-ink/5 last:border-0">
                    <td className="px-6 py-2.5">
                      <span className="text-ink">{j.label ?? j.docType}</span>
                      {j.error && <span className="ml-2 text-xs text-red-700">{j.error}</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_STYLE[j.status] ?? "bg-ink/5 text-muted"}`}>
                        {STATUS_LABEL[j.status] ?? j.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted tabular-nums">
                      {new Date(j.createdAt).toLocaleString("es-MX")}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {j.status === "error" && (
                        <button
                          onClick={() => run(j.id, () => retryJob(j.id), "Ticket mandado otra vez")}
                          disabled={busy !== null}
                          className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1.5 text-xs text-ink transition-colors hover:border-gold disabled:opacity-50"
                        >
                          {busy === j.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                          Reintentar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function PrinterCard({
  printer, registers, busy, run,
}: {
  printer: PrinterRow;
  registers: { id: string; name: string }[];
  busy: string | null;
  run: (key: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: printer.name,
    host: printer.host,
    port: String(printer.port),
    registerId: printer.registerId ?? "",
    isDefault: printer.isDefault,
    isActive: printer.isActive,
  });

  const guardar = () =>
    run(printer.id, () => savePrinter({
      id: printer.id,
      name: form.name,
      host: form.host,
      port: Number(form.port),
      registerId: form.registerId || null,
      isDefault: form.isDefault,
      isActive: form.isActive,
    }), "Impresora guardada");

  return (
    <section className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`flex h-10 w-10 items-center justify-center rounded-full ${printer.online ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
            <Printer className="h-5 w-5" strokeWidth={1.5} />
          </span>
          <div>
            <h2 className="text-lg text-ink">{printer.name}</h2>
            <p className="text-xs text-muted">
              {printer.online
                ? "El agente está corriendo y la impresora responde"
                : printer.lastSeenAt
                  ? `Sin respuesta desde ${new Date(printer.lastSeenAt).toLocaleString("es-MX")}`
                  : "El agente nunca se ha conectado"}
            </p>
          </div>
        </div>

        <button
          onClick={() => run(`test-${printer.id}`, () => testPrint(printer.id), "Página de prueba mandada a la cola")}
          disabled={busy !== null}
          className="rounded-full border border-ink/15 px-4 py-2 text-xs uppercase tracking-wider text-ink transition-colors hover:border-gold disabled:opacity-50"
        >
          {busy === `test-${printer.id}` ? "Enviando…" : "Imprimir prueba"}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Nombre</label>
          <input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Dirección (IP)</label>
          <input className={field} value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="192.168.1.100" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Puerto</label>
          <input className={field} value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} inputMode="numeric" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Caja</label>
          <select className={field} value={form.registerId} onChange={(e) => setForm({ ...form, registerId: e.target.value })}>
            <option value="">Compartida (todas)</option>
            {registers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-5">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" className="h-4 w-4 accent-gold" checked={form.isDefault}
            onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
          Predeterminada
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" className="h-4 w-4 accent-gold" checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
          Activa
        </label>

        <button
          onClick={guardar} disabled={busy !== null}
          className="ml-auto flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-xs uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark disabled:opacity-50"
        >
          {busy === printer.id && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar
        </button>
      </div>

      <p className="mt-4 border-t border-ink/5 pt-3 text-xs text-muted">
        El identificador que va en el <code>.env</code> del agente es <code className="text-ink">{printer.id}</code>.
      </p>
    </section>
  );
}
