"use server";

// Alta masiva del catálogo por Excel. El archivo que se descarga es el mismo que
// acepta al importar: se descarga, se llenan filas y se vuelve a subir.
// Una fila = un producto; las tallas van en una sola celda separadas por coma.
import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugify } from "@/lib/slug";
import {
  PRODUCT_COLUMNS, CREATE_DEFAULTS, EXAMPLE_ROW,
  clean, columnForHeader, norm, parseNumber, splitList,
  type ProductExcelRow,
} from "@/lib/products-excel";

const ADMIN_ROLES = ["super_admin", "admin", "gerente", "inventarios"];

const HEADER_BG = "FFF3EFE7";
const NOTE_BG = "FFFBF8F3";

async function requireCatalogStaff() {
  const staff = await requireStaff();
  if (!ADMIN_ROLES.includes(staff.role ?? "")) return { error: "Sin permisos para el catálogo" as const, staff: null };
  return { error: null, staff };
}

// ── Exportar ─────────────────────────────────────────────────────────────────
export async function exportProductsExcel(): Promise<{ ok: boolean; error?: string; fileBase64?: string; fileName?: string }> {
  const { error: permError } = await requireCatalogStaff();
  if (permError) return { ok: false, error: permError };
  const db = createAdminClient();

  const { data: prods } = await db.from("products")
    .select("name, slug, sku, short_description, long_description, tags, seo_title, seo_description, categories(name), product_variants(price_cents, attributes, position, deleted_at)")
    .is("deleted_at", null)
    .order("name");

  type Row = {
    name: string; slug: string; sku: string | null;
    short_description: string | null; long_description: string | null;
    tags: string[] | null; seo_title: string | null; seo_description: string | null;
    categories: { name: string } | { name: string }[] | null;
    product_variants: { price_cents: number; attributes: Record<string, string> | null; position: number | null; deleted_at: string | null }[] | null;
  };
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

  const rows: ProductExcelRow[] = [];
  for (const p of (prods as unknown as Row[]) ?? []) {
    const variants = (p.product_variants ?? [])
      .filter((v) => !v.deleted_at)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    rows.push({
      nombre: p.name,
      slug: p.slug,
      sku: p.sku ?? "",
      descripcionCorta: p.short_description ?? "",
      descripcionLarga: p.long_description ?? "",
      categoria: one(p.categories)?.name ?? "",
      etiquetas: (p.tags ?? []).join(", "),
      // Las tallas del producto caben en una celda; el precio es el de la primera.
      tallas: variants.map((v) => v.attributes?.talla ?? "").filter(Boolean).join(", "),
      precio: variants.length ? variants[0].price_cents / 100 : null,
      seoTitulo: p.seo_title ?? "",
      seoDescripcion: p.seo_description ?? "",
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
  notes.height = 30;
  notes.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NOTE_BG } };
  });

  // Con el catálogo vacío se deja una fila de ejemplo para ver cómo se llena.
  const body = rows.length ? rows : [EXAMPLE_ROW];
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
  categoriasCreadas: string[];
  avisos: string[];
};

export async function importProductsExcel(fileBase64: string): Promise<ImportSummary> {
  const { error: permError, staff } = await requireCatalogStaff();
  const empty = { creados: 0, actualizados: 0, sinCambios: 0, variantesNuevas: 0, categoriasCreadas: [], avisos: [] };
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
    const precio = parseNumber(precioRaw);
    if (precio === null || precio < 0) { avisos.push(`Fila ${rowNumber} (${nombre}): precio inválido, se omite`); return; }

    parsed.push({
      excelRow: rowNumber,
      row: {
        nombre, sku, precio,
        // Vacío a propósito: así se distingue "no lo llenaron" (se arma del
        // nombre al crear, y al actualizar no se toca la liga) de un slug puesto.
        slug: slugify(cellOf(row, "slug")),
        descripcionCorta: cellOf(row, "descripcionCorta"),
        descripcionLarga: cellOf(row, "descripcionLarga"),
        categoria: cellOf(row, "categoria"),
        etiquetas: cellOf(row, "etiquetas"),
        tallas: cellOf(row, "tallas"),
        seoTitulo: cellOf(row, "seoTitulo"),
        seoDescripcion: cellOf(row, "seoDescripcion"),
      },
    });
  });

  if (!parsed.length) return { ok: false, error: "No se encontraron filas con datos", ...empty, avisos };

  // 2) Agrupar: mismo código (o mismo slug si no hay código) = un solo producto,
  // aunque venga en varias filas. Las tallas de esas filas se juntan.
  type Grouped = { key: string; rows: ProductExcelRow[] };
  const groups = new Map<string, Grouped>();
  const slugOf = (r: ProductExcelRow) => r.slug || slugify(r.nombre) || "producto";
  for (const p of parsed) {
    const key = p.row.sku || `slug:${slugOf(p.row)}`;
    const g = groups.get(key) ?? { key, rows: [] };
    g.rows.push(p.row);
    groups.set(key, g);
  }

  // 3) Catálogos auxiliares
  const { data: cats } = await db.from("categories").select("id, name").is("deleted_at", null);
  const catByName = new Map(((cats as unknown as { id: string; name: string }[]) ?? []).map((c) => [norm(c.name), c.id]));
  const categoriasCreadas: string[] = [];

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

  let creados = 0, actualizados = 0, sinCambios = 0, variantesNuevas = 0;

  for (const g of groups.values()) {
    const head = g.rows[0];
    const categoryId = await ensureCategory(head.categoria);
    const tags = splitList(head.etiquetas);
    // Todas las tallas de las filas del grupo, sin repetir.
    const tallas = splitList(g.rows.map((r) => r.tallas).join(","));

    const productFields = {
      name: head.nombre,
      sku: head.sku || null,
      short_description: head.descripcionCorta || null,
      long_description: head.descripcionLarga || null,
      category_id: categoryId,
      tags,
      seo_title: head.seoTitulo || null,
      seo_description: head.seoDescripcion || null,
    };

    // Se busca por código; sin código, por slug.
    const query = db.from("products")
      .select("id, name, sku, slug, short_description, long_description, category_id, tags, seo_title, seo_description, product_variants(id, price_cents, attributes, deleted_at)")
      .is("deleted_at", null);
    const { data: existing } = head.sku
      ? await query.eq("sku", head.sku).maybeSingle()
      : await query.eq("slug", slugOf(head)).maybeSingle();

    let productId: string;
    let touched = false;

    if (!existing) {
      // Alta: borrador, sin destacar, oculto en la web y con control de
      // inventario. Las piezas se cargan después en Inventario.
      const { data: created, error } = await db.from("products")
        .insert({
          ...productFields,
          ...CREATE_DEFAULTS,
          slug: await uniqueSlug(slugOf(head), null),
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

    // Variantes (tallas): se emparejan por talla; las que están en la BD y no en
    // el Excel se dejan como están (nunca se borran desde una importación).
    const dbVariants = (((existing as unknown as { product_variants?: { id: string; price_cents: number; attributes: Record<string, string> | null; deleted_at: string | null }[] })?.product_variants) ?? [])
      .filter((v) => !v.deleted_at);

    const priceCents = Math.round((head.precio ?? 0) * 100);
    // Sin tallas es una pieza única: una sola variante sin atributos.
    const variantSku = head.sku || slugOf(head).toUpperCase();
    const wanted = tallas.length ? tallas : [""];

    for (const [i, talla] of wanted.entries()) {
      const match = dbVariants.find((v) => (v.attributes?.talla ?? "") === talla);
      if (!match) {
        const { error } = await db.from("product_variants").insert({
          product_id: productId, sku: variantSku, price_cents: priceCents,
          attributes: talla ? { talla } : {}, position: i,
        });
        if (error) { avisos.push(`${head.nombre}${talla ? ` talla ${talla}` : ""}: no se pudo crear la variante (${error.message})`); continue; }
        if (existing) variantesNuevas++;
        touched = true;
      } else if (match.price_cents !== priceCents) {
        await db.from("product_variants").update({ price_cents: priceCents }).eq("id", match.id);
        if (!touched) actualizados++;
        touched = true;
      }
    }

    if (!touched) sinCambios++;
  }

  await db.from("audit_logs").insert({
    actor_id: staff.id, action: "products.import", entity_type: "products",
    after: { creados, actualizados, sinCambios, variantesNuevas, filas: parsed.length },
  });

  revalidatePath("/admin/productos");
  revalidatePath("/admin/inventario");
  return { ok: true, creados, actualizados, sinCambios, variantesNuevas, categoriasCreadas, avisos };
}
