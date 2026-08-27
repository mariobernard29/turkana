// Los números de /admin/reportes, en un solo lugar.
//
// Viven aquí y no dentro de la página porque los mismos datos se pintan en
// pantalla y se bajan en PDF (app/admin/reportes/pdf-actions.ts): si cada lado
// hiciera sus propias cuentas, tarde o temprano el papel diría una cosa y la
// pantalla otra.
import { createAdminClient } from "@/lib/supabase/admin";
import { businessRange, storeDayRange, type Range } from "@/lib/dates";

export type { Range };

// Una venta cuenta cuando ya se cobró. 'pending' es el pedido web sin pagar y
// 'cancelled' no debe sumar nunca.
export const PAID = ["paid", "preparing", "shipped", "completed", "delivered"];

export const RANGE_LABEL: Record<Range, string> = {
  day: "Hoy", week: "Semana", month: "Mes", year: "Año",
};

type Db = ReturnType<typeof createAdminClient>;

// PostgREST corta en 1000 filas y no avisa. Un mes de ventas se pasa de ahí sin
// problema, así que las consultas de detalle se piden por tandas: con el tope
// callado, el "top de productos" del año salía calculado sobre un pedazo.
const PAGE = 1000;

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await build(from, from + PAGE - 1);
    const rows = (data as T[]) ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

/** El periodo que pidió la pantalla, ya resuelto a instantes reales. */
export function resolveRange(range: Range, desde?: string, hasta?: string): {
  from: Date; to: Date; label: string;
} {
  const DIA = /^\d{4}-\d{2}-\d{2}$/;
  if (desde && hasta && DIA.test(desde) && DIA.test(hasta)) {
    const a = storeDayRange(desde);
    const b = storeDayRange(hasta);
    // Si el usuario invierte las fechas, se acomodan solas en vez de no dar nada.
    const from = a.from <= b.from ? a.from : b.from;
    const to = a.to >= b.to ? a.to : b.to;
    return { from, to, label: "Periodo elegido" };
  }
  const r = businessRange(range);
  return { from: r.from, to: r.to, label: RANGE_LABEL[range] };
}

// ── Ventas y artículos ────────────────────────────────────────────────────────

type OrderRow = {
  id: string;
  total_cents: number;
  discount_cents: number;
  rewards_earned_cents: number;
  rewards_redeemed_cents: number;
  channel: string;
  customer_id: string | null;
  created_by: string | null;
};

type ItemRow = {
  sku: string;
  name: string;
  quantity: number;
  total_cents: number;
  is_service: boolean;
  orders: { channel: string; created_by: string | null } | null;
};

export type ProductRow = { sku: string; name: string; qty: number; total: number };
export type SellerRow = { id: string; name: string; qty: number; total: number; orders: number };

function loadOrders(db: Db, from: Date, to: Date) {
  return fetchAll<OrderRow>((a, b) =>
    db.from("orders")
      .select("id, total_cents, discount_cents, rewards_earned_cents, rewards_redeemed_cents, channel, customer_id, created_by")
      .in("status", PAID)
      .is("deleted_at", null)
      .gte("created_at", from.toISOString())
      .lt("created_at", to.toISOString())
      .range(a, b),
  );
}

function loadItems(db: Db, from: Date, to: Date) {
  return fetchAll<ItemRow>((a, b) =>
    db.from("order_items")
      .select("sku, name, quantity, total_cents, is_service, orders!inner(channel, created_by, created_at, status, deleted_at)")
      .in("orders.status", PAID)
      .is("orders.deleted_at", null)
      .gte("orders.created_at", from.toISOString())
      .lt("orders.created_at", to.toISOString())
      .range(a, b),
  );
}

// El nombre del vendedor: `orders.created_by` es un usuario de staff; los
// pedidos de la tienda web no traen ninguno.
async function sellerNames(db: Db, ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data } = await db.from("profiles").select("id, full_name").in("id", ids);
  const map: Record<string, string> = {};
  for (const p of (data as unknown as { id: string; full_name: string }[]) ?? []) {
    map[p.id] = p.full_name;
  }
  return map;
}

export const ONLINE_SELLER = "Tienda en línea";

// ── Reporte principal ─────────────────────────────────────────────────────────

export type ReportData = Awaited<ReturnType<typeof loadReport>>;

export async function loadReport(from: Date, to: Date) {
  const db = createAdminClient();
  const desde = from.toISOString();
  const hasta = to.toISOString();

  const orders = await safe(() => loadOrders(db, from, to), [] as OrderRow[]);
  const items = await safe(() => loadItems(db, from, to), [] as ItemRow[]);

  const total = orders.reduce((s, o) => s + o.total_cents, 0);
  const pos = orders.filter((o) => o.channel === "pos").reduce((s, o) => s + o.total_cents, 0);
  const sales = {
    total,
    count: orders.length,
    avg: orders.length ? Math.round(total / orders.length) : 0,
    pos,
    online: total - pos,
    discounts: orders.reduce((s, o) => s + o.discount_cents, 0),
    rewardsEarned: orders.reduce((s, o) => s + o.rewards_earned_cents, 0),
    rewardsRedeemed: orders.reduce((s, o) => s + o.rewards_redeemed_cents, 0),
  };

  // Piezas: los servicios (perforación, grabado) no son piezas de inventario y
  // se cuentan aparte para que el "promedio por venta" no salga inflado.
  const piezas = items.filter((i) => !i.is_service);
  const pieces = piezas.reduce((s, i) => s + i.quantity, 0);
  const services = items.filter((i) => i.is_service).reduce((s, i) => s + i.quantity, 0);

  const byProduct = new Map<string, ProductRow>();
  for (const it of piezas) {
    const key = it.sku || it.name;
    const e = byProduct.get(key) ?? { sku: it.sku, name: it.name, qty: 0, total: 0 };
    e.qty += it.quantity;
    e.total += it.total_cents;
    byProduct.set(key, e);
  }
  const productos = [...byProduct.values()];
  const topByQty = [...productos].sort((a, b) => b.qty - a.qty || b.total - a.total).slice(0, 10);
  const topByAmount = [...productos].sort((a, b) => b.total - a.total).slice(0, 10);

  // Vendedores: el importe sale de las órdenes (con descuentos ya aplicados) y
  // las piezas de los artículos, para no contar dos veces una venta partida.
  const staffIds = [...new Set(orders.map((o) => o.created_by).filter((v): v is string => Boolean(v)))];
  const names = await safe(() => sellerNames(db, staffIds), {} as Record<string, string>);
  const bySeller = new Map<string, SellerRow>();
  const take = (id: string | null) => {
    const key = id ?? "online";
    const row = bySeller.get(key) ?? {
      id: key,
      name: id ? (names[id] ?? "Usuario dado de baja") : ONLINE_SELLER,
      qty: 0, total: 0, orders: 0,
    };
    bySeller.set(key, row);
    return row;
  };
  for (const o of orders) {
    const row = take(o.created_by);
    row.total += o.total_cents;
    row.orders += 1;
  }
  for (const it of piezas) take(it.orders?.created_by ?? null).qty += it.quantity;
  const sellers = [...bySeller.values()].sort((a, b) => b.total - a.total);

  const methods = await safe(async () => {
    const rows = await fetchAll<{ method: string; amount_cents: number }>((a, b) =>
      db.from("payments").select("method, amount_cents")
        .eq("status", "completed").gte("created_at", desde).lt("created_at", hasta).range(a, b),
    );
    const map: Record<string, number> = {};
    for (const p of rows) map[p.method] = (map[p.method] ?? 0) + p.amount_cents;
    return Object.entries(map).sort((x, y) => y[1] - x[1]);
  }, [] as [string, number][]);

  const clientes = {
    atendidos: new Set(orders.map((o) => o.customer_id).filter(Boolean)).size,
    identificadas: orders.filter((o) => o.customer_id).length,
    nuevos: await safe(async () => {
      const { count } = await db.from("customers").select("*", { count: "exact", head: true })
        .gte("created_at", desde).lt("created_at", hasta);
      return count ?? 0;
    }, 0),
  };


  const [creditOutstanding, layawaysActive, layawayPending, outOfStock, piercings] = await Promise.all([
    safe(async () => {
      const { data } = await db.from("credit_accounts").select("balance_cents").gt("balance_cents", 0);
      return ((data as unknown as { balance_cents: number }[]) ?? []).reduce((s, r) => s + r.balance_cents, 0);
    }, 0),
    safe(async () => {
      const { count } = await db.from("layaways").select("*", { count: "exact", head: true }).eq("status", "active");
      return count ?? 0;
    }, 0),
    safe(async () => {
      const { data } = await db.from("layaways").select("total_cents, paid_cents").eq("status", "active");
      return ((data as unknown as { total_cents: number; paid_cents: number }[]) ?? [])
        .reduce((s, l) => s + (l.total_cents - l.paid_cents), 0);
    }, 0),
    safe(async () => {
      const { count } = await db.from("stock_levels").select("*", { count: "exact", head: true }).eq("quantity", 0);
      return count ?? 0;
    }, 0),
    safe(async () => {
      const { count } = await db.from("piercings").select("*", { count: "exact", head: true })
        .is("deleted_at", null).gte("performed_at", desde.slice(0, 10)).lte("performed_at", hasta.slice(0, 10));
      return count ?? 0;
    }, 0),
  ]);

  return {
    sales, pieces, services, methods, topByQty, topByAmount, sellers, clientes,
    creditOutstanding, layawaysActive, layawayPending, outOfStock, piercings,
    productosDistintos: productos.length,
  };
}

// ── Reporte de piezas vendidas ────────────────────────────────────────────────

export type PiecesFilters = { canal?: string; incluirServicios?: boolean };

export type PiecesReport = {
  rows: ProductRow[];
  piezas: number;
  importe: number;
  ventas: number;
};

/** Detalle de qué se vendió en el periodo, un renglón por código. */
export async function loadPieces(from: Date, to: Date, f: PiecesFilters = {}): Promise<PiecesReport> {
  const db = createAdminClient();
  const items = await safe(() => loadItems(db, from, to), [] as ItemRow[]);

  const usables = items.filter((i) => {
    if (!f.incluirServicios && i.is_service) return false;
    if (f.canal && i.orders?.channel !== f.canal) return false;
    return true;
  });

  const map = new Map<string, ProductRow>();
  for (const it of usables) {
    const key = it.sku || it.name;
    const e = map.get(key) ?? { sku: it.sku, name: it.name, qty: 0, total: 0 };
    e.qty += it.quantity;
    e.total += it.total_cents;
    map.set(key, e);
  }

  const rows = [...map.values()].sort((a, b) => b.qty - a.qty || b.total - a.total);
  const ventas = await safe(async () => {
    let q = db.from("orders").select("*", { count: "exact", head: true })
      .in("status", PAID).is("deleted_at", null)
      .gte("created_at", from.toISOString()).lt("created_at", to.toISOString());
    if (f.canal) q = q.eq("channel", f.canal);
    const { count } = await q;
    return count ?? 0;
  }, 0);

  return {
    rows,
    piezas: rows.reduce((s, r) => s + r.qty, 0),
    importe: rows.reduce((s, r) => s + r.total, 0),
    ventas,
  };
}
