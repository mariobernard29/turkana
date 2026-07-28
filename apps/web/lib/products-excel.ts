// Formato del Excel de productos: una fila por TALLA (variante).
// Las filas que comparten SKU son el mismo producto con varias tallas, igual que
// en el formulario del admin (el SKU es del producto, no de la variante).
// Este archivo es la fuente única de las columnas: lo usan exportar e importar.

export type ProductExcelRow = {
  sku: string;
  nombre: string;
  categoria: string;
  talla: string;
  precio: number | null;        // pesos, IVA incluido
  precioAntes: number | null;   // pesos
  existencias: number | null;   // almacén tienda
  descripcionCorta: string;
  descripcionLarga: string;
  material: string;
  piedra: string;
  pesoGramos: number | null;
  estado: string;               // activo | borrador | archivado
  destacado: boolean;
  ocultoEnLinea: boolean;
  manejaInventario: boolean;
  coleccion: string;
  etiquetas: string;            // separadas por coma
  codigoBarras: string;
  seoTitulo: string;
  seoDescripcion: string;
};

export type ColumnDef = {
  key: keyof ProductExcelRow;
  header: string;
  width: number;
  note?: string;
};

// El orden de esta lista es el orden de las columnas en el archivo.
export const PRODUCT_COLUMNS: ColumnDef[] = [
  { key: "sku", header: "Código (SKU)", width: 16, note: "Obligatorio. Filas con el mismo código = un producto con varias tallas." },
  { key: "nombre", header: "Nombre", width: 34, note: "Obligatorio." },
  { key: "categoria", header: "Categoría", width: 20, note: "Si no existe, se crea." },
  { key: "talla", header: "Talla", width: 10, note: "Vacío si la pieza no maneja tallas." },
  { key: "precio", header: "Precio", width: 12, note: "Obligatorio. En pesos, con IVA incluido." },
  { key: "precioAntes", header: "Precio antes", width: 13, note: "Opcional, para mostrar tachado." },
  { key: "existencias", header: "Existencias tienda", width: 17, note: "Piezas en el almacén de tienda." },
  { key: "descripcionCorta", header: "Descripción corta", width: 40 },
  { key: "descripcionLarga", header: "Descripción larga", width: 60 },
  { key: "material", header: "Material", width: 18 },
  { key: "piedra", header: "Piedra", width: 18 },
  { key: "pesoGramos", header: "Peso (g)", width: 10 },
  { key: "estado", header: "Estado", width: 12, note: "activo, borrador o archivado. Vacío = borrador." },
  { key: "destacado", header: "Destacado", width: 11, note: "SI o NO." },
  { key: "ocultoEnLinea", header: "Oculto en línea", width: 15, note: "SI = sólo se vende en tienda." },
  { key: "manejaInventario", header: "Maneja inventario", width: 17, note: "NO para servicios o extras sin stock. Vacío = SI." },
  { key: "coleccion", header: "Colección", width: 20, note: "Debe existir; si no, se ignora y se avisa." },
  { key: "etiquetas", header: "Etiquetas", width: 24, note: "Separadas por coma." },
  { key: "codigoBarras", header: "Código de barras", width: 18 },
  { key: "seoTitulo", header: "SEO título", width: 30 },
  { key: "seoDescripcion", header: "SEO descripción", width: 40 },
];

export const STATUS_FROM_LABEL: Record<string, "draft" | "active" | "archived"> = {
  "": "draft",
  activo: "active",
  active: "active",
  borrador: "draft",
  draft: "draft",
  archivado: "archived",
  archived: "archived",
};

export const STATUS_TO_LABEL: Record<string, string> = {
  active: "activo",
  draft: "borrador",
  archived: "archivado",
};

export const yesNo = (v: boolean) => (v ? "SI" : "NO");

// Acepta SI/SÍ/S/TRUE/1/X como verdadero; vacío devuelve el default de la columna.
export function parseYesNo(value: unknown, fallback: boolean): boolean {
  const s = String(value ?? "").trim().toLowerCase();
  if (!s) return fallback;
  return ["si", "sí", "s", "true", "1", "x", "yes", "y"].includes(s);
}

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  // Tolera "$1,890.00" y "1.890,00" mal pegados desde otra hoja.
  const s = String(value).replace(/[^0-9.,-]/g, "").replace(/,(?=\d{3}\b)/g, "");
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export const clean = (value: unknown): string => String(value ?? "").trim();
