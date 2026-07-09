import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMXN } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  paid: "Pagado",
  preparing: "Preparando",
  shipped: "Enviado",
  delivered: "Entregado",
  completed: "Completado",
  cancelled: "Cancelado",
};

export const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  paid: "bg-blue-50 text-blue-700",
  preparing: "bg-indigo-50 text-indigo-700",
  shipped: "bg-violet-50 text-violet-700",
  delivered: "bg-teal-50 text-teal-700",
  completed: "bg-green-50 text-green-700",
  cancelled: "bg-gray-100 text-gray-500",
};

type Row = {
  id: string;
  order_number: string;
  channel: string;
  status: string;
  total_cents: number;
  created_at: string;
  customers: { full_name: string } | { full_name: string }[] | null;
};

type Filters = { canal?: string; desde?: string; hasta?: string };

async function loadOrders(f: Filters): Promise<Row[]> {
  try {
    const db = createAdminClient();
    let query = db
      .from("orders")
      .select("id, order_number, channel, status, total_cents, created_at, customers(full_name)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (f.canal === "pos" || f.canal === "ecommerce") query = query.eq("channel", f.canal);
    if (f.desde) query = query.gte("created_at", `${f.desde}T00:00:00`);
    if (f.hasta) query = query.lte("created_at", `${f.hasta}T23:59:59`);
    const { data } = await query;
    return (data as unknown as Row[]) ?? [];
  } catch {
    return [];
  }
}

function customerName(c: Row["customers"]): string {
  const obj = Array.isArray(c) ? c[0] : c;
  return obj?.full_name ?? "—";
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  const f = await searchParams;
  const orders = await loadOrders(f);
  const inputCls = "rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold";

  return (
    <div>
      <h1 className="mb-1 text-3xl text-ink">Pedidos</h1>
      <p className="mb-6 text-sm text-muted">{orders.length} pedidos</p>

      {/* Filtros */}
      <form className="mb-8 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-muted">Canal</label>
          <select name="canal" defaultValue={f.canal ?? ""} className={inputCls}>
            <option value="">Todos</option>
            <option value="pos">POS (tienda)</option>
            <option value="ecommerce">En línea</option>
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
        {(f.canal || f.desde || f.hasta) && (
          <Link href="/admin/pedidos" className="px-2 py-2 text-sm text-muted hover:text-ink">Limpiar</Link>
        )}
      </form>

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink/15 bg-white p-16 text-center">
          <p className="font-serif text-xl text-ink">Aún no hay pedidos</p>
          <p className="mt-2 text-sm text-muted">Las ventas online y de POS aparecerán aquí.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-6 py-4 font-medium">Folio</th>
                <th className="px-6 py-4 font-medium">Fecha</th>
                <th className="px-6 py-4 font-medium">Cliente</th>
                <th className="px-6 py-4 font-medium">Canal</th>
                <th className="px-6 py-4 font-medium">Total</th>
                <th className="px-6 py-4 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-ink/5 last:border-0 hover:bg-cream/50">
                  <td className="px-6 py-4">
                    <Link href={`/admin/pedidos/${o.id}`} className="text-ink hover:text-gold">
                      {o.order_number}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-muted">
                    {new Date(o.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-6 py-4 text-ink">{customerName(o.customers)}</td>
                  <td className="px-6 py-4 text-muted">{o.channel === "pos" ? "POS" : "Online"}</td>
                  <td className="px-6 py-4 text-ink">{formatMXN(o.total_cents)}</td>
                  <td className="px-6 py-4">
                    <span className={`rounded-full px-3 py-1 text-xs ${STATUS_STYLE[o.status] ?? ""}`}>
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
