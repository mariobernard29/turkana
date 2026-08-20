import Link from "next/link";
import { LiveRefresh } from "@/components/live-refresh";
import { AlertTriangle, Clock, Printer } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { KpiCard } from "@/components/admin/kpi-card";
import { formatMXN } from "@/lib/utils";
import { businessRange, formatStore } from "@/lib/dates";
import { loadOpenSessions, type OpenSession } from "@/lib/cash-report";

export const dynamic = "force-dynamic";

// Cada consulta se aísla para que una tabla faltante no tire el dashboard.
const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await fn();
  } catch {
    return fallback;
  }
};

async function loadKpis() {
  const db = createAdminClient();
  // El día del negocio, no el del reloj del servidor (que en producción es UTC).
  const { from, to } = businessRange("day");

  const salesToday = await safe(async () => {
    const { data } = await db
      .from("orders")
      .select("total_cents")
      .in("status", ["paid", "completed", "delivered"])
      .is("deleted_at", null)
      .gte("created_at", from.toISOString())
      .lt("created_at", to.toISOString());
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

type Alert = { icon: "clock" | "printer" | "warn"; text: string; href: string; cta: string };

// Avisos operativos: cosas que alguien tiene que ir a arreglar hoy. Nacen de dos
// incidentes reales — un turno que se quedó 31 horas abierto, y una cola de
// impresión que nadie podía vaciar.
async function loadAlerts(): Promise<Alert[]> {
  const db = createAdminClient();
  const out: Alert[] = [];

  const maxHours = await safe(async () => {
    const { data } = await db
      .from("app_settings").select("value").eq("key", "session_max_hours").maybeSingle();
    return parseInt((data as { value?: string } | null)?.value ?? "", 10) || 12;
  }, 12);

  const open = await safe(() => loadOpenSessions(db), [] as OpenSession[]);
  for (const s of open) {
    const hours = Math.floor((Date.now() - new Date(s.openedAt).getTime()) / 3_600_000);
    if (hours < maxHours) continue;
    out.push({
      icon: "clock",
      text: `El turno de ${s.cashier} en ${s.registerName} lleva ${hours} horas abierto (desde ${formatStore(s.openedAt)}). Su dinero todavía no está en ningún corte.`,
      href: "/admin/reportes/cortes",
      cta: "Ver cortes",
    });
  }

  const printers = await safe(async () => {
    const { data } = await db
      .from("printers").select("id, name, last_seen_at").eq("is_active", true);
    return (data ?? []) as unknown as { id: string; name: string; last_seen_at: string | null }[];
  }, []);
  for (const p of printers) {
    const seen = p.last_seen_at ? Date.now() - new Date(p.last_seen_at).getTime() : Infinity;
    if (seen < 90_000) continue;
    out.push({
      icon: "printer",
      text: `${p.name} no está respondiendo${p.last_seen_at ? ` desde ${formatStore(p.last_seen_at)}` : ""}. Los tickets están saliendo por el diálogo del navegador; se puede cobrar y cerrar turno igual.`,
      href: "/admin/ajustes/impresoras",
      cta: "Revisar impresora",
    });
  }

  const failed = await safe(async () => {
    const { count } = await db
      .from("print_jobs").select("id", { count: "exact", head: true })
      .in("status", ["error", "pending", "printing"]);
    return count ?? 0;
  }, 0);
  if (failed > 0) {
    out.push({
      icon: "warn",
      text: `Hay ${failed} ticket(s) que no han salido de la cola de impresión.`,
      href: "/admin/ajustes/impresoras",
      cta: "Ver la cola",
    });
  }

  return out;
}

const ICON = { clock: Clock, printer: Printer, warn: AlertTriangle };

export default async function DashboardPage() {
  const [k, alerts] = await Promise.all([loadKpis(), loadAlerts()]);

  return (
    <div>
      <LiveRefresh tables={["orders", "products", "product_variants", "stock_levels", "cash_sessions", "print_jobs"]} />
      <h1 className="mb-1 text-3xl text-ink">Dashboard</h1>
      <p className="mb-8 text-sm text-muted">Resumen ejecutivo de Turkana Jewelry</p>

      {alerts.length > 0 && (
        <div className="mb-8 space-y-2">
          {alerts.map((a, i) => {
            const Icon = ICON[a.icon];
            return (
              <div
                key={i}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3.5"
              >
                <Icon className="h-4 w-4 shrink-0 text-amber-700" />
                <p className="min-w-[240px] flex-1 text-sm text-amber-900">{a.text}</p>
                <Link
                  href={a.href}
                  className="rounded-full border border-amber-300 px-3 py-1.5 text-xs text-amber-900 transition-colors hover:border-amber-500"
                >
                  {a.cta}
                </Link>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="Ventas hoy" value={formatMXN(k.salesToday)} hint="Día del negocio, hora de Los Mochis" />
        <KpiCard label="Pedidos online pendientes" value={String(k.pendingOnline)} />
        <KpiCard label="Productos activos" value={String(k.activeProducts)} />
        <KpiCard label="Productos agotados" value={String(k.outOfStock)} />
        <KpiCard label="Apartados pendientes" value={String(k.layaways)} />
        <KpiCard label="Créditos pendientes" value={String(k.credits)} />
      </div>
    </div>
  );
}
