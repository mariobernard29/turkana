"use server";

// Carga masiva del catálogo por Excel. El archivo que exporta es el mismo que
// acepta al importar: se descarga, se agregan filas y se vuelve a subir.
import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugify } from "@/lib/slug";
import {
  PRODUCT_COLUMNS, STATUS_FROM_LABEL, STATUS_TO_LABEL,
  clean, parseNumber, parseYesNo, yesNo,
  type ProductExcelRow,
} from "@/lib/products-excel";

type DB = ReturnType<typeof createAdminClient>;
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

  const [{ data: prods }, { data: loc }] = await Promise.all([
    db.from("products")
      .select("id, name, sku, short_description, long_description, material, stone, weight_grams, status, is_featured, hidden_online, track_inventory, tags, seo_title, seo_description, categories(name), collections(name), product_variants(id, sku, price_cents, compare_at_cents, barcode, attributes, deleted_at)")
      .is("deleted_at", null)
      .order("name"),
    db.from("inventory_locations").select("id").eq("key", "tienda").maybeSingle(),
  ]);

  const tiendaId = (loc as { id: string } | null)?.id ?? null;
  const stock = new Map<string, number>();
  if (tiendaId) {
    const { data: levels } = await db.from("stock_levels").select("variant_id, quantity").eq("location_id", tiendaId);
    for (const l of (levels as unknown as { variant_id: string; quantity: number }[]) ?? []) stock.set(l.variant_id, l.quantity);
  }

  type Row = {
    id: string; name: string; sku: string | null;
    short_description: string | null; long_description: string | null;
    material: string | null; stone: string | null; weight_grams: number | null;
    status: string; is_featured: boolean; hidden_online: boolean; track_inventory: boolean;
    tags: string[] | null; seo_title: string | null; seo_description: string | null;
    categories: { name: string } | { name: string }[] | null;
    collections: { name: string } | { name: string }[] | null;
    product_variants: { id: string; sku: string; price_cents: number; compare_at_cents: number | null; barcode: string | null; attributes: Record<string, string> | null; deleted_at: string | null }[] | null;
  };
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

  const rows: ProductExcelRow[] = [];
  for (const p of (prods as unknown as Row[]) ?? []) {
    const variants = (p.product_variants ?? []).filter((v) => !v.deleted_at);
    const base = {
      sku: p.sku ?? "",
      nombre: p.name,
      categoria: one(p.categories)?.name ?? "",
      descripcionCorta: p.short_description ?? "",
      descripcionLarga: p.long_description ?? "",
      material: p.material ?? "",
      piedra: p.stone ?? "",
      pesoGramos: p.weight_grams,
      estado: STATUS_TO_LABEL[p.status] ?? p.status,
      destacado: p.is_featured,
      ocultoEnLinea: p.hidden_online,
      manejaInventario: p.track_inventory,
      coleccion: one(p.collections)?.name ?? "",
      etiquetas: (p.tags ?? []).join(", "),
      seoTitulo: p.seo_title ?? "",
      seoDescripcion: p.seo_description ?? "",
    };
    if (!variants.length) {
      rows.push({ ...base, talla: "", precio: null, precioAntes: null, existencias: null, codigoBarras: "" });
      continue;
    }
    for (const v of variants) {
      rows.push({
        ...base,
        sku: base.sku || v.sku,
        talla: v.attributes?.talla ?? "",
        precio: v.price_cents / 100,
        precioAntes: v.compare_at_cents != null ? v.compare_at_cents / 100 : null,
        existencias: stock.get(v.id) ?? 0,
        codigoBarras: v.barcode ?? "",
      });
    }
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

  for (const r of rows) {
    ws.addRow(PRODUCT_COLUMNS.map((c) => {
      const v = r[c.key];
      return typeof v === "boolean" ? yesNo(v) : v ?? "";
    }));
  }

  // Formato de moneda en precios y autofiltro sobre los encabezados.
  for (const col of ["precio", "precioAntes"]) {
    const idx = PRODUCT_COLUMNS.findIndex((c) => c.key === col) + 1;
    ws.getColumn(idx).numFmt = '"$"#,##0.00';
  }
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

type Grouped = { sku: string; rows: ProductExcelRow[]; excelRows: number[] };

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
    const text = clean(cell.value).toLowerCase();
    const def = PRODUCT_COLUMNS.find((c) => c.header.toLowerCase() === text);
    if (def) colByKey.set(def.key, col);
  });
  if (!colByKey.has("sku") || !colByKey.has("nombre") || !colByKey.has("precio")) {
    return { ok: false, error: "Faltan columnas obligatorias (Código, Nombre, Precio). Usa el archivo de Exportar como plantilla.", ...empty };
  }

  const avisos: string[] = [];
  const parsed: { row: ProductExcelRow; excelRow: number }[] = [];
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

  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return; // encabezado + fila de ayuda
    const sku = cellOf(row, "sku").toUpperCase();
    const nombre = cellOf(row, "nombre");
    if (!sku && !nombre) return; // fila vacía
    if (!sku) { avisos.push(`Fila ${rowNumber}: sin código (SKU), se omite`); return; }
    if (!nombre) { avisos.push(`Fila ${rowNumber}: sin nombre, se omite`); return; }
    const precio = parseNumber(cellOf(row, "precio"));
    if (precio === null || precio < 0) { avisos.push(`Fila ${rowNumber} (${sku}): precio inválido, se omite`); return; }

    parsed.push({
      excelRow: rowNumber,
      row: {
        sku, nombre,
        categoria: cellOf(row, "categoria"),
        talla: cellOf(row, "talla"),
        precio,
        precioAntes: parseNumber(cellOf(row, "precioAntes")),
        existencias: parseNumber(cellOf(row, "existencias")),
        descripcionCorta: cellOf(row, "descripcionCorta"),
        descripcionLarga: cellOf(row, "descripcionLarga"),
        material: cellOf(row, "material"),
        piedra: cellOf(row, "piedra"),
        pesoGramos: parseNumber(cellOf(row, "pesoGramos")),
        estado: cellOf(row, "estado"),
        destacado: parseYesNo(cellOf(row, "destacado"), false),
        ocultoEnLinea: parseYesNo(cellOf(row, "ocultoEnLinea"), false),
        manejaInventario: parseYesNo(cellOf(row, "manejaInventario"), true),
        coleccion: cellOf(row, "coleccion"),
        etiquetas: cellOf(row, "etiquetas"),
        codigoBarras: cellOf(row, "codigoBarras"),
        seoTitulo: cellOf(row, "seoTitulo"),
        seoDescripcion: cellOf(row, "seoDescripcion"),
      },
    });
  });

  if (!parsed.length) return { ok: false, error: "No se encontraron filas con datos", ...empty, avisos };

  // 2) Agrupar por SKU (las tallas del mismo producto van en filas separadas)
  const groups = new Map<string, Grouped>();
  for (const p of parsed) {
    const g = groups.get(p.row.sku) ?? { sku: p.row.sku, rows: [], excelRows: [] };
    g.rows.push(p.row);
    g.excelRows.push(p.excelRow);
    groups.set(p.row.sku, g);
  }

  // 3) Catálogos auxiliares
  const [{ data: cats }, { data: cols }, { data: loc }] = await Promise.all([
    db.from("categories").select("id, name").is("deleted_at", null),
    db.from("collections").select("id, name").is("deleted_at", null),
    db.from("inventory_locations").select("id").eq("key", "tienda").maybeSingle(),
  ]);
  const norm = (s: string) => s.trim().toLowerCase();
  const catByName = new Map(((cats as unknown as { id: string; name: string }[]) ?? []).map((c) => [norm(c.name), c.id]));
  const colByName = new Map(((cols as unknown as { id: string; name: string }[]) ?? []).map((c) => [norm(c.name), c.id]));
  const tiendaId = (loc as { id: string } | null)?.id ?? null;
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
  const uniqueSlug = async (name: string): Promise<string> => {
    const base = slugify(name) || "producto";
    for (let i = 0; i < 50; i++) {
      const candidate = i === 0 ? base : `${base}-${i + 1}`;
      const { data } = await db.from("products").select("id").eq("slug", candidate).maybeSingle();
      if (!data) return candidate;
    }
    return `${base}-${Date.now()}`;
  };

  let creados = 0, actualizados = 0, sinCambios = 0, variantesNuevas = 0;

  for (const g of groups.values()) {
    const head = g.rows[0];
    const categoryId = await ensureCategory(head.categoria);
    let collectionId: string | null = null;
    if (head.coleccion) {
      collectionId = colByName.get(norm(head.coleccion)) ?? null;
      if (!collectionId) avisos.push(`${g.sku}: la colección "${head.coleccion}" no existe, se dejó sin colección`);
    }

    const tags = head.etiquetas ? head.etiquetas.split(",").map((t) => t.trim()).filter(Boolean) : [];
    const productFields = {
      name: head.nombre,
      sku: g.sku,
      short_description: head.descripcionCorta || null,
      long_description: head.descripcionLarga || null,
      material: head.material || null,
      stone: head.piedra || null,
      weight_grams: head.pesoGramos,
      category_id: categoryId,
      collection_id: collectionId,
      tags,
      seo_title: head.seoTitulo || null,
      seo_description: head.seoDescripcion || null,
      status: STATUS_FROM_LABEL[norm(head.estado)] ?? "draft",
      is_featured: head.destacado,
      hidden_online: head.ocultoEnLinea,
      track_inventory: head.manejaInventario,
    };

    const { data: existing } = await db
      .from("products")
      .select("id, name, sku, short_description, long_description, material, stone, weight_grams, category_id, collection_id, tags, seo_title, seo_description, status, is_featured, hidden_online, track_inventory, product_variants(id, sku, price_cents, compare_at_cents, barcode, attributes, deleted_at)")
      .eq("sku", g.sku).is("deleted_at", null).maybeSingle();

    let productId: string;
    let touched = false;

    if (!existing) {
      const { data: created, error } = await db.from("products")
        .insert({ ...productFields, slug: await uniqueSlug(head.nombre), created_by: staff.id })
        .select("id").single();
      if (error || !created) { avisos.push(`${g.sku}: no se pudo crear (${error?.message ?? "error"})`); continue; }
      productId = (created as { id: string }).id;
      creados++;
      touched = true;
    } else {
      const cur = existing as unknown as Record<string, unknown> & { id: string };
      productId = cur.id;
      // Sólo se escriben los campos que de verdad cambiaron.
      const diff: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(productFields)) {
        const before = cur[k];
        const same = Array.isArray(v)
          ? JSON.stringify([...(before as string[] ?? [])].sort()) === JSON.stringify([...v].sort())
          : (before ?? null) === (v ?? null);
        if (!same) diff[k] = v;
      }
      if (Object.keys(diff).length) {
        const { error } = await db.from("products").update(diff).eq("id", productId);
        if (error) { avisos.push(`${g.sku}: no se pudo actualizar (${error.message})`); continue; }
        actualizados++;
        touched = true;
      }
    }

    // Variantes (tallas): se emparejan por talla; las que están en la BD y no en
    // el Excel se dejan como están (nunca se borran desde una importación).
    const dbVariants = (((existing as unknown as { product_variants?: { id: string; sku: string; price_cents: number; compare_at_cents: number | null; barcode: string | null; attributes: Record<string, string> | null; deleted_at: string | null }[] })?.product_variants) ?? [])
      .filter((v) => !v.deleted_at);

    for (const r of g.rows) {
      const talla = r.talla;
      const priceCents = Math.round((r.precio ?? 0) * 100);
      const compareCents = r.precioAntes != null ? Math.round(r.precioAntes * 100) : null;
      const match = dbVariants.find((v) => (v.attributes?.talla ?? "") === talla);

      let variantId: string;
      if (!match) {
        const { data: nv, error } = await db.from("product_variants").insert({
          product_id: productId, sku: g.sku, price_cents: priceCents,
          compare_at_cents: compareCents, barcode: r.codigoBarras || null,
          attributes: talla ? { talla } : {},
        }).select("id").single();
        if (error || !nv) { avisos.push(`${g.sku}${talla ? ` talla ${talla}` : ""}: no se pudo crear la variante (${error?.message ?? ""})`); continue; }
        variantId = (nv as { id: string }).id;
        if (existing) variantesNuevas++;
        touched = true;
      } else {
        variantId = match.id;
        const vDiff: Record<string, unknown> = {};
        if (match.price_cents !== priceCents) vDiff.price_cents = priceCents;
        if ((match.compare_at_cents ?? null) !== compareCents) vDiff.compare_at_cents = compareCents;
        if ((match.barcode ?? "") !== r.codigoBarras) vDiff.barcode = r.codigoBarras || null;
        if (Object.keys(vDiff).length) {
          await db.from("product_variants").update(vDiff).eq("id", variantId);
          if (!touched) actualizados++;
          touched = true;
        }
      }

      // Existencias: se aplica como ajuste, con su movimiento de inventario.
      if (tiendaId && r.existencias != null && productFields.track_inventory) {
        const target = Math.max(0, Math.round(r.existencias));
        const { data: level } = await db.from("stock_levels")
          .select("id, quantity").eq("variant_id", variantId).eq("location_id", tiendaId).maybeSingle();
        const current = (level as { id: string; quantity: number } | null)?.quantity ?? 0;
        if (!level) {
          await db.from("stock_levels").insert({ variant_id: variantId, location_id: tiendaId, quantity: target });
        } else if (current !== target) {
          await db.from("stock_levels")
            .update({ quantity: target, updated_at: new Date().toISOString() })
            .eq("id", (level as { id: string }).id);
        }
        if (current !== target) {
          await db.from("inventory_movements").insert({
            variant_id: variantId, location_id: tiendaId, type: "ajuste",
            quantity: target - current, reference_type: "manual",
            notes: "Importación de Excel", created_by: staff.id,
          });
          touched = true;
        }
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
