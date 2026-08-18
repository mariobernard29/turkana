import { createAdminClient } from "@/lib/supabase/admin";
import { MAIN_LOCATION_KEY } from "@/lib/inventory";
import { InventoryManager, type InvRow } from "@/components/admin/inventory-manager";

export const dynamic = "force-dynamic";

type RawVariant = {
  id: string;
  sku: string;
  attributes: Record<string, string> | null;
  products: { name: string; deleted_at: string | null } | { name: string; deleted_at: string | null }[] | null;
  stock_levels: { quantity: number; reserved: number; location_id: string }[];
};

async function loadInventory(): Promise<InvRow[]> {
  const db = createAdminClient();

  const { data: loc } = await db
    .from("inventory_locations").select("id").eq("key", MAIN_LOCATION_KEY).maybeSingle();
  const locId = (loc as { id: string } | null)?.id;

  const { data } = await db
    .from("product_variants")
    .select("id, sku, attributes, products(name, deleted_at), stock_levels(quantity, reserved, location_id)")
    .eq("is_active", true)
    .is("deleted_at", null)
    .limit(1000);

  const variants = (data as unknown as RawVariant[]) ?? [];

  return variants
    .map((v): InvRow | null => {
      const prod = Array.isArray(v.products) ? v.products[0] : v.products;
      if (!prod || prod.deleted_at) return null;
      const level = (v.stock_levels ?? []).find((s) => s.location_id === locId);
      return {
        variantId: v.id,
        sku: v.sku,
        productName: prod.name,
        attributesText: Object.values(v.attributes ?? {}).join(" · "),
        stock: level?.quantity ?? 0,
        // Piezas comprometidas en apartados y pedidos en línea: siguen contadas
        // pero no se pueden vender, y por eso se muestran aparte.
        reserved: level?.reserved ?? 0,
      };
    })
    .filter((r): r is InvRow => r !== null)
    .sort((a, b) => a.productName.localeCompare(b.productName));
}

export default async function InventoryPage() {
  const rows = await loadInventory();
  const totalUnits = rows.reduce((s, r) => s + r.stock, 0);

  return (
    <div>
      <h1 className="mb-1 text-3xl text-ink">Inventario</h1>
      <p className="mb-8 text-sm text-muted">
        {rows.length} variantes · {totalUnits} piezas en total · un solo almacén para el
        mostrador y la tienda en línea
      </p>
      <InventoryManager rows={rows} />
    </div>
  );
}
