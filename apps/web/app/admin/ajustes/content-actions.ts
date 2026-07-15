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
