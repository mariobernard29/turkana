"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type VariantInput = {
  id?: string;
  sku: string;
  price: number; // en pesos
  compareAt?: number | null;
  attributes: Record<string, string>;
};

export type ImageInput = {
  id?: string;
  storage_path: string;
  position: number;
};

export type ProductInput = {
  id?: string;
  name: string;
  slug: string;
  sku?: string | null;
  short_description?: string | null;
  long_description?: string | null;
  material?: string | null;
  stone?: string | null;
  weight_grams?: number | null;
  category_id?: string | null;
  tags: string[];
  seo_title?: string | null;
  seo_description?: string | null;
  status: "draft" | "active" | "archived";
  is_featured: boolean;
  hidden_online?: boolean;
  track_inventory?: boolean;
  variants: VariantInput[];
  images: ImageInput[];
  removedVariantIds?: string[];
};

const toCents = (pesos: number) => Math.round(pesos * 100);

export async function saveProduct(
  input: ProductInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const staff = await requireStaff();
  const db = createAdminClient();

  if (!input.name?.trim()) return { ok: false, error: "El nombre es obligatorio" };
  if (!input.slug?.trim()) return { ok: false, error: "El slug es obligatorio" };
  if (input.variants.length === 0)
    return { ok: false, error: "Agrega al menos una variante (SKU + precio)" };

  const productRow = {
    name: input.name.trim(),
    slug: input.slug.trim(),
    sku: input.sku || null,
    short_description: input.short_description || null,
    long_description: input.long_description || null,
    material: input.material || null,
    stone: input.stone || null,
    weight_grams: input.weight_grams ?? null,
    category_id: input.category_id || null,
    tags: input.tags ?? [],
    seo_title: input.seo_title || null,
    seo_description: input.seo_description || null,
    status: input.status,
    is_featured: input.is_featured,
    hidden_online: input.hidden_online ?? false,
    track_inventory: input.track_inventory ?? true,
  };

  // ── Producto ───────────────────────────────────────────────
  let productId = input.id;
  if (productId) {
    const { error } = await db.from("products").update(productRow).eq("id", productId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await db
      .from("products")
      .insert({ ...productRow, created_by: staff.id })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    productId = (data as { id: string }).id;
  }

  // ── Almacenes (para crear stock 0 de variantes nuevas) ─────
  const { data: locs } = await db.from("inventory_locations").select("id");
  const locationIds = ((locs as { id: string }[]) ?? []).map((l) => l.id);

  // ── Variantes ──────────────────────────────────────────────
  for (const v of input.variants) {
    const vrow = {
      product_id: productId,
      sku: v.sku.trim(),
      price_cents: toCents(v.price),
      compare_at_cents: v.compareAt ? toCents(v.compareAt) : null,
      attributes: v.attributes ?? {},
    };
    if (v.id) {
      const { error } = await db.from("product_variants").update(vrow).eq("id", v.id);
      if (error) return { ok: false, error: `Variante ${v.sku}: ${error.message}` };
    } else {
      const { data, error } = await db
        .from("product_variants")
        .insert(vrow)
        .select("id")
        .single();
      if (error) return { ok: false, error: `Variante ${v.sku}: ${error.message}` };
      // Stock inicial 0 en cada almacén.
      const variantId = (data as { id: string }).id;
      if (locationIds.length) {
        await db.from("stock_levels").upsert(
          locationIds.map((location_id) => ({
            variant_id: variantId,
            location_id,
            quantity: 0,
          })),
          { onConflict: "variant_id,location_id", ignoreDuplicates: true },
        );
      }
    }
  }

  // Variantes eliminadas → desactivar (no borrar, pueden estar en órdenes).
  for (const id of input.removedVariantIds ?? []) {
    await db.from("product_variants")
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq("id", id);
  }

  // ── Imágenes ───────────────────────────────────────────────
  for (const img of input.images) {
    if (img.id) {
      await db.from("product_images").update({ position: img.position }).eq("id", img.id);
    } else {
      await db.from("product_images").insert({
        product_id: productId,
        storage_path: img.storage_path,
        position: img.position,
      });
    }
  }

  revalidatePath("/admin/productos");
  revalidatePath(`/admin/productos/${productId}`);
  return { ok: true, id: productId };
}

// Eliminar producto (soft delete): lo oculta del catálogo y desactiva variantes.
export async function deleteProduct(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireStaff();
  const db = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await db.from("products").update({ deleted_at: now, status: "archived" }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await db.from("product_variants").update({ is_active: false, deleted_at: now }).eq("product_id", id);
  revalidatePath("/admin/productos");
  return { ok: true };
}

// Suspender / reactivar rápido (cambia el estado sin abrir el formulario).
export async function setProductStatus(
  id: string,
  status: "active" | "archived" | "draft",
): Promise<{ ok: boolean; error?: string }> {
  await requireStaff();
  const db = createAdminClient();
  const { error } = await db.from("products").update({ status }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/productos");
  return { ok: true };
}

export async function deleteProductImage(
  imageId: string,
  storagePath: string,
): Promise<{ ok: boolean }> {
  await requireStaff();
  const db = createAdminClient();
  await db.from("product_images").delete().eq("id", imageId);
  await db.storage.from("product-images").remove([storagePath]);
  return { ok: true };
}
