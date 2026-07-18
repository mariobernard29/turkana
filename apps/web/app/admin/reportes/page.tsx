import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMXN } from "@/lib/utils";
import { methodLabel } from "@/lib/payments";
import { KpiCard } from "@/components/admin/kpi-card";

export const dynamic = "force-dynamic";

type Range = "day" | "week" | "month" | "year";
const RANGE_LABEL: Record<Range, string> = { day: "Hoy", week: "Semana", month: "Mes", year: "Año" };
const PAID = ["paid", "completed", "delivered"];

function startOf(range: Range): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === "week") d.setDate(d.getDate() - 7);
  else if (range === "month") d.setMonth(d.getMonth() - 1);
  else if (range === "year") d.setFullYear(d.getFullYear() - 1);
  return d;
}

async function loadReport(range: Range) {
  const db = createAdminClient();
  const start = startOf(range).toISOString();
  const safe = async <T,>(fn: () => Promise<T>, fb: T) => { try { return await fn(); } catch { return fb; } };

  const sales = await safe(async () => {
    const { data } = await db.from("orders").select("total_cents, channel").in("status", PAID).is("deleted_at", null).gte("created_at", start);
    const rows = (data as unknown as { total_cents: number; channel: string }[]) ?? [];
    const total = rows.reduce((s, o) => s + o.total_cents, 0);
    const pos = rows.filter((o) => o.channel === "pos").reduce((s, o) => s + o.total_cents, 0);
    const online = total - pos;
    return { total, count: rows.length, avg: rows.length ? Math.round(total / rows.length) : 0, pos, online };
  }, { total: 0, count: 0, avg: 0, pos: 0, online: 0 });

  const methods = await safe(async () => {
    const { data } = await db.from("payments").select("method, amount_cents").eq("status", "completed").gte("created_at", start);
    const map: Record<string, number> = {};
    for (const p of (data as unknown as { method: string; amount_cents: number }[]) ?? []) map[p.method] = (map[p.method] ?? 0) + p.amount_cents;
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [] as [string, number][]);

  const topProducts = await safe(async () => {
    const { data } = await db.from("order_items").select("name, quantity, total_cents, orders!inner(created_at, status)").gte("orders.created_at", start).in("orders.status", PAID);
    const map: Record<string, { qty: number; total: number }> = {};
    for (const it of (data as unknown as { name: string; quantity: number; total_cents: number }[]) ?? []) {
      const e = map[it.name] ?? { qty: 0, total: 0 };
      e.qty += it.quantity; e.total += it.total_cents; map[it.name] = e;
    }
    return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [] as { name: string; qty: number; total: number }[]);

  const count = (table: string, build: (q: any) => any) => safe(async () => {
    const { count } = await build(db.from(table).select("*", { count: "exact", head: true }));
    return count ?? 0;
  }, 0);
  const sum = (table: string, col: string, build: (q: any) => any) => safe(async () => {
    const { data } = await build(db.from(table).select(col));
    return ((data as unknown as Record<string, number>[]) ?? []).reduce((s, r) => s + (r[col] ?? 0), 0);
  }, 0);

  const [creditOutstanding, layawaysActive, layawayPending, rewardsBalance, lowStock] = await Promise.all([
    sum("credit_accounts", "balance_cents", (q) => q.gt("balance_cents", 0)),
    count("layaways", (q) => q.eq("status", "active")),
    safe(async () => {
      const { data } = await db.from("layaways").select("total_cents, paid_cents").eq("status", "active");
      return ((data as unknown as { total_cents: number; paid_cents: number }[]) ?? []).reduce((s, l) => s + (l.total_cents - l.paid_cents), 0);
    }, 0),
    sum("customer_rewards", "balance_cents", (q) => q),
    count("stock_levels", (q) => q.eq("quantity", 0)),
  ]);

  return { sales, methods, topProducts, creditOutstanding, layawaysActive, layawayPending, rewardsBalance, lowStock };
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ range?: Range }> }) {
  const { range = "month" } = await searchParams;
  const r = await loadReport(range);
  const methodTotal = r.methods.reduce((s, [, v]) => s + v, 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-3">
        <Link href="/admin/reportes/movimientos" className="rounded-full border border-ink/15 bg-white px-5 py-2 text-sm text-ink transition-colors hover:border-gold">Monitor de movimientos</Link>
        <Link href="/admin/reportes/cortes" className="rounded-full border border-ink/15 bg-white px-5 py-2 text-sm text-ink transition-colors hover:border-gold">Cortes de caja</Link>
      </div>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl text-ink">Reportes</h1>
        <div className="flex gap-2 text-xs uppercase tracking-widest">
          {(Object.keys(RANGE_LABEL) as Range[]).map((rk) => (
            <Link key={rk} href={`/admin/reportes?range=${rk}`}
              className={`rounded-full border px-4 py-2 transition-colors ${range === rk ? "border-ink bg-ink text-cream" : "border-ink/15 text-muted hover:border-gold"}`}>
              {RANGE_LABEL[rk]}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={`Ventas · ${RANGE_LABEL[range]}`} value={formatMXN(r.sales.total)} hint={`${r.sales.count} ventas`} />
        <KpiCard label="Ticket promedio" value={formatMXN(r.sales.avg)} />
        <KpiCard label="POS / Online" value={`${formatMXN(r.sales.pos)}`} hint={`Online ${formatMXN(r.sales.online)}`} />
        <KpiCard label="Rewards en circulación" value={formatMXN(r.rewardsBalance)} />
        <KpiCard label="Créditos por cobrar" value={formatMXN(r.creditOutstanding)} />
        <KpiCard label="Apartados activos" value={String(r.layawaysActive)} hint={`Saldo ${formatMXN(r.layawayPending)}`} />
        <KpiCard label="Variantes agotadas" value={String(r.lowStock)} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Métodos de pago */}
        <section className="rounded-2xl border border-ink/10 bg-white p-6">
          <h2 className="mb-4 text-lg text-ink">Métodos de pago</h2>
          {r.methods.length === 0 ? <p className="text-sm text-muted">Sin pagos en el periodo.</p> : (
            <div className="space-y-3">
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

        {/* Top productos */}
        <section className="rounded-2xl border border-ink/10 bg-white p-6">
          <h2 className="mb-4 text-lg text-ink">Top productos</h2>
          {r.topProducts.length === 0 ? <p className="text-sm text-muted">Sin ventas en el periodo.</p> : (
            <table className="w-full text-left text-sm">
              <tbody>
                {r.topProducts.map((p) => (
                  <tr key={p.name} className="border-b border-ink/5 last:border-0">
                    <td className="py-2 text-ink">{p.name}</td>
                    <td className="py-2 text-right text-muted">{p.qty} pz</td>
                    <td className="py-2 text-right text-ink">{formatMXN(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
