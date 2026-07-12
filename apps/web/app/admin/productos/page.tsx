import Link from "next/link";
import { Plus } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { CategoriesManager } from "@/components/admin/categories-manager";
import { ProductsTable, type ProductRow } from "@/components/admin/products-table";

export const dynamic = "force-dynamic";

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
        <ProductsTable products={products} />
      )}
    </div>
  );
}
