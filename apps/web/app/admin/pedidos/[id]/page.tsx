import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMXN } from "@/lib/utils";
import { OrderActions } from "@/components/admin/order-actions";
import { STATUS_LABEL, STATUS_STYLE } from "../page";

export const dynamic = "force-dynamic";

type One<T> = T | T[] | null;
function pick<T>(v: One<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type RawOrder = {
  id: string;
  order_number: string;
  channel: string;
  status: string;
  subtotal_cents: number;
  shipping_cents: number;
  tax_cents: number;
  total_cents: number;
  rewards_earned_cents: number;
  shipping_method: string | null;
  created_at: string;
  customers: One<{ full_name: string; email: string | null; phone: string | null }>;
  shipping_address: One<{
    street: string; ext_number: string | null; int_number: string | null;
    postal_code: string | null; neighborhood: string | null; city: string | null;
    state: string | null; references_note: string | null;
  }>;
  order_items: { sku: string; name: string; quantity: number; unit_price_cents: number; total_cents: number }[];
  payments: { method: string; amount_cents: number; status: string; created_at: string }[];
};

async function loadOrder(id: string) {
  const db = createAdminClient();
  const { data } = await db
    .from("orders")
    .select(
      "*, customers(full_name, email, phone), shipping_address:customer_addresses(street, ext_number, int_number, postal_code, neighborhood, city, state, references_note), order_items(sku, name, quantity, unit_price_cents, total_cents), payments(method, amount_cents, status, created_at)",
    )
    .eq("id", id)
    .maybeSingle();
  return data as unknown as RawOrder | null;
}

const METHOD_LABEL: Record<string, string> = {
  stripe: "Tarjeta (Stripe)", oxxo: "OXXO", cash: "Efectivo",
  card: "Tarjeta", transfer: "Transferencia", rewards: "Rewards",
  credit: "Crédito", layaway: "Apartado",
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await loadOrder(id);
  if (!order) notFound();

  const customer = pick(order.customers);
  const addr = pick(order.shipping_address);

  return (
    <div>
      <Link href="/admin/pedidos" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft className="h-4 w-4" /> Pedidos
      </Link>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl text-ink">{order.order_number}</h1>
          <p className="mt-1 text-sm text-muted">
            {new Date(order.created_at).toLocaleString("es-MX")} · {order.channel === "pos" ? "POS" : "Online"}
          </p>
        </div>
        <span className={`rounded-full px-4 py-1.5 text-sm ${STATUS_STYLE[order.status] ?? ""}`}>
          {STATUS_LABEL[order.status] ?? order.status}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Items + totales */}
        <div className="space-y-6 lg:col-span-2">
          <section className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink/10 text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-6 py-3 font-medium">Producto</th>
                  <th className="px-6 py-3 font-medium">Cant.</th>
                  <th className="px-6 py-3 font-medium">Precio</th>
                  <th className="px-6 py-3 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {(order.order_items ?? []).map((it, i) => (
                  <tr key={i} className="border-b border-ink/5 last:border-0">
                    <td className="px-6 py-3">
                      <p className="text-ink">{it.name}</p>
                      <p className="text-xs text-muted">{it.sku}</p>
                    </td>
                    <td className="px-6 py-3 text-muted">{it.quantity}</td>
                    <td className="px-6 py-3 text-muted">{formatMXN(it.unit_price_cents)}</td>
                    <td className="px-6 py-3 text-ink">{formatMXN(it.total_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-1.5 border-t border-ink/10 p-6 text-sm">
              <Row label="Subtotal" value={formatMXN(order.subtotal_cents)} />
              <Row label="Envío" value={order.shipping_cents === 0 ? "Gratis" : formatMXN(order.shipping_cents)} />
              <Row label="IVA (16%)" value={formatMXN(order.tax_cents)} />
              <div className="flex justify-between border-t border-ink/10 pt-2 text-base text-ink">
                <span>Total</span>
                <span className="font-semibold tabular-nums">{formatMXN(order.total_cents)}</span>
              </div>
              {order.rewards_earned_cents > 0 && (
                <p className="pt-1 text-xs text-gold">
                  Rewards acreditados: {formatMXN(order.rewards_earned_cents)}
                </p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-ink/10 bg-white p-6">
            <h2 className="mb-4 text-lg text-ink">Gestión del pedido</h2>
            <OrderActions orderId={order.id} status={order.status} hasEmail={Boolean(customer?.email)} />
          </section>
        </div>

        {/* Cliente / dirección / pago */}
        <div className="space-y-6">
          <InfoCard title="Cliente">
            <p className="text-ink">{customer?.full_name ?? "—"}</p>
            {customer?.email && <p className="text-muted">{customer.email}</p>}
            {customer?.phone && <p className="text-muted">{customer.phone}</p>}
          </InfoCard>

          {addr && (
            <InfoCard title="Envío">
              <p className="text-ink">
                {addr.street} {addr.ext_number}{addr.int_number ? ` int. ${addr.int_number}` : ""}
              </p>
              <p className="text-muted">
                {[addr.neighborhood, addr.postal_code].filter(Boolean).join(", ")}
              </p>
              <p className="text-muted">{[addr.city, addr.state].filter(Boolean).join(", ")}</p>
              {addr.references_note && <p className="mt-1 text-xs text-muted">Ref: {addr.references_note}</p>}
            </InfoCard>
          )}

          <InfoCard title="Pagos">
            {(order.payments ?? []).length === 0 ? (
              <p className="text-muted">Sin pagos registrados</p>
            ) : (
              order.payments.map((p, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-muted">{METHOD_LABEL[p.method] ?? p.method}</span>
                  <span className="text-ink">
                    {formatMXN(p.amount_cents)}
                    <span className="ml-2 text-xs text-muted">{p.status}</span>
                  </span>
                </div>
              ))
            )}
          </InfoCard>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted">
      <span>{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-ink/10 bg-white p-6 text-sm">
      <h2 className="mb-3 text-xs uppercase tracking-wider text-muted">{title}</h2>
      <div className="space-y-1">{children}</div>
    </section>
  );
}
