import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProductForm } from "@/components/admin/product-form";

export const dynamic = "force-dynamic";

async function loadCategories() {
  const db = createAdminClient();
  const [cat, col] = await Promise.all([
    db.from("categories").select("id, name").is("deleted_at", null).order("name"),
    db.from("collections").select("id, name").is("deleted_at", null).order("position").limit(1).maybeSingle(),
  ]);
  return {
    categories: (cat.data as unknown as { id: string; name: string }[]) ?? [],
    featuredCollection: (col.data as unknown as { id: string; name: string } | null) ?? null,
  };
}

export default async function NewProductPage() {
  const { categories, featuredCollection } = await loadCategories();
  return (
    <div>
      <Link href="/admin/productos" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft className="h-4 w-4" /> Productos
      </Link>
      <h1 className="mb-8 text-3xl text-ink">Nuevo producto</h1>
      <ProductForm categories={categories} featuredCollection={featuredCollection} />
    </div>
  );
}
