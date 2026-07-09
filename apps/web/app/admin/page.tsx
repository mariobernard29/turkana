import { createAdminClient } from "@/lib/supabase/admin";
import { KpiCard } from "@/components/admin/kpi-card";
import { formatMXN } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function loadKpis() {
  const db = createAdminClient();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // Cada consulta se aísla para que una tabla faltante no tire el dashboard.
  const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };

  const salesToday = await safe(async () => {
    const { data } = await db
      .from("orders")
      .select("total_cents")
      .in("status", ["paid", "completed", "delivered"])
      .gte("created_at", startOfDay.toISOString());
    const rows = (data ?? []) as unknown as { total_cents: number }[];
    return rows.reduce((s, o) => s + (o.total_cents ?? 0), 0);
  }, 0);

  const count = (table: string, build: (q: any) => any) =>
    safe(async () => {
      const { count } = await build(
        db.from(table).select("*", { count: "exact", head: true }),
      );
      return count ?? 0;
    }, 0);

  const [pendingOnline, outOfStock, layaways, credits, activeProducts] =
    await Promise.all([
      count("orders", (q) => q.eq("channel", "ecommerce").eq("status", "pending")),
      count("stock_levels", (q) => q.eq("quantity", 0)),
      count("layaways", (q) => q.eq("status", "active")),
      count("credit_accounts", (q) => q.gt("balance_cents", 0)),
      count("products", (q) => q.eq("status", "active").is("deleted_at", null)),
    ]);

  return { salesToday, pendingOnline, outOfStock, layaways, credits, activeProducts };
}

export default async function DashboardPage() {
  const k = await loadKpis();

  return (
    <div>
      <h1 className="mb-1 text-3xl text-ink">Dashboard</h1>
      <p className="mb-8 text-sm text-muted">Resumen ejecutivo de Turkana Jewelry</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="Ventas hoy" value={formatMXN(k.salesToday)} />
        <KpiCard label="Pedidos online pendientes" value={String(k.pendingOnline)} />
        <KpiCard label="Productos activos" value={String(k.activeProducts)} />
        <KpiCard label="Productos agotados" value={String(k.outOfStock)} />
        <KpiCard label="Apartados pendientes" value={String(k.layaways)} />
        <KpiCard label="Créditos pendientes" value={String(k.credits)} />
      </div>
    </div>
  );
}
