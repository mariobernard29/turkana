// Contenido editable de la home (hero + banners), guardado como JSON en app_settings.
// La home es pública y la RLS de app_settings es solo-staff → se lee con service role.
import { createAdminClient } from "@/lib/supabase/admin";
import { brandImageUrl } from "@/lib/utils";

export const HERO_KEY = "home_hero_images";
export const BANNER_KEY = "home_banner_slides";

// Imágenes por defecto si el admin aún no configuró el hero (archivos en public/).
export const HERO_FALLBACK = ["/hero1.jpg", "/hero2.jpg", "/hero3.jpg", "/hero4.jpg", "/hero5.jpg"];

export type BannerSlide = { path: string; link?: string | null };

async function readSetting(key: string): Promise<string | null> {
  try {
    const db = createAdminClient();
    const { data } = await db.from("app_settings").select("value").eq("key", key).maybeSingle();
    return (data as { value: string | null } | null)?.value ?? null;
  } catch {
    return null;
  }
}

// URLs listas para <Image> del carrusel principal. Cae a las imágenes de public/.
export async function getHeroImages(): Promise<string[]> {
  const raw = await readSetting(HERO_KEY);
  if (!raw) return HERO_FALLBACK;
  try {
    const paths = JSON.parse(raw) as string[];
    if (Array.isArray(paths) && paths.length) return paths.map(brandImageUrl);
  } catch {
    /* valor corrupto → fallback */
  }
  return HERO_FALLBACK;
}

// Slides del banner promocional con URL absoluta y link opcional. [] si no hay.
export async function getBannerSlides(): Promise<{ url: string; link: string | null }[]> {
  const raw = await readSetting(BANNER_KEY);
  if (!raw) return [];
  try {
    const slides = JSON.parse(raw) as BannerSlide[];
    if (Array.isArray(slides)) {
      return slides
        .filter((s) => s?.path)
        .map((s) => ({ url: brandImageUrl(s.path), link: s.link?.trim() || null }));
    }
  } catch {
    /* valor corrupto → sin banners */
  }
  return [];
}
