import Link from "next/link";
import { Plus } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMXN } from "@/lib/utils";
import { CategoriesManager } from "@/components/admin/categories-manager";

export const dynamic = "force-dynamic";

type VariantRow = { price_cents: number };
type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  status: string;
  categories: { name: string } | null;
  product_variants: VariantRow[];
};

async function loadProducts(): Promise<ProductRow[]> {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("products")
      .select("id, name, sku, status, categories(name), product_variants(price_cents)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100);
    return (data as unknown as ProductRow[]) ?? [];
  } catch {
    return [];
  }
}

async function loadCategories() {
  try {
    const db = createAdminClient();
    const { data } = await db.from("categories").select("id, name, slug, parent_id, hidden_online").is("deleted_at", null).order("name");
    return (data as unknown as { id: string; name: string; slug: string; parent_id: string | null; hidden_online: boolean }[]) ?? [];
  } catch {
    return [];
  }
}

function priceRange(variants: VariantRow[]): string {
  if (!variants.length) return "—";
  const prices = variants.map((v) => v.price_cents);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatMXN(min) : `${formatMXN(min)} – ${formatMXN(max)}`;
}

const STATUS_STYLE: Record<string, string> = {
  active: "bg-green-50 text-green-700",
  draft: "bg-amber-50 text-amber-700",
  archived: "bg-gray-100 text-gray-500",
};

export default async function ProductsPage() {
  const [products, categories] = await Promise.all([loadProducts(), loadCategories()]);

  return (
    <div>
      <details className="mb-8 rounded-2xl border border-ink/10 bg-white p-4">
        <summary className="cursor-pointer select-none text-sm font-medium text-ink">
          Categorías <span className="text-muted">({categories.length})</span>
        </summary>
        <div className="mt-4">
          <CategoriesManager categories={categories} />
        </div>
      </details>

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl text-ink">Productos</h1>
          <p className="mt-1 text-sm text-muted">{products.length} piezas en catálogo</p>
        </div>
        <Link
          href="/admin/productos/nuevo"
          className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark"
        >
          <Plus className="h-4 w-4" /> Nuevo
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink/15 bg-white p-16 text-center">
          <p className="font-serif text-xl text-ink">Aún no hay productos</p>
          <p className="mt-2 text-sm text-muted">
            Crea tu primera pieza para empezar.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-6 py-4 font-medium">Producto</th>
                <th className="px-6 py-4 font-medium">SKU</th>
                <th className="px-6 py-4 font-medium">Categoría</th>
                <th className="px-6 py-4 font-medium">Variantes</th>
                <th className="px-6 py-4 font-medium">Precio</th>
                <th className="px-6 py-4 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-ink/5 last:border-0 hover:bg-cream/50">
                  <td className="px-6 py-4">
                    <Link href={`/admin/productos/${p.id}`} className="text-ink hover:text-gold">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-muted">{p.sku ?? "—"}</td>
                  <td className="px-6 py-4 text-muted">{p.categories?.name ?? "—"}</td>
                  <td className="px-6 py-4 text-muted">{p.product_variants.length}</td>
                  <td className="px-6 py-4 text-ink">{priceRange(p.product_variants)}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs ${STATUS_STYLE[p.status] ?? ""}`}
                    >
                      {p.status}
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
