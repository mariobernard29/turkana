"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { HERO_KEY, BANNER_KEY, type BannerSlide } from "@/lib/site-content";

async function adminGuard(): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await requireStaff();
  if (!["super_admin", "admin"].includes(staff.role ?? "")) return { ok: false, error: "Solo administradores pueden editar el contenido" };
  return { ok: true };
}

// Devuelve los paths crudos para la UI del admin (no las URLs absolutas).
export async function getHomeContent(): Promise<{ heroPaths: string[]; bannerSlides: BannerSlide[] }> {
  await requireStaff();
  const db = createAdminClient();
  const { data } = await db.from("app_settings").select("key, value").in("key", [HERO_KEY, BANNER_KEY]);
  const map = new Map(((data as unknown as { key: string; value: string }[]) ?? []).map((r) => [r.key, r.value]));
  const parse = <T,>(raw: string | undefined, fallback: T): T => {
    if (!raw) return fallback;
    try { return JSON.parse(raw) as T; } catch { return fallback; }
  };
  return {
    heroPaths: parse<string[]>(map.get(HERO_KEY), []),
    bannerSlides: parse<BannerSlide[]>(map.get(BANNER_KEY), []),
  };
}

export async function updateHeroImages(paths: string[]): Promise<{ ok: boolean; error?: string }> {
  const g = await adminGuard();
  if (!g.ok) return g;
  const clean = (paths ?? []).filter((p) => typeof p === "string" && p.trim());
  const db = createAdminClient();
  const { error } = await db.from("app_settings").upsert(
    { key: HERO_KEY, value: JSON.stringify(clean), description: "Imágenes del carrusel principal (bucket brand)" },
    { onConflict: "key" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  revalidatePath("/admin/ajustes/contenido");
  return { ok: true };
}

export type CollectionContent = {
  id: string;
  slug: string;
  name: string;
  home_title: string | null;
  home_subtitle: string | null;
  home_image_url: string | null;
  hero_image_url: string | null;
};

// Colección destacada de la home (por ahora solo administramos la primera colección activa).
export async function getFeaturedCollectionContent(): Promise<CollectionContent | null> {
  await requireStaff();
  const db = createAdminClient();
  const { data } = await db
    .from("collections")
    .select("id, slug, name, home_title, home_subtitle, home_image_url, hero_image_url")
    .is("deleted_at", null)
    .order("position")
    .limit(1)
    .maybeSingle();
  return (data as unknown as CollectionContent | null) ?? null;
}

export async function updateFeaturedCollectionContent(input: {
  id: string;
  name: string;
  home_title: string;
  home_subtitle: string;
  home_image_url: string | null;
  hero_image_url: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const g = await adminGuard();
  if (!g.ok) return g;
  if (!input.name?.trim()) return { ok: false, error: "El nombre es obligatorio" };
  const db = createAdminClient();
  const { data: current } = await db.from("collections").select("slug").eq("id", input.id).maybeSingle();
  const { error } = await db
    .from("collections")
    .update({
      name: input.name.trim(),
      home_title: input.home_title.trim() || null,
      home_subtitle: input.home_subtitle.trim() || null,
      home_image_url: input.home_image_url || null,
      hero_image_url: input.hero_image_url || null,
    })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  revalidatePath("/admin/ajustes/contenido");
  const slug = (current as unknown as { slug: string } | null)?.slug;
  if (slug) revalidatePath(`/coleccion/${slug}`);
  return { ok: true };
}

export async function updateBannerSlides(slides: BannerSlide[]): Promise<{ ok: boolean; error?: string }> {
  const g = await adminGuard();
  if (!g.ok) return g;
  const clean = (slides ?? [])
    .filter((s) => s?.path && typeof s.path === "string")
    .map((s) => ({ path: s.path, link: s.link?.trim() || null }));
  const db = createAdminClient();
  const { error } = await db.from("app_settings").upsert(
    { key: BANNER_KEY, value: JSON.stringify(clean), description: "Banners promocionales de la home (bucket brand)" },
    { onConflict: "key" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  revalidatePath("/admin/ajustes/contenido");
  return { ok: true };
}
