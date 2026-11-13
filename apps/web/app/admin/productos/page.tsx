import Link from "next/link";
import { LiveRefresh } from "@/components/live-refresh";
import { Plus } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/paginate";
import { CategoriesManager } from "@/components/admin/categories-manager";
import { ProductsTable, type ProductRow } from "@/components/admin/products-table";
import { ProductsExcel } from "@/components/admin/products-excel";

export const dynamic = "force-dynamic";

// Filtros del lado del servidor: filtrar en el cliente filtraría un conjunto ya
// truncado y el conteo mentiría.
type Filters = { cat?: string; estado?: string; tienda?: string };
const STATUSES = ["draft", "active", "archived"] as const;
const STATUS_LABEL: Record<string, string> = { draft: "Borrador", active: "Activo", archived: "Archivado" };

async function loadProducts(f: Filters): Promise<ProductRow[]> {
  try {
    const db = createAdminClient();
    // Traía 100 y decía "100 piezas en catálogo" con mil dadas de alta: no había
    // forma de notar que faltaban. Ahora se recorre completo, por páginas.
    return await fetchAll<ProductRow>((from, to) => {
      let q = db
        .from("products")
        .select("id, name, sku, status, hidden_online, categories(name), product_variants(price_cents), product_images(id)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (f.cat) q = q.eq("category_id", f.cat);
      if (f.estado && (STATUSES as readonly string[]).includes(f.estado)) q = q.eq("status", f.estado);
      // La tienda en línea se llena a mano: este filtro es para ir viendo qué ya salió.
      if (f.tienda === "publicados") q = q.eq("hidden_online", false);
      if (f.tienda === "ocultos") q = q.eq("hidden_online", true);
      return q;
    });
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

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Filters> }) {
  const f = await searchParams;
  const [products, categories] = await Promise.all([loadProducts(f), loadCategories()]);
  const filtered = Boolean(f.cat || f.estado || f.tienda);
  const publicados = products.filter((p) => !p.hidden_online).length;
  const inputCls = "rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold";

  return (
    <div>
      <LiveRefresh tables={["products", "product_variants", "categories", "stock_levels"]} />
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
          <p className="mt-1 text-sm text-muted">
            {products.length} piezas {filtered ? "en el filtro" : "en catálogo"}
            {" · "}
            <span className={publicados > 0 ? "text-ink" : undefined}>
              {publicados} en la tienda en línea
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProductsExcel />
          <Link
            href="/admin/productos/nuevo"
            className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark"
          >
            <Plus className="h-4 w-4" /> Nuevo
          </Link>
        </div>
      </div>

      {/* Filtros de catálogo (el buscador por texto vive en la tabla) */}
      <form className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-muted">Categoría</label>
          <select name="cat" defaultValue={f.cat ?? ""} className={inputCls}>
            <option value="">Todas</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-muted">Estado</label>
          <select name="estado" defaultValue={f.estado ?? ""} className={inputCls}>
            <option value="">Todos</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-muted">Tienda en línea</label>
          <select name="tienda" defaultValue={f.tienda ?? ""} className={inputCls}>
            <option value="">Todas</option>
            <option value="publicados">Publicadas</option>
            <option value="ocultos">Ocultas</option>
          </select>
        </div>
        <button type="submit" className="rounded-full bg-ink px-6 py-2 text-sm uppercase tracking-widest text-cream hover:bg-gold-dark">Filtrar</button>
        {filtered && <Link href="/admin/productos" className="px-2 py-2 text-sm text-muted hover:text-ink">Limpiar</Link>}
      </form>

      {products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink/15 bg-white p-16 text-center">
          <p className="font-serif text-xl text-ink">{filtered ? "Sin productos en este filtro" : "Aún no hay productos"}</p>
          <p className="mt-2 text-sm text-muted">
            {filtered ? "Prueba con otra categoría o estado." : "Crea tu primera pieza para empezar."}
          </p>
        </div>
      ) : (
        <ProductsTable products={products} />
      )}
    </div>
  );
}
