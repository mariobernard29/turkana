import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { formatMXN } from "@/lib/utils";
import { formatStoreDate } from "@/lib/dates";
import { KpiCard } from "@/components/admin/kpi-card";
import { ReportPdfButton } from "@/components/admin/report-pdf-button";
import { loadPieces, resolveRange, RANGE_LABEL, type Range } from "@/lib/reports";

export const dynamic = "force-dynamic";

// Qué se vendió y cuántas piezas salieron, para cotejar contra el inventario o
// para saber qué reponer. El periodo se elige con fechas libres, no sólo con
// los atajos de la pantalla de reportes.
type Search = {
  range?: Range;
  desde?: string;
  hasta?: string;
  canal?: string;
  servicios?: string;
};

const CANALES: { value: string; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "pos", label: "Mostrador" },
  { value: "ecommerce", label: "Tienda en línea" },
];

export default async function PiecesReportPage({ searchParams }: { searchParams: Promise<Search> }) {
  const f = await searchParams;
  const range = f.range ?? "month";
  const incluirServicios = f.servicios === "1";
  const filters = { canal: f.canal || undefined, incluirServicios };

  const periodo = resolveRange(range, f.desde, f.hasta);
  const r = await loadPieces(periodo.from, periodo.to, filters);

  const inputCls = "rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold";
  const fin = new Date(periodo.to.getTime() - 1000);

  return (
    <div>
      <Link href="/admin/reportes" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft className="h-4 w-4" /> Reportes
      </Link>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="mb-1 text-3xl text-ink">Piezas vendidas</h1>
          <p className="text-sm text-muted">
            {periodo.label} · {formatStoreDate(periodo.from)} al {formatStoreDate(fin)}
          </p>
        </div>
        <ReportPdfButton
          kind="piezas"
          range={range}
          desde={f.desde}
          hasta={f.hasta}
          filters={filters}
          label="Descargar PDF"
        />
      </div>

      <form className="mb-8 flex flex-wrap items-end gap-3 rounded-2xl border border-ink/10 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-muted">Periodo</label>
          <select name="range" defaultValue={range} className={inputCls}>
            {(Object.keys(RANGE_LABEL) as Range[]).map((k) => (
              <option key={k} value={k}>{RANGE_LABEL[k]}</option>
            ))}
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
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-muted">Canal</label>
          <select name="canal" defaultValue={f.canal ?? ""} className={inputCls}>
            {CANALES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2.5 text-sm text-ink">
          <input type="checkbox" name="servicios" value="1" defaultChecked={incluirServicios} className="h-4 w-4 accent-gold" />
          Incluir servicios
        </label>
        <button type="submit" className="rounded-full bg-ink px-5 py-2.5 text-xs uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark">
          Ver
        </button>
        <Link href="/admin/reportes/piezas" className="pb-2.5 text-xs uppercase tracking-widest text-muted hover:text-ink">
          Limpiar
        </Link>
      </form>

      <p className="mb-4 text-xs text-muted">
        Las dos fechas mandan sobre el periodo: si las llenas, el atajo se ignora.
      </p>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Piezas vendidas" value={String(r.piezas)} />
        <KpiCard label="Importe de las piezas" value={formatMXN(r.importe)} />
        <KpiCard label="Modelos distintos" value={String(r.rows.length)} />
        <KpiCard label="Ventas" value={String(r.ventas)} />
      </div>

      <section className="rounded-2xl border border-ink/10 bg-white p-6">
        <h2 className="mb-4 text-lg text-ink">Detalle por código</h2>
        {r.rows.length === 0 ? (
          <p className="text-sm text-muted">No se vendió nada en el periodo con estos filtros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-xs uppercase tracking-wider text-muted">
                  <th className="py-2 font-normal">Código</th>
                  <th className="py-2 font-normal">Producto</th>
                  <th className="py-2 text-right font-normal">Piezas</th>
                  <th className="py-2 text-right font-normal">Importe</th>
                </tr>
              </thead>
              <tbody>
                {r.rows.map((p) => (
                  <tr key={p.sku || p.name} className="border-b border-ink/5 last:border-0">
                    <td className="py-2 font-mono text-xs text-muted">{p.sku || "—"}</td>
                    <td className="py-2 text-ink">{p.name}</td>
                    <td className="py-2 text-right font-semibold tabular-nums text-ink">{p.qty}</td>
                    <td className="py-2 text-right tabular-nums text-ink">{formatMXN(p.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gold">
                  <td className="py-2" />
                  <td className="py-2 text-xs uppercase tracking-wider text-muted">Total</td>
                  <td className="py-2 text-right font-semibold tabular-nums text-ink">{r.piezas}</td>
                  <td className="py-2 text-right font-semibold tabular-nums text-ink">{formatMXN(r.importe)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
