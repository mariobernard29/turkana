// Resolución de partidas (nombre, SKU y precio) desde variantes.
// Compartida por la venta del POS y por los apartados, para que la pieza se llame
// igual en la nota, en el apartado y en el ticket ("Producto · Talla 7").
import { createAdminClient } from "@/lib/supabase/admin";

type DB = ReturnType<typeof createAdminClient>;

export type LineItem = {
  variantId: string;
  sku: string;
  name: string;
  unitPriceCents: number; // con IVA incluido
  quantity: number;
  totalCents: number;
  tracksInventory: boolean;
};

type VariantRow = {
  id: string;
  sku: string;
  price_cents: number;
  attributes: Record<string, string> | null;
  products: { name: string; track_inventory?: boolean } | { name: string; track_inventory?: boolean }[] | null;
};

export async function buildLineItems(
  db: DB,
  items: { variantId: string; qty: number }[],
): Promise<{ ok: true; lines: LineItem[] } | { ok: false; error: string }> {
  if (!items.length) return { ok: true, lines: [] };

  const { data } = await db
    .from("product_variants")
    .select("id, sku, price_cents, attributes, products(name, track_inventory)")
    .in("id", items.map((i) => i.variantId));
  const vmap = new Map(((data as unknown as VariantRow[]) ?? []).map((v) => [v.id, v]));

  const lines: LineItem[] = [];
  for (const it of items) {
    const v = vmap.get(it.variantId);
    if (!v) return { ok: false, error: "Producto no encontrado" };
    if (it.qty <= 0) return { ok: false, error: "Cantidad inválida" };
    const prod = Array.isArray(v.products) ? v.products[0] : v.products;
    const talla = v.attributes?.talla;
    lines.push({
      variantId: v.id,
      sku: v.sku,
      name: `${prod?.name ?? v.sku}${talla ? ` · Talla ${talla}` : ""}`,
      unitPriceCents: v.price_cents,
      quantity: it.qty,
      totalCents: v.price_cents * it.qty,
      tracksInventory: prod?.track_inventory !== false,
    });
  }
  return { ok: true, lines };
}
