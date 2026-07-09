// Convierte un texto a slug URL-safe (sin acentos, minúsculas, guiones).
export function slugify(input: string): string {
  return input
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
