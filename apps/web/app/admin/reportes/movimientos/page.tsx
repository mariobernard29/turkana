import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMXN } from "@/lib/utils";
import { methodLabel, POS_METHODS } from "@/lib/payments";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  sale: "Venta", refund: "Reembolso / cambio", in: "Entrada", out: "Salida",
  drop: "Resguardo", expense: "Gasto", precut: "Precorte",
};
const NEG = ["refund", "out", "drop", "expense"];

type Filters = { tipo?: string; metodo?: string; desde?: string; hasta?: string };
type Row = { id: string; type: string; method: string | null; amount_cents: number; notes: string | null; created_at: string };

async function load(f: Filters): Promise<Row[]> {
  try {
    const db = createAdminClient();
    let q = db.from("cash_movements").select("id, type, method, amount_cents, notes, created_at").order("created_at", { ascending: false }).limit(500);
    if (f.tipo) q = q.eq("type", f.tipo);
    if (f.metodo) q = q.eq("method", f.metodo);
    if (f.desde) q = q.gte("created_at", `${f.desde}T00:00:00`);
    if (f.hasta) q = q.lte("created_at", `${f.hasta}T23:59:59`);
    const { data } = await q;
    return (data as unknown as Row[]) ?? [];
  } catch {
    return [];
  }
}

export default async function MovementsPage({ searchParams }: { searchParams: Promise<Filters> }) {
  const f = await searchParams;
  const rows = await load(f);
  const inputCls = "rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold";

  return (
    <div>
      <Link href="/admin/reportes" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft className="h-4 w-4" /> Reportes
      </Link>
      <h1 className="mb-1 text-3xl text-ink">Monitor de movimientos</h1>
      <p className="mb-6 text-sm text-muted">{rows.length} movimientos de caja</p>

      <form className="mb-8 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-muted">Tipo</label>
          <select name="tipo" defaultValue={f.tipo ?? ""} className={inputCls}>
            <option value="">Todos</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-muted">Método</label>
          <select name="metodo" defaultValue={f.metodo ?? ""} className={inputCls}>
            <option value="">Todos</option>
            {POS_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-muted">Desde</label>
          <input type="date" name="desde" defaultValue={f.desde ?? ""} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-muted">Hasta</label>
          <input type="date" name="hasta" defaultValue={f.hasta ?? ""} className={inputCls} />
        </div>
        <button type="submit" className="rounded-full bg-ink px-6 py-2 text-sm uppercase tracking-widest text-cream hover:bg-gold-dark">Filtrar</button>
        {(f.tipo || f.metodo || f.desde || f.hasta) && <Link href="/admin/reportes/movimientos" className="px-2 py-2 text-sm text-muted hover:text-ink">Limpiar</Link>}
      </form>

      <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ink/10 text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-6 py-3 font-medium">Fecha</th>
              <th className="px-6 py-3 font-medium">Tipo</th>
              <th className="px-6 py-3 font-medium">Método</th>
              <th className="px-6 py-3 font-medium">Notas</th>
              <th className="px-6 py-3 text-right font-medium">Monto</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="px-6 py-12 text-center text-muted">Sin movimientos</td></tr>}
            {rows.map((m) => (
              <tr key={m.id} className="border-b border-ink/5 last:border-0">
                <td className="px-6 py-3 text-muted">{new Date(m.created_at).toLocaleString("es-MX")}</td>
                <td className="px-6 py-3 text-ink">{TYPE_LABEL[m.type] ?? m.type}</td>
                <td className="px-6 py-3 text-muted">{m.method ? methodLabel(m.method) : "—"}</td>
                <td className="px-6 py-3 text-muted">{m.notes ?? ""}</td>
                <td className={`px-6 py-3 text-right tabular-nums ${NEG.includes(m.type) ? "text-red-600" : "text-ink"}`}>
                  {NEG.includes(m.type) ? "−" : "+"}{formatMXN(m.amount_cents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
