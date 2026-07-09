import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ShopHeader } from "@/components/shop/header";
import { ShopFooter } from "@/components/shop/footer";
import { ProductCard, type CatalogProduct } from "@/components/shop/product-card";
import {
  ProductDetail,
  type DetailVariant,
} from "@/components/shop/product-detail";

export const dynamic = "force-dynamic";

type RawProduct = {
  id: string;
  name: string;
  slug: string;
  short_description: string | null;
  long_description: string | null;
  material: string | null;
  stone: string | null;
  weight_grams: number | null;
  seo_title: string | null;
  seo_description: string | null;
  category_id: string | null;
  track_inventory: boolean | null;
  categories: { hidden_online: boolean } | { hidden_online: boolean }[] | null;
  product_variants: {
    id: string;
    sku: string;
    price_cents: number;
    compare_at_cents: number | null;
    attributes: Record<string, string> | null;
    is_active: boolean;
  }[];
  product_images: { storage_path: string; position: number }[];
};

async function loadProduct(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select(
      "id, name, slug, short_description, long_description, material, stone, weight_grams, seo_title, seo_description, category_id, track_inventory, categories(hidden_online), product_variants(id, sku, price_cents, compare_at_cents, attributes, is_active), product_images(storage_path, position)",
    )
    .eq("slug", slug)
    .eq("status", "active")
    .eq("hidden_online", false) // productos solo-POS no se abren en línea
    .is("deleted_at", null)
    .maybeSingle();
  const p = data as unknown as RawProduct | null;
  if (!p) return null;
  const cat = Array.isArray(p.categories) ? p.categories[0] : p.categories;
  if (cat?.hidden_online) return null; // categoría oculta → producto no disponible en línea
  return p;
}

// Stock del almacén e-commerce (anon no puede leer stock_levels por RLS).
async function loadStock(variantIds: string[]): Promise<Record<string, number>> {
  if (variantIds.length === 0) return {};
  const db = createAdminClient();
  const { data: loc } = await db
    .from("inventory_locations").select("id").eq("key", "ecommerce").maybeSingle();
  if (!loc) return {};
  const { data } = await db
    .from("stock_levels")
    .select("variant_id, quantity, reserved")
    .eq("location_id", (loc as { id: string }).id)
    .in("variant_id", variantIds);
  const map: Record<string, number> = {};
  for (const s of (data as unknown as { variant_id: string; quantity: number; reserved: number }[]) ?? []) {
    map[s.variant_id] = Math.max(0, s.quantity - s.reserved);
  }
  return map;
}

async function loadRelated(categoryId: string | null, excludeId: string): Promise<CatalogProduct[]> {
  if (!categoryId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("name, slug, material, product_variants(price_cents, is_active), product_images(storage_path, position)")
    .eq("status", "active")
    .eq("category_id", categoryId)
    .neq("id", excludeId)
    .is("deleted_at", null)
    .limit(4);

  type R = {
    name: string; slug: string; material: string | null;
    product_variants: { price_cents: number; is_active: boolean }[];
    product_images: { storage_path: string; position: number }[];
  };
  return ((data as unknown as R[]) ?? [])
    .map((p): CatalogProduct | null => {
      const prices = (p.product_variants ?? []).filter((v) => v.is_active).map((v) => v.price_cents);
      if (!prices.length) return null;
      const image = [...(p.product_images ?? [])].sort((a, b) => a.position - b.position)[0];
      return {
        slug: p.slug, name: p.name, material: p.material,
        minPriceCents: Math.min(...prices), multiplePrices: new Set(prices).size > 1,
        image: image?.storage_path ?? null,
      };
    })
    .filter((p): p is CatalogProduct => p !== null);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) return { title: "Producto no encontrado — Turkana" };
  return {
    title: product.seo_title ?? `${product.name} — Turkana Jewelry`,
    description: product.seo_description ?? product.short_description ?? undefined,
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) notFound();

  const activeVariants = (product.product_variants ?? []).filter((v) => v.is_active);
  const stock = await loadStock(activeVariants.map((v) => v.id));
  const related = await loadRelated(product.category_id, product.id);

  const noInventory = product.track_inventory === false;
  const variants: DetailVariant[] = activeVariants.map((v) => ({
    id: v.id,
    sku: v.sku,
    priceCents: v.price_cents,
    compareAtCents: v.compare_at_cents,
    attributes: v.attributes ?? {},
    stock: noInventory ? 9999 : stock[v.id] ?? 0,
  }));

  const images = [...(product.product_images ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((i) => i.storage_path);

  return (
    <div className="min-h-screen">
      <ShopHeader />
      <main className="mx-auto max-w-6xl px-6 py-12">
        <ProductDetail
          product={{
            slug: product.slug,
            name: product.name,
            shortDescription: product.short_description,
            longDescription: product.long_description,
            material: product.material,
            stone: product.stone,
            weightGrams: product.weight_grams,
          }}
          images={images}
          variants={variants}
        />

        {related.length > 0 && (
          <section className="mt-24">
            <h2 className="mb-10 text-center text-2xl text-ink">También te puede gustar</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-4">
              {related.map((p) => (
                <ProductCard key={p.slug} product={p} />
              ))}
            </div>
          </section>
        )}
      </main>
      <ShopFooter />
    </div>
  );
}
