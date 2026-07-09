import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMXN } from "@/lib/utils";
import { LayawaysManager, type LayawayRow } from "@/components/admin/layaways-manager";
import { CreditsManager, type CreditRow } from "@/components/admin/credits-manager";
import { STATUS_LABEL, STATUS_STYLE } from "@/app/admin/pedidos/page";

export const dynamic = "force-dynamic";

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

async function loadCustomer(id: string) {
  const db = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const [cust, orders, credits, layaways] = await Promise.all([
    db.from("customers").select("full_name, email, phone, customer_addresses(street, ext_number, city, state, postal_code)").eq("id", id).maybeSingle(),
    db.from("orders").select("id, order_number, status, total_cents, channel, created_at").eq("customer_id", id).is("deleted_at", null).order("created_at", { ascending: false }).limit(50),
    db.from("credit_accounts").select("id, limit_cents, balance_cents, status, credit_transactions(type, due_date)").eq("customer_id", id),
    db.from("layaways").select("id, total_cents, paid_cents, status, due_date, product_variants(sku, products(name))").eq("customer_id", id).order("created_at", { ascending: false }),
  ]);

  const c = cust.data as {
    full_name: string; email: string | null; phone: string | null;
    customer_addresses: { street: string; ext_number: string | null; city: string | null; state: string | null; postal_code: string | null }[] | null;
  } | null;

  type RawLay = { id: string; total_cents: number; paid_cents: number; status: string; due_date: string | null; product_variants: { sku: string; products: { name: string } | { name: string }[] | null } | { sku: string; products: { name: string } | { name: string }[] | null }[] | null };
  const layRows: LayawayRow[] = ((layaways.data as unknown as RawLay[]) ?? []).map((l) => {
    const v = one(l.product_variants);
    const p = v ? one(v.products) : null;
    return { id: l.id, customer: c?.full_name ?? "", item: p?.name ?? v?.sku ?? "Apartado", total: l.total_cents, paid: l.paid_cents, dueDate: l.due_date, status: l.status };
  });

  type RawCred = { id: string; limit_cents: number; balance_cents: number; status: string; credit_transactions: { type: string; due_date: string | null }[] | null };
  const credRows: CreditRow[] = ((credits.data as unknown as RawCred[]) ?? []).map((a) => {
    const overdue = (a.credit_transactions ?? []).some((t) => t.type === "charge" && t.due_date && t.due_date < today) && a.balance_cents > 0;
    return { id: a.id, customer: c?.full_name ?? "", limit: a.limit_cents, balance: a.balance_cents, status: a.status, overdue };
  });

  return {
    customer: c,
    orders: (orders.data as unknown as { id: string; order_number: string; status: string; total_cents: number; channel: string; created_at: string }[]) ?? [],
    layRows, credRows,
  };
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { customer, orders, layRows, credRows } = await loadCustomer(id);
  if (!customer) notFound();

  return (
    <div>
      <Link href="/admin/clientes" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft className="h-4 w-4" /> Clientes
      </Link>
      <h1 className="mb-8 text-3xl text-ink">{customer.full_name}</h1>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Lateral */}
        <div className="space-y-6">
          <Card title="Contacto">
            <p className="text-ink">{customer.email ?? "Sin email"}</p>
            <p className="text-muted">{customer.phone ?? "Sin teléfono"}</p>
          </Card>
          {(customer.customer_addresses ?? []).length > 0 && (
            <Card title="Direcciones">
              {(customer.customer_addresses ?? []).map((a, i) => (
                <p key={i} className="text-muted">{a.street} {a.ext_number}, {[a.city, a.state, a.postal_code].filter(Boolean).join(", ")}</p>
              ))}
            </Card>
          )}
        </div>

        {/* Principal */}
        <div className="space-y-8 lg:col-span-2">
          <section>
            <h2 className="mb-3 text-lg text-ink">Apartados</h2>
            <LayawaysManager rows={layRows} showCustomer={false} />
          </section>

          <section>
            <h2 className="mb-3 text-lg text-ink">Créditos</h2>
            <CreditsManager rows={credRows} showCustomer={false} />
          </section>

          <section className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
            <h2 className="border-b border-ink/10 px-6 py-4 text-lg text-ink">Pedidos</h2>
            {orders.length === 0 ? (
              <p className="p-6 text-sm text-muted">Sin pedidos.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-ink/5 last:border-0 hover:bg-cream/50">
                      <td className="px-6 py-3"><Link href={`/admin/pedidos/${o.id}`} className="text-ink hover:text-gold">{o.order_number}</Link></td>
                      <td className="px-6 py-3 text-muted">{new Date(o.created_at).toLocaleDateString("es-MX")}</td>
                      <td className="px-6 py-3 text-muted">{o.channel === "pos" ? "POS" : "Online"}</td>
                      <td className="px-6 py-3"><span className={`rounded-full px-2.5 py-1 text-xs ${STATUS_STYLE[o.status] ?? ""}`}>{STATUS_LABEL[o.status] ?? o.status}</span></td>
                      <td className="px-6 py-3 text-right text-ink">{formatMXN(o.total_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-ink/10 bg-white p-6 text-sm shadow-sm">
      <h2 className="mb-3 text-xs uppercase tracking-wider text-muted">{title}</h2>
      <div className="space-y-1">{children}</div>
    </section>
  );
}
