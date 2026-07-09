import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProductForm, type ProductFormInitial } from "@/components/admin/product-form";

export const dynamic = "force-dynamic";

async function loadData(id: string) {
  const db = createAdminClient();
  const [prod, cat] = await Promise.all([
    db
      .from("products")
      .select(
        "*, product_variants(id, sku, price_cents, compare_at_cents, attributes, is_active), product_images(id, storage_path, position)",
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    db.from("categories").select("id, name").is("deleted_at", null).order("name"),
  ]);

  return {
    product: prod.data as unknown as RawProduct | null,
    categories: (cat.data as unknown as { id: string; name: string }[]) ?? [],
  };
}

type RawProduct = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  short_description: string | null;
  long_description: string | null;
  material: string | null;
  stone: string | null;
  weight_grams: number | null;
  category_id: string | null;
  tags: string[] | null;
  seo_title: string | null;
  seo_description: string | null;
  status: "draft" | "active" | "archived";
  is_featured: boolean;
  hidden_online: boolean | null;
  track_inventory: boolean | null;
  product_variants: {
    id: string;
    sku: string;
    price_cents: number;
    compare_at_cents: number | null;
    attributes: Record<string, string> | null;
    is_active: boolean;
  }[];
  product_images: { id: string; storage_path: string; position: number }[];
};

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { product, categories } = await loadData(id);
  if (!product) notFound();

  const initial: ProductFormInitial = {
    id: product.id,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    short_description: product.short_description,
    long_description: product.long_description,
    material: product.material,
    stone: product.stone,
    weight_grams: product.weight_grams,
    category_id: product.category_id,
    tags: product.tags ?? [],
    seo_title: product.seo_title,
    seo_description: product.seo_description,
    status: product.status,
    is_featured: product.is_featured,
    hidden_online: product.hidden_online ?? false,
    track_inventory: product.track_inventory ?? true,
    variants: (product.product_variants ?? [])
      .filter((v) => v.is_active)
      .map((v) => ({
        id: v.id,
        sku: v.sku,
        price_cents: v.price_cents,
        compare_at_cents: v.compare_at_cents,
        attributes: v.attributes ?? {},
      })),
    images: (product.product_images ?? [])
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ id: i.id, storage_path: i.storage_path })),
  };

  return (
    <div>
      <Link href="/admin/productos" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft className="h-4 w-4" /> Productos
      </Link>
      <h1 className="mb-8 text-3xl text-ink">{product.name}</h1>
      <ProductForm initial={initial} categories={categories} />
    </div>
  );
}
