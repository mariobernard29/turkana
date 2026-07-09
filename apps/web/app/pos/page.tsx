import { getStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PosOpen } from "@/components/pos/pos-open";
import { PosSale, type PosProduct } from "@/components/pos/pos-sale";

export const dynamic = "force-dynamic";

type ProdRel = {
  name: string; status: string; deleted_at: string | null; category_id: string | null;
  product_images: { storage_path: string; position: number; variant_id: string | null }[] | null;
};
type RawVariant = {
  id: string;
  product_id: string;
  sku: string;
  attributes: Record<string, string> | null;
  price_cents: number;
  products: ProdRel | ProdRel[] | null;
  stock_levels: { quantity: number; reserved: number; low_stock_threshold: number | null; location_id: string }[];
};

function sortTallas(a: { talla: string }, b: { talla: string }) {
  const na = Number(a.talla), nb = Number(b.talla);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return a.talla.localeCompare(b.talla);
}

async function loadPos(staffId: string) {
  const db = createAdminClient();

  const { data: sessionData } = await db
    .from("cash_sessions")
    .select("id, opening_float_cents, opened_at")
    .eq("cashier_id", staffId)
    .eq("status", "open")
    .maybeSingle();
  const session = sessionData as unknown as { id: string; opening_float_cents: number } | null;

  if (!session) {
    const { data: registers } = await db.from("cash_registers").select("id, name").order("name");
    return { session: null, registers: (registers as unknown as { id: string; name: string }[]) ?? [], products: [] as PosProduct[], categories: [] as { id: string; name: string }[] };
  }

  const { data: loc } = await db.from("inventory_locations").select("id").eq("key", "tienda").maybeSingle();
  const tiendaId = (loc as { id: string } | null)?.id;

  const { data: catData } = await db.from("categories").select("id, name").is("deleted_at", null).order("name");
  const categories = (catData as unknown as { id: string; name: string }[]) ?? [];

  const { data: vData } = await db
    .from("product_variants")
    .select("id, product_id, sku, attributes, price_cents, products(name, status, deleted_at, category_id, product_images(storage_path, position, variant_id)), stock_levels(quantity, reserved, low_stock_threshold, location_id)")
    .eq("is_active", true)
    .is("deleted_at", null)
    .limit(1000);

  // Agrupar variantes (tallas) por producto.
  const map = new Map<string, PosProduct>();
  for (const v of (vData as unknown as RawVariant[]) ?? []) {
    const prod = Array.isArray(v.products) ? v.products[0] : v.products;
    if (!prod || prod.deleted_at || prod.status !== "active") continue;
    const st = (v.stock_levels ?? []).find((s) => s.location_id === tiendaId);
    const stock = st ? Math.max(0, st.quantity - st.reserved) : 0;
    const low = st?.low_stock_threshold ?? 2;

    let p = map.get(v.product_id);
    if (!p) {
      const img = [...(prod.product_images ?? [])].sort((a, b) => a.position - b.position)[0]?.storage_path ?? null;
      p = { productId: v.product_id, name: prod.name, sku: v.sku, image: img, categoryId: prod.category_id, sizes: [] };
      map.set(v.product_id, p);
    }
    p.sizes.push({ variantId: v.id, talla: v.attributes?.talla ?? "", priceCents: v.price_cents, stock, lowThreshold: low });
  }

  const products = [...map.values()]
    .map((p) => ({ ...p, sizes: p.sizes.sort(sortTallas) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { session, registers: [], products, categories };
}

export default async function PosPage() {
  const staff = await getStaff();
  const { session, registers, products, categories } = await loadPos(staff!.id);

  if (!session) {
    return <PosOpen registers={registers} />;
  }
  return <PosSale session={{ id: session.id }} products={products} categories={categories} />;
}
