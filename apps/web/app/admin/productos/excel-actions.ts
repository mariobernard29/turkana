"use server";

// Alta masiva del catálogo por Excel. El archivo que se descarga es el mismo que
// acepta al importar: se descarga, se llenan filas y se vuelve a subir.
// Una fila = una TALLA, con su propio código, precio y piezas en tienda; las
// filas que comparten slug (o nombre) son el mismo producto.
import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugify } from "@/lib/slug";
import { MAIN_LOCATION_KEY } from "@/lib/inventory";
import {
  PRODUCT_COLUMNS, PRODUCT_LEVEL_KEYS, CREATE_DEFAULTS, EXAMPLE_ROWS,
  clean, columnForHeader, norm, parseCount, parseNumber, splitList,
  type ProductExcelRow,
} from "@/lib/products-excel";

const ADMIN_ROLES = ["super_admin", "admin", "gerente", "inventarios"];

const HEADER_BG = "FFF3EFE7";
const NOTE_BG = "FFFBF8F3";

// Hay un solo almacén: lo que carga el Excel queda disponible igual en el
// mostrador que en la tienda en línea.
const IMPORT_LOCATION = MAIN_LOCATION_KEY;

async function requireCatalogStaff() {
  const staff = await requireStaff();
  if (!ADMIN_ROLES.includes(staff.role ?? "")) return { error: "Sin permisos para el catálogo" as const, staff: null };
  return { error: null, staff };
}

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

// Sin traducir, un choque llega como "duplicate key value violates unique
// constraint ..." y no dice qué hacer. Puede ser por el código de la talla o por
// la liga del producto, que son problemas distintos.
function skuError(sku: string, error: { code?: string; message?: string; details?: string }): string {
  const texto = `${error.message ?? ""} ${error.details ?? ""}`;
  if (error.code === "23505") {
    if (/slug/i.test(texto)) return "ya hay otra pieza con esa liga (slug); ponle un slug distinto en el Excel";
    return `el código ${sku} ya lo tiene otra pieza del catálogo`;
  }
  return error.message ?? "error";
}

// ── Exportar ─────────────────────────────────────────────────────────────────
export async function exportProductsExcel(): Promise<{ ok: boolean; error?: string; fileBase64?: string; fileName?: string }> {
  const { error: permError } = await requireCatalogStaff();
  if (permError) return { ok: false, error: permError };
  const db = createAdminClient();

  const { data: loc } = await db.from("inventory_locations").select("id").eq("key", IMPORT_LOCATION).maybeSingle();
  const tiendaId = (loc as { id: string } | null)?.id ?? null;

  const { data: prods } = await db.from("products")
    .select("name, slug, sku, short_description, long_description, tags, seo_title, seo_description, categories(name), product_variants(sku, price_cents, attributes, position, deleted_at, stock_levels(quantity, location_id))")
    .is("deleted_at", null)
    .order("name");

  type Variant = {
    sku: string; price_cents: number; attributes: Record<string, string> | null;
    position: number | null; deleted_at: string | null;
    stock_levels: { quantity: number; location_id: string }[] | null;
  };
  type Row = {
    name: string; slug: string; sku: string | null;
    short_description: string | null; long_description: string | null;
    tags: string[] | null; seo_title: string | null; seo_description: string | null;
    categories: { name: string } | { name: string }[] | null;
    product_variants: Variant[] | null;
  };

  const rows: ProductExcelRow[] = [];
  for (const p of (prods as unknown as Row[]) ?? []) {
    const variants = (p.product_variants ?? [])
      .filter((v) => !v.deleted_at)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    // Una fila por talla. Lo que describe la pieza (descripciones, categoría,
    // etiquetas, SEO) va sólo en la primera: el importador lo toma de ahí.
    variants.forEach((v, i) => {
      const stock = (v.stock_levels ?? []).find((s) => s.location_id === tiendaId);
      rows.push({
        nombre: p.name,
        slug: p.slug,
        talla: v.attributes?.talla ?? "",
        sku: v.sku ?? "",
        precio: v.price_cents / 100,
        inventario: stock?.quantity ?? 0,
        descripcionCorta: i === 0 ? p.short_description ?? "" : "",
        descripcionLarga: i === 0 ? p.long_description ?? "" : "",
        categoria: i === 0 ? one(p.categories)?.name ?? "" : "",
        etiquetas: i === 0 ? (p.tags ?? []).join(", ") : "",
        seoTitulo: i === 0 ? p.seo_title ?? "" : "",
        seoDescripcion: i === 0 ? p.seo_description ?? "" : "",
      });
    });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Turkana Jewelry";
  wb.created = new Date();
  const ws = wb.addWorksheet("Productos", { views: [{ state: "frozen", ySplit: 2 }] });
  ws.columns = PRODUCT_COLUMNS.map((c) => ({ key: c.key, width: c.width }));

  // Fila 1: encabezados. Fila 2: ayuda (el importador salta ambas).
  const header = ws.addRow(PRODUCT_COLUMNS.map((c) => c.header));
  header.font = { bold: true };
  header.alignment = { vertical: "middle" };
  header.height = 22;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    cell.border = { bottom: { style: "thin" } };
  });

  const notes = ws.addRow(PRODUCT_COLUMNS.map((c) => c.note ?? ""));
  notes.font = { size: 9, italic: true, color: { argb: "FF8A6D3B" } };
  notes.alignment = { wrapText: true, vertical: "top" };
  notes.height = 34;
  notes.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NOTE_BG } };
  });

  // Con el catálogo vacío se dejan las filas de ejemplo para ver cómo se llena.
  const body = rows.length ? rows : EXAMPLE_ROWS;
  for (const r of body) {
    ws.addRow(PRODUCT_COLUMNS.map((c) => r[c.key] ?? ""));
  }

  // Formato de moneda en el precio y autofiltro sobre los encabezados.
  const precioIdx = PRODUCT_COLUMNS.findIndex((c) => c.key === "precio") + 1;
  ws.getColumn(precioIdx).numFmt = '"$"#,##0.00';
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: PRODUCT_COLUMNS.length } };

  const buffer = await wb.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  return {
    ok: true,
    fileBase64: Buffer.from(buffer).toString("base64"),
    fileName: `productos-turkana-${stamp}.xlsx`,
  };
}


// ── Importar ─────────────────────────────────────────────────────────────────
// Va en dos pasos: el servidor lee el archivo una vez y devuelve los productos
// ya agrupados; el navegador los manda de regreso en tandas. Antes era una sola
// llamada que recorría todo el Excel, y con 1 196 filas la mataba el límite de
// tiempo de la función a los cinco minutos, a media carga y sin avisar.

export type ImportSummary = {
  creados: number;
  actualizados: number;
  sinCambios: number;
  variantesNuevas: number;
  piezasCargadas: number;      // tallas a las que se les fijó el inventario
  categoriasCreadas: string[];
  avisos: string[];
};

// Un producto listo para importar: sus datos y una fila por talla.
export type ParsedProduct = {
  slug: string;                // identidad del grupo
  head: ProductExcelRow;       // lo que describe la pieza
  rows: ProductExcelRow[];     // una por talla
};

export type ParseResult = {
  ok: boolean;
  error?: string;
  productos: ParsedProduct[];
  filas: number;
  avisos: string[];
};

type DbVariant = {
  id: string; sku: string; price_cents: number;
  attributes: Record<string, string> | null; position: number | null; deleted_at: string | null;
};
type DbProduct = Record<string, unknown> & {
  id: string; slug: string;
  product_variants?: DbVariant[];
};

const emptySummary = (): ImportSummary => ({
  creados: 0, actualizados: 0, sinCambios: 0,
  variantesNuevas: 0, piezasCargadas: 0, categoriasCreadas: [], avisos: [],
});

const PRODUCT_SELECT =
  "id, name, sku, slug, short_description, long_description, category_id, tags, seo_title, seo_description, product_variants(id, sku, price_cents, attributes, position, deleted_at)";

// ── Paso 1: leer y agrupar ───────────────────────────────────────────────────
export async function parseProductsExcel(fileBase64: string): Promise<ParseResult> {
  const { error: permError } = await requireCatalogStaff();
  if (permError) return { ok: false, error: permError, productos: [], filas: 0, avisos: [] };

  const wb = new ExcelJS.Workbook();
  try {
    // exceljs empaqueta tipos de Node viejos y su `Buffer` no coincide con el del
    // proyecto; en runtime es el mismo objeto.
    type LoadArg = Parameters<typeof wb.xlsx.load>[0];
    await wb.xlsx.load(Buffer.from(fileBase64, "base64") as unknown as LoadArg);
  } catch {
    return { ok: false, error: "No se pudo leer el archivo: ¿es un .xlsx válido?", productos: [], filas: 0, avisos: [] };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { ok: false, error: "El archivo no tiene hojas", productos: [], filas: 0, avisos: [] };

  // Se ubican las columnas por su encabezado, así el orden puede cambiar.
  const headerRow = ws.getRow(1);
  const colByKey = new Map<string, number>();
  headerRow.eachCell((cell, col) => {
    const def = columnForHeader(clean(cell.value));
    if (def && !colByKey.has(def.key)) colByKey.set(def.key, col);
  });
  const falta = (msg: string): ParseResult => ({ ok: false, error: msg, productos: [], filas: 0, avisos: [] });
  if (!colByKey.has("nombre") || !colByKey.has("precio")) {
    return falta("Faltan columnas obligatorias (Nombre y Precio). Usa el archivo de Descargar plantilla.");
  }
  if (!colByKey.has("sku")) {
    return falta("Falta la columna Código (SKU): ahora cada talla lleva el suyo. Descarga la plantilla de nuevo.");
  }

  const avisos: string[] = [];
  const cellOf = (r: ExcelJS.Row, key: string) => {
    const col = colByKey.get(key);
    if (!col) return "";
    const v = r.getCell(col).value;
    // Celdas con fórmula o texto enriquecido.
    if (v && typeof v === "object") {
      if ("result" in v) return clean((v as { result: unknown }).result);
      if ("richText" in v) return clean((v as { richText: { text: string }[] }).richText.map((t) => t.text).join(""));
      if ("text" in v) return clean((v as { text: string }).text);
    }
    return clean(v);
  };

  // La fila 2 es la de ayuda de la plantilla; se reconoce por su primer texto.
  const nombreNote = PRODUCT_COLUMNS.find((c) => c.key === "nombre")?.note ?? "";
  const isNoteRow = (r: ExcelJS.Row) => !!nombreNote && cellOf(r, "nombre") === nombreNote;

  const parsed: { row: ProductExcelRow; excelRow: number }[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (rowNumber === 2 && isNoteRow(row)) return;
    const nombre = cellOf(row, "nombre");
    const sku = cellOf(row, "sku").toUpperCase();
    const precioRaw = cellOf(row, "precio");
    if (!nombre && !sku && !precioRaw) return; // fila vacía
    if (!nombre) { avisos.push(`Fila ${rowNumber}: sin nombre, se omite`); return; }
    if (!sku) { avisos.push(`Fila ${rowNumber} (${nombre}): sin código, se omite — cada talla necesita el suyo`); return; }

    const precio = parseNumber(precioRaw);
    if (precio === null || precio < 0) { avisos.push(`Fila ${rowNumber} (${nombre}): precio inválido, se omite`); return; }

    const inventario = parseCount(cellOf(row, "inventario"));
    if (inventario === undefined) {
      avisos.push(`Fila ${rowNumber} (${nombre}): inventario inválido, se deja el stock como está`);
    }

    parsed.push({
      excelRow: rowNumber,
      row: {
        nombre, sku, precio,
        inventario: inventario ?? null,
        talla: cellOf(row, "talla"),
        // Vacío a propósito: así se distingue "no lo llenaron" (se arma del
        // nombre al crear, y al actualizar no se toca la liga) de un slug puesto.
        slug: slugify(cellOf(row, "slug")),
        descripcionCorta: cellOf(row, "descripcionCorta"),
        descripcionLarga: cellOf(row, "descripcionLarga"),
        categoria: cellOf(row, "categoria"),
        etiquetas: cellOf(row, "etiquetas"),
        seoTitulo: cellOf(row, "seoTitulo"),
        seoDescripcion: cellOf(row, "seoDescripcion"),
      },
    });
  });

  if (!parsed.length) return { ok: false, error: "No se encontraron filas con datos", productos: [], filas: 0, avisos };

  // Un código no puede estar en dos filas: es lo que identifica a la talla.
  const seenSku = new Map<string, number>();
  for (const p of parsed) {
    const prev = seenSku.get(p.row.sku);
    if (prev) avisos.push(`Fila ${p.excelRow}: el código ${p.row.sku} ya está en la fila ${prev}, se usa el primero`);
    else seenSku.set(p.row.sku, p.excelRow);
  }

  // Agrupar por producto: mismo slug (o mismo nombre, si el slug va vacío).
  // El código ya no agrupa — ahora es de la talla.
  const slugOf = (r: ProductExcelRow) => r.slug || slugify(r.nombre) || "producto";
  const groups = new Map<string, ParsedProduct>();
  for (const p of parsed) {
    if (seenSku.get(p.row.sku) !== p.excelRow) continue; // código repetido: ya avisado
    const slug = slugOf(p.row);
    const g = groups.get(slug) ?? { slug, head: { ...p.row }, rows: [] };
    g.rows.push(p.row);
    groups.set(slug, g);
  }

  // Lo que describe la pieza se toma de la primera fila que lo traiga llena: en
  // la plantilla sólo va en la primera talla de cada producto.
  for (const g of groups.values()) {
    const head = g.head as unknown as Record<string, string>;
    for (const key of PRODUCT_LEVEL_KEYS) {
      if (head[key]) continue;
      const hit = g.rows.find((r) => (r as unknown as Record<string, string>)[key]);
      if (hit) head[key] = (hit as unknown as Record<string, string>)[key];
    }
  }

  return { ok: true, productos: [...groups.values()], filas: parsed.length, avisos };
}

// ── Paso 2: dar de alta una tanda ────────────────────────────────────────────
// Todo lo que se puede se consulta y se escribe en bloque: antes eran seis u
// ocho viajes a la base por fila y ahí se iba el tiempo.
export async function importProductsChunk(
  productos: ParsedProduct[],
): Promise<{ ok: boolean; error?: string } & ImportSummary> {
  const { error: permError, staff } = await requireCatalogStaff();
  if (permError || !staff) return { ok: false, error: permError ?? "Sin permisos", ...emptySummary() };
  if (!productos.length) return { ok: true, ...emptySummary() };

  const db = createAdminClient();
  const s = emptySummary();
  const avisos = s.avisos;

  const { data: loc } = await db
    .from("inventory_locations").select("id").eq("key", IMPORT_LOCATION).maybeSingle();
  const tiendaId = (loc as { id: string } | null)?.id ?? null;
  if (!tiendaId) avisos.push("No se encontró el almacén: no se cargó inventario");

  // ── Categorías: las que falten se crean ───────────────────────────────────
  const { data: cats } = await db.from("categories").select("id, name").is("deleted_at", null);
  const catByName = new Map(((cats as unknown as { id: string; name: string }[]) ?? []).map((c) => [norm(c.name), c.id]));

  // Una categoría borrada desde el admin sigue ocupando su slug —el índice único
  // no distingue borradas—, así que crearla otra vez choca. Revivirla es lo que
  // espera quien la vuelve a escribir en el Excel.
  const crearCategoria = async (name: string): Promise<string | null> => {
    const slug = slugify(name);
    const { data, error } = await db.from("categories").insert({ name, slug }).select("id").single();
    if (!error && data) { s.categoriasCreadas.push(name); return (data as { id: string }).id; }
    if (error?.code === "23505") {
      const { data: revivida } = await db.from("categories")
        .update({ name, deleted_at: null }).eq("slug", slug).select("id").single();
      if (revivida) { s.categoriasCreadas.push(name); return (revivida as { id: string }).id; }
    }
    avisos.push(`No se pudo crear la categoría "${name}" (${error?.message ?? "error"})`);
    return null;
  };

  const nuevasCats = [...new Set(
    productos.map((p) => p.head.categoria.trim()).filter((n) => n && !catByName.has(norm(n))),
  )];
  if (nuevasCats.length) {
    // En bloque cuando se puede; si una choca, el insert entero se cae y antes se
    // llevaba las demás por delante: los productos de toda la tanda quedaban sin
    // categoría. Por eso el reintento es una por una.
    const { data: creadas, error } = await db.from("categories")
      .insert(nuevasCats.map((name) => ({ name, slug: slugify(name) })))
      .select("id, name");
    if (!error) {
      for (const c of (creadas as unknown as { id: string; name: string }[]) ?? []) {
        catByName.set(norm(c.name), c.id);
        s.categoriasCreadas.push(c.name);
      }
    } else {
      for (const name of nuevasCats) {
        const id = await crearCategoria(name);
        if (id) catByName.set(norm(name), id);
      }
    }
  }

  // ── Lo que ya existe: dos consultas para toda la tanda ─────────────────────
  const slugs = productos.map((p) => p.slug);
  const skus = productos.flatMap((p) => p.rows.map((r) => r.sku));

  const { data: bySlug } = await db.from("products").select(PRODUCT_SELECT).is("deleted_at", null).in("slug", slugs);
  const existentes = new Map<string, DbProduct>();
  for (const p of (bySlug as unknown as DbProduct[]) ?? []) existentes.set(p.slug, p);

  // Una pieza pudo quedar con otro slug al crearse: se le busca por el código de
  // alguna de sus tallas.
  const faltantes = productos.filter((p) => !existentes.has(p.slug));
  if (faltantes.length) {
    const skusFaltantes = faltantes.flatMap((p) => p.rows.map((r) => r.sku));
    const { data: vs } = await db.from("product_variants")
      .select("sku, product_id").is("deleted_at", null).in("sku", skusFaltantes);
    const prodBySku = new Map(((vs as unknown as { sku: string; product_id: string }[]) ?? []).map((v) => [v.sku, v.product_id]));
    const ids = [...new Set([...prodBySku.values()])];
    if (ids.length) {
      const { data: extra } = await db.from("products").select(PRODUCT_SELECT).is("deleted_at", null).in("id", ids);
      const byId = new Map(((extra as unknown as DbProduct[]) ?? []).map((p) => [p.id, p]));
      for (const g of faltantes) {
        const hit = g.rows.map((r) => prodBySku.get(r.sku)).find(Boolean);
        const prod = hit ? byId.get(hit) : undefined;
        if (prod) existentes.set(g.slug, prod);
      }
    }
  }

  const productFieldsOf = (g: ParsedProduct) => ({
    name: g.head.nombre,
    // Código de referencia del producto: el de su primera talla.
    sku: g.rows[0].sku || null,
    short_description: g.head.descripcionCorta || null,
    long_description: g.head.descripcionLarga || null,
    category_id: catByName.get(norm(g.head.categoria)) ?? null,
    tags: splitList(g.head.etiquetas),
    seo_title: g.head.seoTitulo || null,
    seo_description: g.head.seoDescripcion || null,
  });

  // ── Altas de producto, en bloque ───────────────────────────────────────────
  const nuevos = productos.filter((g) => !existentes.has(g.slug));
  if (nuevos.length) {
    const { data: creados, error } = await db.from("products")
      .insert(nuevos.map((g) => ({
        ...productFieldsOf(g),
        ...CREATE_DEFAULTS,
        slug: g.slug,
        created_by: staff.id,
      })))
      .select("id, slug");
    if (error) {
      // Un choque de slug tumba el bloque entero, así que se reintenta uno por
      // uno para que sólo caiga el producto conflictivo y los demás pasen.
      for (const g of nuevos) {
        const { data: uno, error: e1 } = await db.from("products")
          .insert({ ...productFieldsOf(g), ...CREATE_DEFAULTS, slug: g.slug, created_by: staff.id })
          .select("id, slug").single();
        if (e1 || !uno) { avisos.push(`${g.head.nombre}: no se pudo crear (${e1 ? skuError(g.rows[0].sku, e1) : "error"})`); continue; }
        existentes.set(g.slug, { ...(uno as DbProduct), product_variants: [] });
        s.creados++;
      }
    } else {
      for (const p of (creados as unknown as { id: string; slug: string }[]) ?? []) {
        existentes.set(p.slug, { id: p.id, slug: p.slug, product_variants: [] } as DbProduct);
        s.creados++;
      }
    }
  }

  // ── Actualizaciones de producto: sólo lo que de verdad cambió ──────────────
  const tocados = new Set<string>();
  for (const g of productos) {
    const cur = existentes.get(g.slug);
    if (!cur || nuevos.includes(g)) { if (cur) tocados.add(g.slug); continue; }
    const campos = productFieldsOf(g);
    const diff: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(campos)) {
      const before = cur[k];
      const same = Array.isArray(v)
        ? JSON.stringify([...((before as string[]) ?? [])].sort()) === JSON.stringify([...v].sort())
        : (before ?? null) === (v ?? null);
      if (!same) diff[k] = v;
    }
    // La liga sólo cambia si escribieron un slug distinto a propósito.
    if (g.head.slug && g.head.slug !== cur.slug) diff.slug = g.head.slug;
    if (Object.keys(diff).length) {
      const { error } = await db.from("products").update(diff).eq("id", cur.id);
      if (error) { avisos.push(`${g.head.nombre}: no se pudo actualizar (${error.message})`); continue; }
      s.actualizados++;
      tocados.add(g.slug);
    }
  }

  // ── Tallas ────────────────────────────────────────────────────────────────
  // Se emparejan por código y, si es nueva, por el nombre de talla. Las que
  // están en la base y no en el Excel se dejan como están: una importación
  // nunca borra tallas.
  type NuevaTalla = { product_id: string; sku: string; price_cents: number; attributes: Record<string, string>; position: number };
  const porCrear: { row: ProductExcelRow; etiqueta: string; fila: NuevaTalla }[] = [];
  const variantePorSku = new Map<string, DbVariant>();
  const inventarioPorVariante = new Map<string, number>();

  for (const g of productos) {
    const cur = existentes.get(g.slug);
    if (!cur) continue;
    const dbVariants = (cur.product_variants ?? []).filter((v) => !v.deleted_at);

    for (const [i, row] of g.rows.entries()) {
      const talla = row.talla.trim();
      const etiqueta = `${g.head.nombre}${talla ? ` talla ${talla}` : ""}`;
      const priceCents = Math.round((row.precio ?? 0) * 100);
      const match = dbVariants.find((v) => v.sku === row.sku)
        ?? dbVariants.find((v) => (v.attributes?.talla ?? "") === talla);

      if (!match) {
        porCrear.push({
          row, etiqueta,
          fila: {
            product_id: cur.id, sku: row.sku, price_cents: priceCents,
            attributes: talla ? { talla } : {}, position: i,
          },
        });
        continue;
      }

      variantePorSku.set(row.sku, match);
      const vdiff: Record<string, unknown> = {};
      if (match.price_cents !== priceCents) vdiff.price_cents = priceCents;
      if (match.sku !== row.sku) vdiff.sku = row.sku;
      if ((match.attributes?.talla ?? "") !== talla) vdiff.attributes = talla ? { talla } : {};
      if (Object.keys(vdiff).length) {
        const { error } = await db.from("product_variants").update(vdiff).eq("id", match.id);
        if (error) { avisos.push(`${etiqueta}: no se pudo actualizar (${skuError(row.sku, error)})`); continue; }
        if (!tocados.has(g.slug)) { s.actualizados++; tocados.add(g.slug); }
      }
      if (row.inventario !== null) inventarioPorVariante.set(match.id, row.inventario);
    }
  }

  if (porCrear.length) {
    const { data: creadas, error } = await db.from("product_variants")
      .insert(porCrear.map((p) => p.fila)).select("id, sku");
    if (error) {
      for (const p of porCrear) {
        const { data: una, error: e1 } = await db.from("product_variants").insert(p.fila).select("id, sku").single();
        if (e1 || !una) { avisos.push(`${p.etiqueta}: no se pudo crear la talla (${e1 ? skuError(p.row.sku, e1) : "error"})`); continue; }
        s.variantesNuevas++;
        if (p.row.inventario !== null) inventarioPorVariante.set((una as { id: string }).id, p.row.inventario);
      }
    } else {
      const idBySku = new Map(((creadas as unknown as { id: string; sku: string }[]) ?? []).map((v) => [v.sku, v.id]));
      for (const p of porCrear) {
        const id = idBySku.get(p.row.sku);
        if (!id) continue;
        s.variantesNuevas++;
        if (p.row.inventario !== null) inventarioPorVariante.set(id, p.row.inventario);
      }
    }
  }

  // ── Inventario: cantidad absoluta, para que reimportar no duplique ─────────
  if (tiendaId && inventarioPorVariante.size) {
    const ids = [...inventarioPorVariante.keys()];
    const { data: niveles } = await db.from("stock_levels")
      .select("variant_id, quantity").eq("location_id", tiendaId).in("variant_id", ids);
    const actual = new Map(((niveles as unknown as { variant_id: string; quantity: number }[]) ?? [])
      .map((n) => [n.variant_id, n.quantity]));

    const cambian = ids.filter((id) => (actual.get(id) ?? 0) !== inventarioPorVariante.get(id) || !actual.has(id));
    if (cambian.length) {
      const { error } = await db.from("stock_levels").upsert(
        cambian.map((variant_id) => ({
          variant_id, location_id: tiendaId,
          quantity: inventarioPorVariante.get(variant_id)!,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "variant_id,location_id" },
      );
      if (error) {
        avisos.push(`No se pudo cargar el inventario de ${cambian.length} talla(s) (${error.message})`);
      } else {
        // El ajuste queda anotado en movimientos, igual que si se hiciera a mano.
        await db.from("inventory_movements").insert(cambian.map((variant_id) => ({
          variant_id, location_id: tiendaId, type: "ajuste",
          quantity: inventarioPorVariante.get(variant_id)! - (actual.get(variant_id) ?? 0),
          reference_type: "import", notes: "Alta masiva por Excel", created_by: staff.id,
        })));
        s.piezasCargadas += cambian.length;
        for (const g of productos) {
          if (g.rows.some((r) => { const v = variantePorSku.get(r.sku); return v && cambian.includes(v.id); })) tocados.add(g.slug);
        }
      }
    }
  }

  s.sinCambios = productos.length - s.creados - s.actualizados;
  if (s.sinCambios < 0) s.sinCambios = 0;
  return { ok: true, ...s };
}

// Se anota al terminar todas las tandas, no en cada una, para que el registro
// diga cuánto entró en la carga completa.
export async function logProductsImport(resumen: ImportSummary, filas: number): Promise<void> {
  const { error: permError, staff } = await requireCatalogStaff();
  if (permError || !staff) return;
  const db = createAdminClient();
  await db.from("audit_logs").insert({
    actor_id: staff.id, action: "products.import", entity_type: "products",
    after: {
      creados: resumen.creados, actualizados: resumen.actualizados,
      sinCambios: resumen.sinCambios, variantesNuevas: resumen.variantesNuevas,
      piezasCargadas: resumen.piezasCargadas, filas,
    },
  });
  revalidatePath("/admin/productos");
  revalidatePath("/admin/inventario");
}
