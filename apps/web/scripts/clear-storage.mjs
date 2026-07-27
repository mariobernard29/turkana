// Vacía los buckets de Storage. Complementa a `supabase/reset_datos.sql`, que
// no puede borrar archivos: Supabase bloquea el DELETE directo sobre
// storage.objects con el trigger storage.protect_delete().
//
// Uso (desde apps/web):
//   node scripts/clear-storage.mjs                 → lista qué borraría (no borra)
//   node scripts/clear-storage.mjs --si             → borra de verdad
//   node scripts/clear-storage.mjs --si product-images collections
//
// Sin lista de buckets usa los cuatro del proyecto.

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
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en apps/web/.env.local");
  process.exit(1);
}

const args = process.argv.slice(2);
const confirmed = args.includes("--si");
const buckets = args.filter((a) => !a.startsWith("--"));
const targets = buckets.length ? buckets : ["product-images", "collections", "brand", "tickets"];

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

// Recorre carpetas: list() sólo devuelve un nivel y las carpetas no traen id.
async function listAll(bucket, prefix = "") {
  const found = [];
  const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw new Error(`${bucket}${prefix ? "/" + prefix : ""}: ${error.message}`);
  for (const item of data ?? []) {
    const full = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id) found.push(full);
    else found.push(...(await listAll(bucket, full)));
  }
  return found;
}

let total = 0;
for (const bucket of targets) {
  let files;
  try {
    files = await listAll(bucket);
  } catch (e) {
    console.error(`✗ ${bucket}: ${e.message}`);
    continue;
  }

  if (!files.length) {
    console.log(`· ${bucket}: vacío`);
    continue;
  }
  total += files.length;

  if (!confirmed) {
    console.log(`· ${bucket}: ${files.length} archivo(s)`);
    for (const f of files.slice(0, 5)) console.log(`    ${f}`);
    if (files.length > 5) console.log(`    … y ${files.length - 5} más`);
    continue;
  }

  // remove() acepta lotes; se parte para no mandar peticiones enormes.
  let removed = 0;
  for (let i = 0; i < files.length; i += 100) {
    const batch = files.slice(i, i + 100);
    const { error } = await db.storage.from(bucket).remove(batch);
    if (error) { console.error(`✗ ${bucket}: ${error.message}`); break; }
    removed += batch.length;
  }
  console.log(`✓ ${bucket}: ${removed} archivo(s) borrados`);
}

if (!confirmed) {
  console.log(`\n${total} archivo(s) en total. Nada se borró.`);
  console.log("Para borrar de verdad: node scripts/clear-storage.mjs --si");
}
