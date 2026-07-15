// Subida de imágenes al bucket público `brand` desde el cliente (admin).
// Mismo patrón que product-form.tsx: valida tipo, nombre único, sin sobrescribir.
import { createClient } from "@/lib/supabase/client";

const BUCKET = "brand";

// Sube un archivo a brand/<folder>/<uuid>.<ext> y devuelve el storage path.
export async function uploadImage(folder: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("El archivo no es una imagen");
  const supabase = createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

// Borra imágenes del bucket brand por su storage path.
export async function removeImages(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const supabase = createClient();
  await supabase.storage.from(BUCKET).remove(paths);
}
