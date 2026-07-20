// One-off seed script: crea (o completa) la colección "Cocktail Collection",
// sube las imágenes cook1/cook2 al bucket `brand` y asigna algunos productos
// al azar para poder ver la nueva sección en la home.
//
// Requiere que la migración 0020_collection_home_fields.sql ya se haya
// aplicado (agrega home_title/home_subtitle/home_image_url a `collections`).
//
// Uso: node scripts/seed-cocktail-collection.mjs   (desde apps/web)

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const raw = readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const SLUG = "cocktail-collection";
const RANDOM_PRODUCT_COUNT = 8;

async function uploadOnce(folder, localPath, fileName) {
  const path = `${folder}/${fileName}`;
  const { data: existing } = await db.storage.from("brand").list(folder, { search: fileName });
  if (existing?.some((f) => f.name === fileName)) {
    console.log(`  ya existe en storage: ${path} (se conserva)`);
    return path;
  }
  const bytes = readFileSync(localPath);
  const ext = fileName.split(".").pop().toLowerCase();
  const contentType = ext === "png" ? "image/png" : "image/jpeg";
  const { error } = await db.storage.from("brand").upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Error subiendo ${path}: ${error.message}`);
  console.log(`  subido: ${path}`);
  return path;
}

async function main() {
  console.log("1) Buscando/creando la colección…");
  const { data: existingCol, error: findErr } = await db
    .from("collections")
    .select("id, name, home_image_url, hero_image_url")
    .eq("slug", SLUG)
    .maybeSingle();
  if (findErr) {
    if (findErr.message.includes("home_title") || findErr.message.includes("column")) {
      console.error(
        "No se pudo leer `collections` con las columnas nuevas. ¿Ya aplicaste la migración " +
          "supabase/migrations/0020_collection_home_fields.sql en Supabase (SQL Editor o `supabase db push`)?",
      );
      console.error("Detalle:", findErr.message);
      process.exit(1);
    }
    throw findErr;
  }

  let collectionId = existingCol?.id;
  if (!collectionId) {
    const { data: inserted, error: insErr } = await db
      .from("collections")
      .insert({
        name: "Cocktail Collection",
        slug: SLUG,
        description: "Joyería que brinda con tu esencia",
        home_title: "Cocktail Collection",
        home_subtitle: "Joyería que brinda con tu esencia",
        is_active: true,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;
    collectionId = inserted.id;
    console.log(`  creada colección "${SLUG}" (${collectionId})`);
  } else {
    console.log(`  ya existía la colección "${SLUG}" (${collectionId})`);
  }

  console.log("2) Subiendo imágenes cook1.jpg / cook2.png…");
  const logosDir = path.join(__dirname, "..", "..", "..", "logos");
  const homeImagePath = await uploadOnce("collections", path.join(logosDir, "cook1.jpg"), "cocktail-home.jpg");
  const heroImagePath = await uploadOnce("collections", path.join(logosDir, "cook2.png"), "cocktail-hero.png");

  console.log("3) Guardando imágenes en la colección…");
  const { error: updErr } = await db
    .from("collections")
    .update({ home_image_url: homeImagePath, hero_image_url: heroImagePath })
    .eq("id", collectionId);
  if (updErr) throw updErr;

  console.log("4) Asignando productos al azar…");
  const { data: products, error: prodErr } = await db
    .from("products")
    .select("id, name")
    .eq("status", "active")
    .eq("hidden_online", false)
    .is("deleted_at", null)
    .is("collection_id", null);
  if (prodErr) throw prodErr;

  if (!products?.length) {
    console.log("  no hay productos activos sin colección disponibles.");
  } else {
    const shuffled = [...products].sort(() => Math.random() - 0.5);
    const pick = shuffled.slice(0, Math.min(RANDOM_PRODUCT_COUNT, shuffled.length));
    const { error: assignErr } = await db
      .from("products")
      .update({ collection_id: collectionId })
      .in("id", pick.map((p) => p.id));
    if (assignErr) throw assignErr;
    console.log(`  asignados ${pick.length} productos: ${pick.map((p) => p.name).join(", ")}`);
  }

  console.log("\nListo. Revisa la home y /coleccion/" + SLUG);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
