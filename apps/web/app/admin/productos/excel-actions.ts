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
import {
  PRODUCT_COLUMNS, PRODUCT_LEVEL_KEYS, CREATE_DEFAULTS, EXAMPLE_ROWS,
  clean, columnForHeader, norm, parseCount, parseNumber, splitList,
  type ProductExcelRow,
} from "@/lib/products-excel";

const ADMIN_ROLES = ["super_admin", "admin", "gerente", "inventarios"];

const HEADER_BG = "FFF3EFE7";
const NOTE_BG = "FFFBF8F3";

// El Excel sólo carga la tienda física; el e-commerce se surte a mano desde
// Inventario, para no mandar a la web piezas que están en el mostrador.
const IMPORT_LOCATION = "tienda";

async function requireCatalogStaff() {
  const staff = await requireStaff();
  if (!ADMIN_ROLES.includes(staff.role ?? "")) return { error: "Sin permisos para el catálogo" as const, staff: null };
  return { error: null, staff };
}

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

// El código es único entre tallas vivas: sin traducir, el choque llega como
// "duplicate key value violates unique constraint", que no dice qué hacer.
function skuError(sku: string, error: { code?: string; message: string }): string {
  if (error.code === "23505") return `el código ${sku} ya lo tiene otra pieza del catálogo`;
  return error.message;
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
export type ImportSummary = {
  ok: boolean;
  error?: string;
  creados: number;
  actualizados: number;
  sinCambios: number;
  variantesNuevas: number;
  piezasCargadas: number;      // variantes a las que se les fijó el stock de tienda
  categoriasCreadas: string[];
  avisos: string[];
};

type DbVariant = {
  id: string; sku: string; price_cents: number;
  attributes: Record<string, string> | null; position: number | null; deleted_at: string | null;
};

export async function importProductsExcel(fileBase64: string): Promise<ImportSummary> {
  const { error: permError, staff } = await requireCatalogStaff();
  const empty = { creados: 0, actualizados: 0, sinCambios: 0, variantesNuevas: 0, piezasCargadas: 0, categoriasCreadas: [], avisos: [] };
  if (permError || !staff) return { ok: false, error: permError ?? "Sin permisos", ...empty };
  const db = createAdminClient();

  // 1) Leer el archivo
  const wb = new ExcelJS.Workbook();
  try {
    // exceljs empaqueta tipos de Node viejos y su `Buffer` no coincide con el del
    // proyecto; en runtime es el mismo objeto.
    type LoadArg = Parameters<typeof wb.xlsx.load>[0];
    await wb.xlsx.load(Buffer.from(fileBase64, "base64") as unknown as LoadArg);
  } catch {
    return { ok: false, error: "No se pudo leer el archivo: ¿es un .xlsx válido?", ...empty };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { ok: false, error: "El archivo no tiene hojas", ...empty };

  // Se ubican las columnas por su encabezado, así el orden puede cambiar.
  const headerRow = ws.getRow(1);
  const colByKey = new Map<string, number>();
  headerRow.eachCell((cell, col) => {
    const def = columnForHeader(clean(cell.value));
    if (def && !colByKey.has(def.key)) colByKey.set(def.key, col);
  });
  if (!colByKey.has("nombre") || !colByKey.has("precio")) {
    return { ok: false, error: "Faltan columnas obligatorias (Nombre y Precio). Usa el archivo de Descargar plantilla.", ...empty };
  }
  if (!colByKey.has("sku")) {
    return { ok: false, error: "Falta la columna Código (SKU): ahora cada talla lleva el suyo. Descarga la plantilla de nuevo.", ...empty };
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

  if (!parsed.length) return { ok: false, error: "No se encontraron filas con datos", ...empty, avisos };

  // Un código no puede estar en dos filas: es lo que identifica a la talla.
  const seenSku = new Map<string, number>();
  for (const p of parsed) {
    const prev = seenSku.get(p.row.sku);
    if (prev) avisos.push(`Fila ${p.excelRow}: el código ${p.row.sku} ya está en la fila ${prev}, se usa el primero`);
    else seenSku.set(p.row.sku, p.excelRow);
  }

  // 2) Agrupar por producto: mismo slug (o mismo nombre, si el slug va vacío).
  // El código ya no agrupa — ahora es de la talla.
  const slugOf = (r: ProductExcelRow) => r.slug || slugify(r.nombre) || "producto";
  type Grouped = { key: string; rows: ProductExcelRow[]; firstRow: number };
  const groups = new Map<string, Grouped>();
  for (const p of parsed) {
    if (seenSku.get(p.row.sku) !== p.excelRow) continue; // código repetido: ya avisado
    const key = slugOf(p.row);
    const g = groups.get(key) ?? { key, rows: [], firstRow: p.excelRow };
    g.rows.push(p.row);
    groups.set(key, g);
  }

  // 3) Catálogos auxiliares
  const { data: cats } = await db.from("categories").select("id, name").is("deleted_at", null);
  const catByName = new Map(((cats as unknown as { id: string; name: string }[]) ?? []).map((c) => [norm(c.name), c.id]));
  const categoriasCreadas: string[] = [];

  const { data: loc } = await db.from("inventory_locations").select("id").eq("key", IMPORT_LOCATION).maybeSingle();
  const tiendaId = (loc as { id: string } | null)?.id ?? null;
  if (!tiendaId) avisos.push("No se encontró el almacén de tienda: no se cargó inventario");

  const ensureCategory = async (name: string): Promise<string | null> => {
    if (!name) return null;
    const hit = catByName.get(norm(name));
    if (hit) return hit;
    const { data, error } = await db.from("categories")
      .insert({ name: name.trim(), slug: slugify(name) }).select("id").single();
    if (error || !data) { avisos.push(`No se pudo crear la categoría "${name}": ${error?.message ?? ""}`); return null; }
    const id = (data as { id: string }).id;
    catByName.set(norm(name), id);
    categoriasCreadas.push(name.trim());
    return id;
  };

  // Slug único: el nombre puede repetirse entre productos distintos.
  const uniqueSlug = async (base: string, ownId: string | null): Promise<string> => {
    const root = base || "producto";
    for (let i = 0; i < 50; i++) {
      const candidate = i === 0 ? root : `${root}-${i + 1}`;
      const { data } = await db.from("products").select("id").eq("slug", candidate).maybeSingle();
      if (!data || (ownId && (data as { id: string }).id === ownId)) return candidate;
    }
    return `${root}-${Date.now()}`;
  };

  // Fija las piezas de tienda a la cantidad del Excel y deja el ajuste anotado en
  // movimientos. Es absoluto a propósito: reimportar el mismo archivo no duplica.
  const setStock = async (variantId: string, qty: number, etiqueta: string): Promise<boolean> => {
    if (!tiendaId) return false;
    const { data: level } = await db.from("stock_levels")
      .select("id, quantity").eq("variant_id", variantId).eq("location_id", tiendaId).maybeSingle();
    const current = (level as { id: string; quantity: number } | null)?.quantity ?? 0;
    if (level && current === qty) return false;

    if (level) {
      await db.from("stock_levels")
        .update({ quantity: qty, updated_at: new Date().toISOString() })
        .eq("id", (level as { id: string }).id);
    } else {
      const { error } = await db.from("stock_levels")
        .insert({ variant_id: variantId, location_id: tiendaId, quantity: qty });
      if (error) { avisos.push(`${etiqueta}: no se pudo cargar el inventario (${error.message})`); return false; }
    }
    await db.from("inventory_movements").insert({
      variant_id: variantId, location_id: tiendaId, type: "ajuste",
      quantity: qty - current, reference_type: "import",
      notes: "Alta masiva por Excel", created_by: staff.id,
    });
    return true;
  };

  let creados = 0, actualizados = 0, sinCambios = 0, variantesNuevas = 0, piezasCargadas = 0;

  for (const g of groups.values()) {
    // Lo que describe la pieza se toma de la primera fila que lo traiga llena:
    // en la plantilla sólo va en la primera talla de cada producto.
    const head = { ...g.rows[0] } as ProductExcelRow;
    for (const key of PRODUCT_LEVEL_KEYS) {
      if (head[key]) continue;
      const hit = g.rows.find((r) => r[key]);
      if (hit) (head[key] as string) = hit[key] as string;
    }

    const categoryId = await ensureCategory(head.categoria);
    const tags = splitList(head.etiquetas);

    const productFields = {
      name: head.nombre,
      // Código de referencia del producto: el de su primera talla.
      sku: g.rows[0].sku || null,
      short_description: head.descripcionCorta || null,
      long_description: head.descripcionLarga || null,
      category_id: categoryId,
      tags,
      seo_title: head.seoTitulo || null,
      seo_description: head.seoDescripcion || null,
    };

    // Se busca por slug; si no aparece, por el código de alguna de sus tallas
    // (el producto pudo quedar con otro slug al crearse).
    const select = "id, name, sku, slug, short_description, long_description, category_id, tags, seo_title, seo_description, product_variants(id, sku, price_cents, attributes, position, deleted_at)";
    let { data: existing } = await db.from("products").select(select).is("deleted_at", null).eq("slug", g.key).maybeSingle();
    if (!existing) {
      const { data: byVariant } = await db.from("product_variants")
        .select("product_id").in("sku", g.rows.map((r) => r.sku)).is("deleted_at", null).limit(1).maybeSingle();
      const pid = (byVariant as { product_id: string } | null)?.product_id;
      if (pid) {
        const { data } = await db.from("products").select(select).is("deleted_at", null).eq("id", pid).maybeSingle();
        existing = data;
      }
    }

    let productId: string;
    let touched = false;

    if (!existing) {
      // Alta: activo (cobrable en el POS desde ya), sin destacar, oculto en la
      // web y con control de inventario. Las piezas entran por la columna
      // Inventario.
      const { data: created, error } = await db.from("products")
        .insert({
          ...productFields,
          ...CREATE_DEFAULTS,
          slug: await uniqueSlug(g.key, null),
          created_by: staff.id,
        })
        .select("id").single();
      if (error || !created) { avisos.push(`${head.nombre}: no se pudo crear (${error?.message ?? "error"})`); continue; }
      productId = (created as { id: string }).id;
      creados++;
      touched = true;
    } else {
      const cur = existing as unknown as Record<string, unknown> & { id: string; slug: string };
      productId = cur.id;
      // Sólo se escriben los campos que de verdad cambiaron. El estado, el
      // destacado, la visibilidad y el inventario se respetan como estén.
      const diff: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(productFields)) {
        const before = cur[k];
        const same = Array.isArray(v)
          ? JSON.stringify([...(before as string[] ?? [])].sort()) === JSON.stringify([...v].sort())
          : (before ?? null) === (v ?? null);
        if (!same) diff[k] = v;
      }
      // La liga sólo cambia si escribieron un slug distinto a propósito.
      if (head.slug && head.slug !== cur.slug) diff.slug = await uniqueSlug(head.slug, productId);
      if (Object.keys(diff).length) {
        const { error } = await db.from("products").update(diff).eq("id", productId);
        if (error) { avisos.push(`${head.nombre}: no se pudo actualizar (${error.message})`); continue; }
        actualizados++;
        touched = true;
      }
    }

    // Tallas: se emparejan por talla; las que están en la BD y no en el Excel se
    // dejan como están (una importación nunca borra tallas).
    const dbVariants = (((existing as unknown as { product_variants?: DbVariant[] })?.product_variants) ?? [])
      .filter((v) => !v.deleted_at);

    for (const [i, row] of g.rows.entries()) {
      const talla = row.talla.trim();
      const etiqueta = `${head.nombre}${talla ? ` talla ${talla}` : ""}`;
      const priceCents = Math.round((row.precio ?? 0) * 100);
      // Se reconoce la talla por su código; si es nueva, por el nombre de talla.
      const match = dbVariants.find((v) => v.sku === row.sku)
        ?? dbVariants.find((v) => (v.attributes?.talla ?? "") === talla);

      let variantId: string;
      if (!match) {
        const { data, error } = await db.from("product_variants").insert({
          product_id: productId, sku: row.sku, price_cents: priceCents,
          attributes: talla ? { talla } : {}, position: i,
        }).select("id").single();
        if (error || !data) { avisos.push(`${etiqueta}: no se pudo crear la talla (${error ? skuError(row.sku, error) : "error"})`); continue; }
        variantId = (data as { id: string }).id;
        if (existing) variantesNuevas++;
        touched = true;
      } else {
        variantId = match.id;
        const vdiff: Record<string, unknown> = {};
        if (match.price_cents !== priceCents) vdiff.price_cents = priceCents;
        if (match.sku !== row.sku) vdiff.sku = row.sku;
        if ((match.attributes?.talla ?? "") !== talla) vdiff.attributes = talla ? { talla } : {};
        if (Object.keys(vdiff).length) {
          const { error } = await db.from("product_variants").update(vdiff).eq("id", match.id);
          if (error) { avisos.push(`${etiqueta}: no se pudo actualizar (${skuError(row.sku, error)})`); continue; }
          if (!touched) actualizados++;
          touched = true;
        }
      }

      // Inventario de tienda: cantidad absoluta, celda vacía no toca nada.
      if (row.inventario !== null && await setStock(variantId, row.inventario, etiqueta)) {
        piezasCargadas++;
        touched = true;
      }
    }

    if (!touched) sinCambios++;
  }

  await db.from("audit_logs").insert({
    actor_id: staff.id, action: "products.import", entity_type: "products",
    after: { creados, actualizados, sinCambios, variantesNuevas, piezasCargadas, filas: parsed.length },
  });

  revalidatePath("/admin/productos");
  revalidatePath("/admin/inventario");
  return { ok: true, creados, actualizados, sinCambios, variantesNuevas, piezasCargadas, categoriasCreadas, avisos };
}
