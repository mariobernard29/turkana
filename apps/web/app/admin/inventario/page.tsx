import { createAdminClient } from "@/lib/supabase/admin";
import { InventoryManager, type InvRow } from "@/components/admin/inventory-manager";

export const dynamic = "force-dynamic";

type RawVariant = {
  id: string;
  sku: string;
  attributes: Record<string, string> | null;
  products: { name: string; deleted_at: string | null } | { name: string; deleted_at: string | null }[] | null;
  stock_levels: { quantity: number; location_id: string }[];
};

async function loadInventory(): Promise<InvRow[]> {
  const db = createAdminClient();

  const { data: locs } = await db.from("inventory_locations").select("id, key");
  const locByKey: Record<string, string> = {};
  for (const l of (locs as unknown as { id: string; key: string }[]) ?? []) locByKey[l.key] = l.id;
  const tiendaId = locByKey["tienda"];
  const ecomId = locByKey["ecommerce"];

  const { data } = await db
    .from("product_variants")
    .select("id, sku, attributes, products(name, deleted_at), stock_levels(quantity, location_id)")
    .eq("is_active", true)
    .is("deleted_at", null)
    .limit(1000);

  const variants = (data as unknown as RawVariant[]) ?? [];

  return variants
    .map((v): InvRow | null => {
      const prod = Array.isArray(v.products) ? v.products[0] : v.products;
      if (!prod || prod.deleted_at) return null;
      const stockFor = (locId: string) =>
        (v.stock_levels ?? []).find((s) => s.location_id === locId)?.quantity ?? 0;
      return {
        variantId: v.id,
        sku: v.sku,
        productName: prod.name,
        attributesText: Object.values(v.attributes ?? {}).join(" · "),
        stockTienda: stockFor(tiendaId),
        stockEcommerce: stockFor(ecomId),
      };
    })
    .filter((r): r is InvRow => r !== null)
    .sort((a, b) => a.productName.localeCompare(b.productName));
}

export default async function InventoryPage() {
  const rows = await loadInventory();
  const totalUnits = rows.reduce((s, r) => s + r.stockTienda + r.stockEcommerce, 0);

  return (
    <div>
      <h1 className="mb-1 text-3xl text-ink">Inventario</h1>
      <p className="mb-8 text-sm text-muted">
        {rows.length} variantes · {totalUnits} piezas en total · catálogo compartido, stock por almacén
      </p>
      <InventoryManager rows={rows} />
    </div>
  );
}
