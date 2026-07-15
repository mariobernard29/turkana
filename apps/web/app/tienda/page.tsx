import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ShopHeader } from "@/components/shop/header";
import { ShopFooter } from "@/components/shop/footer";
import { ProductCard, type CatalogProduct } from "@/components/shop/product-card";
import { EditorialTile } from "@/components/shop/editorial-tile";
import { Reveal } from "@/components/shop/reveal";

export const dynamic = "force-dynamic";

// Imágenes editoriales que se intercalan cada 6 productos en el listado.
const CATALOG_TILES = ["/catalogo1.png", "/catalogo2.png", "/catalogo3.png"];

type RawProduct = {
  name: string;
  slug: string;
  material: string | null;
  product_variants: { price_cents: number; is_active: boolean }[];
  product_images: { storage_path: string; position: number }[];
  categories: { hidden_online: boolean } | { hidden_online: boolean }[] | null;
};

async function loadCatalog(categoria?: string) {
  const supabase = await createClient();

  const { data: categories } = await supabase
    .from("categories")
    .select("name, slug")
    .is("deleted_at", null)
    .eq("hidden_online", false)
    .order("name");

  let query = supabase
    .from("products")
    .select(
      "name, slug, material, category_id, hidden_online, product_variants(price_cents, is_active), product_images(storage_path, position), categories(hidden_online)",
    )
    .eq("status", "active")
    .eq("hidden_online", false)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (categoria) {
    const { data: c } = await supabase
      .from("categories").select("id").eq("slug", categoria).maybeSingle();
    if (c) query = query.eq("category_id", (c as { id: string }).id);
  }

  const { data } = await query;
  const rows = ((data as unknown as RawProduct[]) ?? []).filter((p) => {
    const cat = Array.isArray(p.categories) ? p.categories[0] : p.categories;
    return !cat?.hidden_online; // ocultar productos de categorías ocultas
  });

  const products: CatalogProduct[] = rows
    .map((p): CatalogProduct | null => {
      const prices = (p.product_variants ?? [])
        .filter((v) => v.is_active)
        .map((v) => v.price_cents);
      if (prices.length === 0) return null;
      const image = [...(p.product_images ?? [])].sort((a, b) => a.position - b.position)[0];
      return {
        slug: p.slug,
        name: p.name,
        material: p.material,
        minPriceCents: Math.min(...prices),
        multiplePrices: new Set(prices).size > 1,
        image: image?.storage_path ?? null,
      };
    })
    .filter((p): p is CatalogProduct => p !== null);

  return {
    products,
    categories: (categories as unknown as { name: string; slug: string }[]) ?? [],
  };
}

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string }>;
}) {
  const { categoria } = await searchParams;
  const { products, categories } = await loadCatalog(categoria);

  return (
    <div className="min-h-screen">
      <ShopHeader />
      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-10 text-center">
          <h1 className="font-serif text-4xl text-ink">La colección</h1>
          <p className="mt-3 text-sm text-muted">Piezas atemporales, hechas para perdurar</p>
          <span className="mx-auto mt-4 block h-px w-16 bg-gold/50" />
        </div>

        {/* Filtros por categoría */}
        <div className="mb-10 flex flex-wrap items-center justify-center gap-3 text-xs uppercase tracking-widest">
          <Link
            href="/tienda"
            className={`rounded-full border px-4 py-2 transition-colors ${
              !categoria ? "border-ink bg-ink text-cream" : "border-ink/15 text-muted hover:border-gold"
            }`}
          >
            Todo
          </Link>
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={`/tienda?categoria=${c.slug}`}
              className={`rounded-full border px-4 py-2 transition-colors ${
                categoria === c.slug ? "border-ink bg-ink text-cream" : "border-ink/15 text-muted hover:border-gold"
              }`}
            >
              {c.name}
            </Link>
          ))}
        </div>

        {products.length === 0 ? (
          <p className="py-24 text-center text-muted">
            No hay productos en esta vista todavía.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-4">
            {products.flatMap((p, idx) => {
              const nodes = [
                <Reveal key={p.slug} delay={(idx % 4) * 80}>
                  <ProductCard product={p} />
                </Reveal>,
              ];
              // Cada 4 productos (y si no es el último) intercala un mosaico editorial.
              if ((idx + 1) % 4 === 0 && idx !== products.length - 1) {
                const tile = CATALOG_TILES[(Math.floor((idx + 1) / 4) - 1) % CATALOG_TILES.length];
                nodes.push(
                  <Reveal key={`tile-${idx}`} className="col-span-2">
                    <EditorialTile src={tile} />
                  </Reveal>,
                );
              }
              return nodes;
            })}
          </div>
        )}
      </main>
      <ShopFooter />
    </div>
  );
}
