import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ShopHeader } from "@/components/shop/header";
import { ShopFooter } from "@/components/shop/footer";
import { ProductCard, type CatalogProduct } from "@/components/shop/product-card";
import { EditorialTile } from "@/components/shop/editorial-tile";
import { Reveal, Words, Rule } from "@/components/shop/reveal";

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

  // Sólo las categorías que de verdad tienen algo publicado. El catálogo trae
  // más de sesenta y la tienda se llena a mano: sin esto, el cliente ve una
  // fila de filtros que casi todos llevan a "no hay productos en esta vista".
  const { data: conProductos } = await supabase
    .from("products")
    .select("category_id")
    .eq("status", "active")
    .eq("hidden_online", false)
    .is("deleted_at", null)
    .not("category_id", "is", null);
  const idsConProductos = new Set(
    ((conProductos as unknown as { category_id: string }[]) ?? []).map((r) => r.category_id),
  );

  const { data: todasLasCategorias } = await supabase
    .from("categories")
    .select("id, name, slug")
    .is("deleted_at", null)
    .eq("hidden_online", false)
    .order("name");
  const categories = ((todasLasCategorias as unknown as { id: string; name: string; slug: string }[]) ?? [])
    .filter((c) => idsConProductos.has(c.id));

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

  return { products, categories };
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
      <main className="mx-auto max-w-6xl px-6 py-14 md:py-20">
        {/* Encabezado a la izquierda, como portada de catálogo impreso. Centrado
            quedaba igual que el de las otras cuatro secciones del sitio. */}
        <div className="mb-10 max-w-xl">
          <Words as="h1" text="La colección" className="font-serif text-[2.6rem] leading-none text-ink sm:text-5xl" />
          <Reveal delay={260}>
            <p className="mt-4 text-sm text-muted">Piezas atemporales, hechas para perdurar</p>
          </Reveal>
          <Rule align="left" className="mt-6" />
        </div>

        {/* Filtros por categoría */}
        <div className="mb-12 flex flex-wrap items-center gap-2.5 text-[0.68rem] uppercase tracking-[0.2em]">
          <Link
            href="/tienda"
            className={`rounded-full border px-4 py-2 transition-colors duration-300 ${
              !categoria ? "border-ink bg-ink text-cream" : "border-ink/15 text-muted hover:border-gold hover:text-ink"
            }`}
          >
            Todo
          </Link>
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={`/tienda?categoria=${c.slug}`}
              className={`rounded-full border px-4 py-2 transition-colors duration-300 ${
                categoria === c.slug ? "border-ink bg-ink text-cream" : "border-ink/15 text-muted hover:border-gold hover:text-ink"
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
