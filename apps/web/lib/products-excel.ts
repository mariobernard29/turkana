// Formato del Excel de productos: una fila por PRODUCTO.
// Las tallas van todas en una sola celda separadas por coma ("6, 7, 8" o
// "44cm, 55cm"); de cada una sale una variante con el mismo precio.
// Este archivo es la fuente única de las columnas: lo usan exportar e importar.
//
// La hoja sólo trae lo indispensable para dar de alta rápido. Lo demás
// (existencias, precio antes, material, fotos, estado…) se ajusta después en el
// admin. Al crear, los productos quedan con los valores de CREATE_DEFAULTS.

export type ProductExcelRow = {
  nombre: string;
  slug: string;
  sku: string;
  descripcionCorta: string;
  descripcionLarga: string;
  categoria: string;
  etiquetas: string;            // separadas por coma
  tallas: string;               // separadas por coma
  precio: number | null;        // pesos
  seoTitulo: string;
  seoDescripcion: string;
};

export type ColumnDef = {
  key: keyof ProductExcelRow;
  header: string;
  width: number;
  note?: string;
  // Otros encabezados que se aceptan al importar (además del oficial).
  aliases?: string[];
};

// El orden de esta lista es el orden de las columnas en el archivo.
export const PRODUCT_COLUMNS: ColumnDef[] = [
  { key: "nombre", header: "Nombre", width: 34, note: "Obligatorio." },
  { key: "slug", header: "Slug", width: 28, note: "Opcional: la liga en la web. Vacío = se arma del nombre." },
  { key: "sku", header: "Código (SKU)", width: 16, note: "Opcional. Si se repite, es el mismo producto.", aliases: ["código", "codigo", "sku", "código o sku", "codigo o sku"] },
  { key: "descripcionCorta", header: "Descripción corta", width: 40 },
  { key: "descripcionLarga", header: "Descripción larga", width: 60 },
  { key: "categoria", header: "Categoría", width: 20, note: "Si no existe, se crea." },
  { key: "etiquetas", header: "Etiquetas", width: 24, note: "Separadas por coma." },
  { key: "tallas", header: "Tallas", width: 24, note: "Separadas por coma: 6, 7, 8 o 44cm, 55cm. Vacío = pieza única." },
  { key: "precio", header: "Precio", width: 12, note: "Obligatorio. En pesos; aplica a todas las tallas." },
  { key: "seoTitulo", header: "SEO título", width: 30, aliases: ["titulo seo", "título seo"] },
  { key: "seoDescripcion", header: "SEO descripción", width: 40, aliases: ["descripcion seo", "descripción seo"] },
];

// Cómo quedan los productos dados de alta por Excel. Sólo se aplican al crear:
// si el producto ya existe, la importación no toca estos campos.
export const CREATE_DEFAULTS = {
  status: "draft" as const,   // borrador
  is_featured: false,
  hidden_online: true,        // no visible en la web hasta revisarlo
  track_inventory: true,      // las piezas se cargan en Inventario
};

// Fila de ejemplo de la plantilla, para que se vea cómo llenarla.
export const EXAMPLE_ROW: ProductExcelRow = {
  nombre: "Anillo Turkana",
  slug: "",
  sku: "TK-001",
  descripcionCorta: "Anillo de plata .925 con acabado mate",
  descripcionLarga: "Pieza hecha a mano en plata .925…",
  categoria: "Anillos",
  etiquetas: "plata, hecho a mano",
  tallas: "6, 7, 8",
  precio: 1890,
  seoTitulo: "Anillo Turkana de plata .925",
  seoDescripcion: "Anillo artesanal de plata .925 con acabado mate.",
};

// Normaliza para comparar encabezados y nombres: sin acentos, minúsculas.
export const norm = (s: string) =>
  s.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

// Busca la columna a la que corresponde un encabezado del archivo subido.
export function columnForHeader(header: string): ColumnDef | undefined {
  const h = norm(header);
  return PRODUCT_COLUMNS.find(
    (c) => norm(c.header) === h || (c.aliases ?? []).some((a) => norm(a) === h),
  );
}

// "6, 7, 8" → ["6", "7", "8"], sin repetidos ni vacíos.
export function splitList(value: string): string[] {
  const out: string[] = [];
  for (const part of value.split(/[,;\n]/)) {
    const t = part.trim();
    if (t && !out.some((o) => norm(o) === norm(t))) out.push(t);
  }
  return out;
}

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  // Tolera "$1,890.00" y "1.890,00" mal pegados desde otra hoja.
  const s = String(value).replace(/[^0-9.,-]/g, "").replace(/,(?=\d{3}\b)/g, "");
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export const clean = (value: unknown): string => String(value ?? "").trim();
