import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Ticket } from "lucide-react";
import { ShopHeader } from "@/components/shop/header";
import { ShopFooter } from "@/components/shop/footer";
import { RewardsCard } from "@/components/shop/rewards-card";
import { getCustomer } from "@/lib/customer";
import { createClient } from "@/lib/supabase/server";
import { logoutRewards } from "./acceso/actions";
import { formatMXN } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mi cuenta — Turkana Rewards" };

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente", paid: "Pagado", preparing: "Preparando", shipped: "Enviado",
  delivered: "Entregado", completed: "Completado", cancelled: "Cancelado",
};

type Coupon = { code: string; type: string; discount_kind: string; discount_value: number; products: { name: string } | { name: string }[] | null };
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
function discountText(c: Coupon) {
  const v = c.discount_kind === "percent" ? `${c.discount_value}%` : formatMXN(c.discount_value);
  return c.type === "product" ? `${v} en ${one(c.products)?.name ?? "una pieza"}` : `${v} en tu compra`;
}

export default async function RewardsPage() {
  const customer = await getCustomer();
  if (!customer) redirect("/rewards/acceso");

  const supabase = await createClient();
  const [{ data: orders }, { data: coupons }] = await Promise.all([
    supabase.from("orders").select("id, order_number, status, total_cents, channel, created_at").eq("customer_id", customer.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(50),
    supabase.from("coupons").select("code, type, discount_kind, discount_value, products(name)").eq("active", true).order("created_at", { ascending: false }).limit(20),
  ]);

  const orderRows = (orders as unknown as { id: string; order_number: string; status: string; total_cents: number; channel: string; created_at: string }[]) ?? [];
  const couponRows = (coupons as unknown as Coupon[]) ?? [];

  return (
    <div className="min-h-screen">
      <ShopHeader />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Image src="/turkana-rewards.png" alt="Turkana Rewards" width={200} height={57} className="mb-3 h-8 w-auto" />
            <h1 className="text-3xl text-ink">Hola, {customer.fullName.split(" ")[0]}</h1>
          </div>
          <form action={logoutRewards}>
            <button className="text-sm text-muted hover:text-ink">Cerrar sesión</button>
          </form>
        </div>

        {/* Membresía */}
        <div className="mb-8 flex flex-col items-center gap-6 rounded-2xl border border-ink/10 bg-white p-6 sm:flex-row">
          <div className="w-full max-w-xs shrink-0">
            <RewardsCard name={customer.fullName} />
          </div>
          <div className="text-center sm:text-left">
            <h2 className="font-serif text-xl text-ink">Eres miembro Turkana Rewards</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Disfruta descuentos exclusivos, acceso anticipado a nuevas piezas y sorpresas.
              Tus cupones llegan a tu correo y aparecen aquí abajo.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Cupones */}
          <section className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
            <h2 className="border-b border-ink/10 px-6 py-4 text-lg text-ink">Cupones disponibles</h2>
            {couponRows.length === 0 ? (
              <p className="p-6 text-sm text-muted">Por ahora no hay cupones. ¡Mantente al pendiente de tu correo y nuestras redes!</p>
            ) : (
              <div className="divide-y divide-ink/5">
                {couponRows.map((c) => (
                  <div key={c.code} className="flex items-center gap-4 px-6 py-4">
                    <Ticket className="h-5 w-5 shrink-0 text-gold" strokeWidth={1.5} />
                    <div className="flex-1">
                      <p className="font-mono text-sm tracking-wider text-ink">{c.code}</p>
                      <p className="text-xs text-muted">{discountText(c)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Compras */}
          <section className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
            <h2 className="border-b border-ink/10 px-6 py-4 text-lg text-ink">Historial de compras</h2>
            {orderRows.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted">
                Aún no tienes compras. <Link href="/tienda" className="text-gold">Explora la colección</Link>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <tbody>
                  {orderRows.map((o) => (
                    <tr key={o.id} className="border-b border-ink/5 last:border-0">
                      <td className="px-6 py-3 text-ink">{o.order_number}</td>
                      <td className="px-6 py-3 text-muted">{new Date(o.created_at).toLocaleDateString("es-MX")}</td>
                      <td className="px-6 py-3 text-muted">{o.channel === "pos" ? "Tienda" : "Online"}</td>
                      <td className="px-6 py-3 text-muted">{STATUS_LABEL[o.status] ?? o.status}</td>
                      <td className="px-6 py-3 text-right text-ink">{formatMXN(o.total_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </main>
      <ShopFooter />
    </div>
  );
}
