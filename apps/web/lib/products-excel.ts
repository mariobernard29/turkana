// Formato del Excel de productos: una fila por TALLA.
// Las filas que comparten Slug —o Nombre, si el slug va vacío— son el mismo
// producto. Cada talla lleva su propio código, su precio y sus piezas en tienda.
// Un producto que no maneja tallas es una sola fila con la Talla vacía.
// Este archivo es la fuente única de las columnas: lo usan exportar e importar.
//
// La hoja sólo trae lo indispensable para dar de alta rápido. Lo demás
// (precio antes, material, fotos, estado…) se ajusta después en el admin. Al
// crear, los productos quedan con los valores de CREATE_DEFAULTS.

export type ProductExcelRow = {
  nombre: string;
  slug: string;
  talla: string;                // vacío = pieza única
  sku: string;                  // código de ESTA talla
  precio: number | null;        // pesos, de esta talla
  inventario: number | null;    // piezas en tienda; vacío = no se toca
  descripcionCorta: string;
  descripcionLarga: string;
  categoria: string;
  etiquetas: string;            // separadas por coma
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
  { key: "nombre", header: "Nombre", width: 34, note: "Obligatorio. Se repite en cada talla del mismo producto." },
  { key: "slug", header: "Slug", width: 24, note: "Opcional: la liga en la web. Vacío = se arma del nombre. Mismo slug = mismo producto." },
  { key: "talla", header: "Talla", width: 12, note: "Una talla por fila. Vacío = pieza única.", aliases: ["tallas", "medida", "medidas"] },
  { key: "sku", header: "Código (SKU)", width: 16, note: "Obligatorio. Cada talla lleva su propio código.", aliases: ["código", "codigo", "sku", "código o sku", "codigo o sku", "código de talla", "codigo de talla"] },
  { key: "precio", header: "Precio", width: 12, note: "Obligatorio. En pesos, de esta talla." },
  { key: "inventario", header: "Inventario tienda", width: 16, note: "Piezas que hay en tienda. Vacío = no se toca. El e-commerce se carga aparte.", aliases: ["inventario", "existencias", "piezas", "stock", "existencias tienda", "stock tienda"] },
  { key: "descripcionCorta", header: "Descripción corta", width: 40 },
  { key: "descripcionLarga", header: "Descripción larga", width: 60 },
  { key: "categoria", header: "Categoría", width: 20, note: "Si no existe, se crea." },
  { key: "etiquetas", header: "Etiquetas", width: 24, note: "Separadas por coma." },
  { key: "seoTitulo", header: "SEO título", width: 30, aliases: ["titulo seo", "título seo"] },
  { key: "seoDescripcion", header: "SEO descripción", width: 40, aliases: ["descripcion seo", "descripción seo"] },
];

// Campos que se toman de la PRIMERA fila del producto: describen la pieza, no la
// talla. Si se repiten distintos entre filas del mismo producto, gana la primera.
export const PRODUCT_LEVEL_KEYS = [
  "nombre", "slug", "descripcionCorta", "descripcionLarga",
  "categoria", "etiquetas", "seoTitulo", "seoDescripcion",
] as const;

// Cómo quedan los productos dados de alta por Excel. Sólo se aplican al crear:
// si el producto ya existe, la importación no toca estos campos.
// Entran listos para vender en el mostrador y fuera de la tienda web: la web pide
// fotos y textos revisados, el POS no.
export const CREATE_DEFAULTS = {
  status: "active" as const,  // activo: se puede cobrar en cuanto se importa
  is_featured: false,
  hidden_online: true,        // sólo POS; se publica a mano desde el admin
  track_inventory: true,
};

// Filas de ejemplo de la plantilla: un producto con tres tallas (cada una con su
// código) y uno de pieza única, para que se vea cómo se agrupa.
export const EXAMPLE_ROWS: ProductExcelRow[] = [
  {
    nombre: "Anillo Turkana", slug: "anillo-turkana", talla: "6", sku: "TK-001-6",
    precio: 1890, inventario: 3,
    descripcionCorta: "Anillo de plata .925 con acabado mate",
    descripcionLarga: "Pieza hecha a mano en plata .925…",
    categoria: "Anillos", etiquetas: "plata, hecho a mano",
    seoTitulo: "Anillo Turkana de plata .925",
    seoDescripcion: "Anillo artesanal de plata .925 con acabado mate.",
  },
  {
    nombre: "Anillo Turkana", slug: "anillo-turkana", talla: "7", sku: "TK-001-7",
    precio: 1890, inventario: 5,
    descripcionCorta: "", descripcionLarga: "", categoria: "", etiquetas: "",
    seoTitulo: "", seoDescripcion: "",
  },
  {
    nombre: "Anillo Turkana", slug: "anillo-turkana", talla: "8", sku: "TK-001-8",
    precio: 1950, inventario: 2,
    descripcionCorta: "", descripcionLarga: "", categoria: "", etiquetas: "",
    seoTitulo: "", seoDescripcion: "",
  },
  {
    nombre: "Cuff liso dorado", slug: "cuff-liso-dorado", talla: "", sku: "CUFF-11",
    precio: 890, inventario: 4,
    descripcionCorta: "Cuff liso con baño de oro", descripcionLarga: "",
    categoria: "Cuff", etiquetas: "dorado",
    seoTitulo: "", seoDescripcion: "",
  },
];

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

// Piezas: entero no negativo. Devuelve undefined si el texto no es un número,
// para poder distinguir "celda vacía" (null) de "escribieron cualquier cosa".
export function parseCount(value: unknown): number | null | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  // parseNumber tira todo lo que no sea dígito, así que "abc" le sale 0: aquí eso
  // vaciaría el inventario por un dedazo. Sólo pasan dígitos con separadores.
  if (!/^\d[\d.,\s]*$/.test(raw)) return undefined;
  const n = parseNumber(raw);
  // Medias piezas no existen: "2.6" es un error de captura, no 3 anillos.
  if (n === null || !Number.isInteger(n) || n < 0) return undefined;
  return n;
}

export const clean = (value: unknown): string => String(value ?? "").trim();
