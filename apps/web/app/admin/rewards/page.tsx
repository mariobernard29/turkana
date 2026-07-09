import { createAdminClient } from "@/lib/supabase/admin";
import { RewardsManager } from "@/components/admin/rewards-manager";

export const dynamic = "force-dynamic";

async function load() {
  try {
    const db = createAdminClient();
    const [coupons, members, prods] = await Promise.all([
      db.from("coupons").select("id, code, type, discount_kind, discount_value, active, product_id, products(name)").order("created_at", { ascending: false }),
      db.from("customers").select("id, full_name, email").not("auth_user_id", "is", null).not("email", "is", null).order("created_at", { ascending: false }),
      db.from("products").select("id, name, sku, product_variants(price_cents, is_active)").eq("status", "active").is("deleted_at", null).order("name").limit(500),
    ]);

    type RawProd = { id: string; name: string; sku: string | null; product_variants: { price_cents: number; is_active: boolean }[] };
    const products = ((prods.data as unknown as RawProd[]) ?? []).map((p) => {
      const prices = (p.product_variants ?? []).filter((v) => v.is_active).map((v) => v.price_cents);
      return { variantId: p.id, sku: p.sku ?? "", name: p.name, priceCents: prices.length ? Math.min(...prices) : 0 };
    });

    return {
      coupons: (coupons.data as unknown as Parameters<typeof RewardsManager>[0]["coupons"]) ?? [],
      members: (members.data as unknown as { id: string; full_name: string; email: string | null }[]) ?? [],
      products,
    };
  } catch {
    return { coupons: [], members: [], products: [] };
  }
}

export default async function AdminRewardsPage() {
  const { coupons, members, products } = await load();
  return (
    <div>
      <h1 className="mb-1 text-3xl text-ink">Turkana Rewards</h1>
      <p className="mb-8 text-sm text-muted">Cupones de descuento y miembros del programa</p>
      <RewardsManager coupons={coupons} members={members} products={products} />
    </div>
  );
}
