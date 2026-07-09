"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugify } from "@/lib/slug";

type Res = { ok: boolean; error?: string };

// ── Categorías ───────────────────────────────────────────────────────────────
export async function createCategory(input: { name: string; parentId?: string | null }): Promise<Res> {
  await requireStaff();
  const db = createAdminClient();
  if (!input.name.trim()) return { ok: false, error: "El nombre es obligatorio" };
  const { error } = await db.from("categories").insert({
    name: input.name.trim(), slug: slugify(input.name), parent_id: input.parentId || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/productos");
  return { ok: true };
}

export async function updateCategory(input: { id: string; name: string; parentId?: string | null; hiddenOnline?: boolean }): Promise<Res> {
  await requireStaff();
  const db = createAdminClient();
  if (!input.name.trim()) return { ok: false, error: "El nombre es obligatorio" };
  const patch: Record<string, unknown> = { name: input.name.trim(), slug: slugify(input.name), parent_id: input.parentId || null };
  if (input.hiddenOnline !== undefined) patch.hidden_online = input.hiddenOnline;
  const { error } = await db.from("categories").update(patch).eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/productos");
  revalidatePath("/tienda");
  return { ok: true };
}

export async function deleteCategory(id: string): Promise<Res> {
  await requireStaff();
  const db = createAdminClient();
  // Soft delete + desvincula productos de esta categoría.
  await db.from("products").update({ category_id: null }).eq("category_id", id);
  const { error } = await db.from("categories").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/productos");
  return { ok: true };
}
