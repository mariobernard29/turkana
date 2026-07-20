import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ShopHeader } from "@/components/shop/header";
import { ShopFooter } from "@/components/shop/footer";
import { ProductCard, type CatalogProduct } from "@/components/shop/product-card";
import { Reveal } from "@/components/shop/reveal";
import { brandImageUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

type CollectionRow = { id: string; name: string; description: string | null; hero_image_url: string | null };

type RawProduct = {
  name: string;
  slug: string;
  material: string | null;
  product_variants: { price_cents: number; is_active: boolean }[];
  product_images: { storage_path: string; position: number }[];
};

async function loadCollection(slug: string) {
  const supabase = await createClient();

  const { data: collection } = await supabase
    .from("collections")
    .select("id, name, description, hero_image_url")
    .eq("slug", slug)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (!collection) return null;
  const col = collection as unknown as CollectionRow;

  const { data } = await supabase
    .from("products")
    .select("name, slug, material, product_variants(price_cents, is_active), product_images(storage_path, position)")
    .eq("status", "active")
    .eq("hidden_online", false)
    .eq("collection_id", col.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const products: CatalogProduct[] = ((data as unknown as RawProduct[]) ?? [])
    .map((p): CatalogProduct | null => {
      const prices = (p.product_variants ?? []).filter((v) => v.is_active).map((v) => v.price_cents);
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

  return { collection: col, products };
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await loadCollection(slug);
  if (!result) notFound();
  const { collection, products } = result;

  return (
    <div className="min-h-screen">
      <ShopHeader />

      {/* Banner de portada */}
      <section className="relative flex h-[45vh] min-h-[280px] items-center justify-center overflow-hidden bg-ink text-center text-cream sm:h-[55vh]">
        {collection.hero_image_url && (
          <Image
            src={brandImageUrl(collection.hero_image_url)}
            alt={collection.name}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-ink/40" />
        <div className="relative px-6">
          <p className="text-xs uppercase tracking-[0.3em] text-gold">Colección</p>
          <h1 className="mt-2 font-serif text-4xl sm:text-5xl">{collection.name}</h1>
          {collection.description && (
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-cream/80">{collection.description}</p>
          )}
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-6 py-12">
        {products.length === 0 ? (
          <p className="py-24 text-center text-muted">Pronto agregaremos piezas a esta colección.</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-4">
            {products.map((p, idx) => (
              <Reveal key={p.slug} delay={(idx % 4) * 80}>
                <ProductCard product={p} />
              </Reveal>
            ))}
          </div>
        )}
      </main>

      <ShopFooter />
    </div>
  );
}
