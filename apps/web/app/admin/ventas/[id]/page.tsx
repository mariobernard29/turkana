import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMXN } from "@/lib/utils";
import { requireStaff } from "@/lib/auth";
import { OrderActions } from "@/components/admin/order-actions";
import { SaleAdminActions } from "@/components/admin/sale-admin-actions";
import { ReceiptPrintButton } from "@/components/admin/receipt-print-button";
import { methodLabel } from "@/lib/payments";
import { ORDER_STATUS_LABEL, ORDER_STATUS_STYLE } from "@/lib/orders";
import type { ReceiptData } from "@/lib/escpos";

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
  discount_cents: number;
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


export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [order, staff] = await Promise.all([loadOrder(id), requireStaff()]);
  if (!order) notFound();

  const customer = pick(order.customers);
  const addr = pick(order.shipping_address);
  const isAdmin = ["super_admin", "admin"].includes(staff.role ?? "");
  const isPos = order.channel === "pos";

  // Ticket reconstruido desde la orden guardada, con su folio y fecha originales.
  const receipt: ReceiptData = {
    docType: "sale",
    orderNumber: order.order_number,
    items: (order.order_items ?? []).map((it) => ({ name: it.name, quantity: it.quantity, total_cents: it.total_cents })),
    subtotal: order.subtotal_cents,
    tax: order.tax_cents,
    total: order.total_cents,
    discountCents: order.discount_cents ?? 0,
    payments: (order.payments ?? [])
      .filter((p) => p.status === "completed")
      .map((p) => ({ method: p.method, amount_cents: p.amount_cents })),
    dateIso: order.created_at,
    reprint: true,
    // En línea el envío se suma al total; sin esta línea el ticket no cuadraría.
    // Una venta cancelada se marca para que su ticket no pase por válido.
    sections: [
      ...(order.shipping_cents > 0
        ? [{ rows: [{ label: "Envío", value: formatMXN(order.shipping_cents) }] }]
        : []),
      ...(order.status === "cancelled"
        ? [{ rows: [{ label: "*** VENTA CANCELADA ***", strong: true }] }]
        : []),
    ],
  };

  return (
    <div>
      <Link href="/admin/ventas" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft className="h-4 w-4" /> Ventas
      </Link>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl text-ink">{order.order_number}</h1>
          <p className="mt-1 text-sm text-muted">
            {new Date(order.created_at).toLocaleString("es-MX")} · {order.channel === "pos" ? "POS" : "Online"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ReceiptPrintButton receipt={receipt} />
          <span className={`rounded-full px-4 py-1.5 text-sm ${ORDER_STATUS_STYLE[order.status] ?? ""}`}>
            {ORDER_STATUS_LABEL[order.status] ?? order.status}
          </span>
        </div>
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
              {order.discount_cents > 0 && <Row label="Descuento" value={`−${formatMXN(order.discount_cents)}`} />}
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
            <h2 className="mb-4 text-lg text-ink">Gestión de la venta</h2>
            <OrderActions orderId={order.id} status={order.status} hasEmail={Boolean(customer?.email)} isPos={isPos} />
          </section>

          {/* Cancelar / corregir pagos: sólo admins y sólo ventas de tienda activas */}
          {isAdmin && isPos && order.status !== "cancelled" && (
            <SaleAdminActions
              orderId={order.id}
              orderNumber={order.order_number}
              totalCents={order.total_cents}
              payments={(order.payments ?? [])
                .filter((p) => p.status === "completed")
                .map((p) => ({ method: p.method, amount_cents: p.amount_cents }))}
            />
          )}
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
                  <span className="text-muted">{methodLabel(p.method)}</span>
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
