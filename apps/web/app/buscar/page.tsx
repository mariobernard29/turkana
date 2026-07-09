import { createClient } from "@/lib/supabase/server";
import { ShopHeader } from "@/components/shop/header";
import { ShopFooter } from "@/components/shop/footer";
import { SearchClient, type SearchItem } from "@/components/shop/search-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Buscar — Turkana Jewelry" };

type Raw = {
  name: string;
  slug: string;
  material: string | null;
  short_description: string | null;
  long_description: string | null;
  product_variants: { price_cents: number; is_active: boolean }[];
  product_images: { storage_path: string; position: number }[];
  categories: { hidden_online: boolean } | { hidden_online: boolean }[] | null;
};

async function loadProducts(): Promise<SearchItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("name, slug, material, short_description, long_description, product_variants(price_cents, is_active), product_images(storage_path, position), categories(hidden_online)")
    .eq("status", "active")
    .eq("hidden_online", false)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return ((data as unknown as Raw[]) ?? [])
    .filter((p) => {
      const cat = Array.isArray(p.categories) ? p.categories[0] : p.categories;
      return !cat?.hidden_online;
    })
    .map((p): SearchItem | null => {
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
        description: `${p.short_description ?? ""} ${p.long_description ?? ""}`.trim(),
      };
    })
    .filter((p): p is SearchItem => p !== null);
}

export default async function BuscarPage() {
  const products = await loadProducts();
  return (
    <div className="min-h-screen">
      <ShopHeader />
      <main className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="mb-2 text-center font-serif text-4xl text-ink">Buscar</h1>
        <p className="mb-10 text-center text-sm text-muted">Encuentra tu próxima pieza</p>
        <SearchClient products={products} />
      </main>
      <ShopFooter />
    </div>
  );
}
