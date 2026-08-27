import Link from "next/link";
import { formatMXN } from "@/lib/utils";
import { methodLabel } from "@/lib/payments";
import { KpiCard } from "@/components/admin/kpi-card";
import { ReportPdfButton } from "@/components/admin/report-pdf-button";
import { loadReport, resolveRange, RANGE_LABEL, type Range } from "@/lib/reports";

export const dynamic = "force-dynamic";

type Search = { range?: Range; desde?: string; hasta?: string };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { range = "month", desde, hasta } = await searchParams;
  const periodo = resolveRange(range, desde, hasta);
  const r = await loadReport(periodo.from, periodo.to);
  const methodTotal = r.methods.reduce((s, [, v]) => s + v, 0);
  const mejor = r.sellers[0];

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-3">
        <Link href="/admin/reportes/piezas" className="rounded-full border border-ink/15 bg-white px-5 py-2 text-sm text-ink transition-colors hover:border-gold">Piezas vendidas</Link>
        <Link href="/admin/reportes/movimientos" className="rounded-full border border-ink/15 bg-white px-5 py-2 text-sm text-ink transition-colors hover:border-gold">Monitor de movimientos</Link>
        <Link href="/admin/reportes/cortes" className="rounded-full border border-ink/15 bg-white px-5 py-2 text-sm text-ink transition-colors hover:border-gold">Cortes de caja</Link>
      </div>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl text-ink">Reportes</h1>
        <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-widest">
          {(Object.keys(RANGE_LABEL) as Range[]).map((rk) => (
            <Link key={rk} href={`/admin/reportes?range=${rk}`}
              className={`rounded-full border px-4 py-2 transition-colors ${range === rk ? "border-ink bg-ink text-cream" : "border-ink/15 text-muted hover:border-gold"}`}>
              {RANGE_LABEL[rk]}
            </Link>
          ))}
          <ReportPdfButton kind="kpis" range={range} desde={desde} hasta={hasta} label="PDF del reporte" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={`Ventas · ${periodo.label}`} value={formatMXN(r.sales.total)} hint={`${r.sales.count} ventas`} />
        <KpiCard label="Piezas vendidas" value={String(r.pieces)} hint={`${r.productosDistintos} modelos distintos`} />
        <KpiCard label="Ticket promedio" value={formatMXN(r.sales.avg)} />
        <KpiCard label="Piezas por venta" value={r.sales.count ? (r.pieces / r.sales.count).toFixed(1) : "0"} />
        <KpiCard label="POS / Online" value={formatMXN(r.sales.pos)} hint={`Online ${formatMXN(r.sales.online)}`} />
        <KpiCard label="Quien más vendió" value={mejor?.name ?? "—"} hint={mejor ? `${formatMXN(mejor.total)} · ${mejor.qty} pz` : undefined} />
        <KpiCard label="Servicios vendidos" value={String(r.services)} hint={`${r.piercings} perforaciones`} />
        <KpiCard label="Clientes atendidos" value={String(r.clientes.atendidos)} hint={`${r.clientes.nuevos} nuevos`} />
        <KpiCard label="Descuentos otorgados" value={formatMXN(r.sales.discounts)} />
        <KpiCard label="Rewards generados" value={formatMXN(r.sales.rewardsEarned)} hint={`Canjeados ${formatMXN(r.sales.rewardsRedeemed)}`} />
        <KpiCard label="Créditos por cobrar" value={formatMXN(r.creditOutstanding)} />
        <KpiCard label="Apartados activos" value={String(r.layawaysActive)} hint={`Saldo ${formatMXN(r.layawayPending)}`} />
        <KpiCard label="Variantes agotadas" value={String(r.outOfStock)} />
      </div>

      {/* Quién vende más */}
      <section className="mt-8 rounded-2xl border border-ink/10 bg-white p-6">
        <h2 className="mb-4 text-lg text-ink">Quién vendió</h2>
        {r.sellers.length === 0 ? <p className="text-sm text-muted">Sin ventas en el periodo.</p> : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-xs uppercase tracking-wider text-muted">
                <th className="py-2 font-normal">Vendedor</th>
                <th className="py-2 text-right font-normal">Ventas</th>
                <th className="py-2 text-right font-normal">Piezas</th>
                <th className="py-2 text-right font-normal">Importe</th>
                <th className="py-2 text-right font-normal">Promedio</th>
              </tr>
            </thead>
            <tbody>
              {r.sellers.map((s) => (
                <tr key={s.id} className="border-b border-ink/5 last:border-0">
                  <td className="py-2 text-ink">{s.name}</td>
                  <td className="py-2 text-right text-muted">{s.orders}</td>
                  <td className="py-2 text-right text-muted">{s.qty} pz</td>
                  <td className="py-2 text-right text-ink">{formatMXN(s.total)}</td>
                  <td className="py-2 text-right text-muted">{formatMXN(s.orders ? Math.round(s.total / s.orders) : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Top por pieza */}
        <section className="rounded-2xl border border-ink/10 bg-white p-6">
          <h2 className="mb-1 text-lg text-ink">Más vendidos por pieza</h2>
          <p className="mb-4 text-xs text-muted">Por unidades que salieron, no por dinero.</p>
          {r.topByQty.length === 0 ? <p className="text-sm text-muted">Sin ventas en el periodo.</p> : (
            <table className="w-full text-left text-sm">
              <tbody>
                {r.topByQty.map((p) => (
                  <tr key={p.sku || p.name} className="border-b border-ink/5 last:border-0">
                    <td className="py-2 text-ink">
                      {p.name}
                      {p.sku && <span className="block text-xs text-muted">{p.sku}</span>}
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums text-ink">{p.qty} pz</td>
                    <td className="py-2 text-right text-muted">{formatMXN(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Top por importe */}
        <section className="rounded-2xl border border-ink/10 bg-white p-6">
          <h2 className="mb-1 text-lg text-ink">Los que más dejaron</h2>
          <p className="mb-4 text-xs text-muted">Por dinero vendido en el periodo.</p>
          {r.topByAmount.length === 0 ? <p className="text-sm text-muted">Sin ventas en el periodo.</p> : (
            <table className="w-full text-left text-sm">
              <tbody>
                {r.topByAmount.map((p) => (
                  <tr key={p.sku || p.name} className="border-b border-ink/5 last:border-0">
                    <td className="py-2 text-ink">
                      {p.name}
                      {p.sku && <span className="block text-xs text-muted">{p.sku}</span>}
                    </td>
                    <td className="py-2 text-right text-muted">{p.qty} pz</td>
                    <td className="py-2 text-right font-semibold tabular-nums text-ink">{formatMXN(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* Métodos de pago */}
      <section className="mt-6 rounded-2xl border border-ink/10 bg-white p-6">
        <h2 className="mb-4 text-lg text-ink">Métodos de pago</h2>
        {r.methods.length === 0 ? <p className="text-sm text-muted">Sin pagos en el periodo.</p> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {r.methods.map(([m, v]) => (
              <div key={m}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-ink">{methodLabel(m)}</span>
                  <span className="text-muted">{formatMXN(v)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-sand">
                  <div className="h-full rounded-full bg-gold" style={{ width: `${methodTotal ? (v / methodTotal) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
