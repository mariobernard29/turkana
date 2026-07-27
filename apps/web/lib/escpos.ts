// Constructor de tickets ESC/POS (impresoras térmicas 80mm).
// Todo el cuerpo va en negrita (doble golpe) para que el ticket se lea bien en papel térmico.
import { STORE } from "@/lib/business";
import { methodLabel } from "@/lib/payments";

// Tipos de documento que se imprimen en el POS.
export type DocType =
  | "sale" | "resguardo" | "precorte" | "devolucion" | "cambio" | "abono" | "corte" | "apartado";

// Fila de una sección libre (etiqueta/valor). Sin `value` ocupa todo el ancho.
export type ReceiptRow = {
  label: string;
  value?: string;
  negative?: boolean; // imprime el importe con "−"
  strong?: boolean;   // resalta la línea (doble alto en térmica)
  indent?: boolean;   // sangría, p.ej. partidas dentro de una venta
};
export type ReceiptSection = { title?: string; rows: ReceiptRow[] };

// Talón que se imprime tras un corte, para separarlo y pegarlo a la pieza
// (apartados: identifica de quién es y evita que otra vendedora la venda).
export type ReceiptStub = { title: string; subtitle?: string; rows: ReceiptRow[] };

export type ReceiptData = {
  orderNumber: string;
  items: { name: string; quantity: number; total_cents: number }[];
  subtotal: number; // base sin IVA
  tax: number;      // IVA contenido
  total: number;    // total con IVA incluido
  discountCents?: number;
  payments?: { method: string; amount_cents: number }[];
  method?: string;  // comprobantes simples (devolución, resguardo…)
  docType?: DocType;
  attendedBy?: string; // cajero/responsable (comprobantes internos)
  meta?: { label: string; value: string }[]; // pares extra del encabezado (Caja, Lote…)
  sections?: ReceiptSection[];               // bloques libres tras los totales
  stub?: ReceiptStub; // segundo comprobante, tras un corte
  dateIso?: string;   // fecha del documento; si falta, se usa "ahora"
  reprint?: boolean;  // marca "REIMPRESIÓN"
};

// Logo convertido a mapa de bits 1bpp (ver loadLogoRaster en lib/print.ts).
export type RasterLogo = { widthBytes: number; height: number; data: Uint8Array };

export const DOC_TITLES: Record<DocType, string> = {
  sale: "NOTA DE VENTA",
  resguardo: "COMPROBANTE DE RESGUARDO",
  precorte: "PRECORTE DE CAJA",
  devolucion: "COMPROBANTE DE DEVOLUCIÓN",
  cambio: "COMPROBANTE DE CAMBIO",
  abono: "COMPROBANTE DE ABONO",
  corte: "CORTE DE CAJA",
  apartado: "COMPROBANTE DE APARTADO",
};

export const DOC_DETAIL_LABELS: Record<DocType, string> = {
  sale: "DETALLE DE COMPRA",
  resguardo: "CONCEPTO",
  precorte: "DESGLOSE POR MÉTODO",
  devolucion: "CONCEPTO",
  cambio: "CONCEPTO",
  abono: "CONCEPTO",
  corte: "DETALLE",
  apartado: "PIEZAS APARTADAS",
};

export const DOC_TOTAL_LABELS: Record<DocType, string> = {
  sale: "TOTAL",
  resguardo: "IMPORTE",
  precorte: "TOTAL",
  devolucion: "REEMBOLSO",
  cambio: "DIFERENCIA",
  abono: "ABONO",
  corte: "DIFERENCIA",
  apartado: "SALDO",
};

export const docType = (d: ReceiptData): DocType => d.docType ?? "sale";
// Sólo la venta lleva datos fiscales y aviso de CFDI.
export const isSale = (d: ReceiptData) => docType(d) === "sale";
// Documentos que se le entregan al cliente (sin línea de firma interna).
const CUSTOMER_DOCS: DocType[] = ["sale", "apartado", "abono"];
export const isCustomerDoc = (d: ReceiptData) => CUSTOMER_DOCS.includes(docType(d));
// Documentos con folio real (los internos no tienen).
export const hasFolio = (d: ReceiptData) => CUSTOMER_DOCS.includes(docType(d));
// En comprobantes internos la cantidad sólo estorba cuando siempre es 1.
export const showsQty = (d: ReceiptData) => isSale(d) || d.items.some((it) => it.quantity > 1);

const WIDTH = 42; // columnas a 80mm, fuente A

const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
// El signo va antes del símbolo ("-$10.00", no "$-10.00").
export const money = (cents: number) =>
  `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function padLine(left: string, right: string, width = WIDTH) {
  let l = left;
  if (left.length + right.length + 1 > width) {
    // Recorta en el último espacio para no dejar palabras a medias.
    const cut = left.slice(0, Math.max(1, width - right.length - 1));
    const lastSpace = cut.lastIndexOf(" ");
    l = (lastSpace > width / 3 ? cut.slice(0, lastSpace) : cut).replace(/[\s·,;:\-–]+$/u, "");
  }
  const spaces = Math.max(1, width - l.length - right.length);
  return l + " ".repeat(spaces) + right;
}

// Envuelve el nombre del artículo para que no se corte en tickets de 80mm.
function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (!line.length) line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else { out.push(line); line = word; }
  }
  if (line.length) out.push(line);
  return out.length ? out : [""];
}

// ── Comandos ESC/POS ─────────────────────────────────────────────────────────
const ESC = 0x1b, GS = 0x1d;

export function buildReceipt(d: ReceiptData, logo?: RasterLogo): Uint8Array {
  const bytes: number[] = [];
  const enc = (s: string) => { for (const ch of stripAccents(s)) bytes.push(ch.charCodeAt(0) & 0xff); };
  const line = (s = "") => { enc(s); bytes.push(0x0a); };
  const cmd = (...b: number[]) => bytes.push(...b);

  const center = () => cmd(ESC, 0x61, 0x01);
  const left = () => cmd(ESC, 0x61, 0x00);
  const emph = (on: boolean) => cmd(ESC, 0x45, on ? 0x01 : 0x00); // negrita (doble golpe)
  const size = (n: number) => cmd(GS, 0x21, n);                   // 0x00 normal · 0x01 doble alto · 0x11 doble
  const spaced = (s: string) => s.split("").join(" ");
  const kind = docType(d);

  cmd(ESC, 0x40);                 // init
  emph(true);                     // negrita en todo el ticket: clave para que se note en térmica
  center();

  // Logo Turkana en mapa de bits; si no se pudo cargar, cae al nombre en texto grande.
  if (logo) {
    cmd(GS, 0x76, 0x30, 0x00,
      logo.widthBytes & 0xff, (logo.widthBytes >> 8) & 0xff,
      logo.height & 0xff, (logo.height >> 8) & 0xff);
    for (const b of logo.data) bytes.push(b);
    line();
  } else {
    size(0x11);
    line(STORE.brand);
    size(0x00);
  }
  line(spaced(STORE.tagline));
  line();

  // Datos fiscales del emisor (formato SAT), sólo en la nota de venta.
  const block = (text: string) => { for (const l of wrap(text, WIDTH)) line(l); };
  if (isSale(d)) {
    block(STORE.fiscal.legalName);
    block(`RFC: ${STORE.fiscal.rfc}`);
    block(`Reg. fiscal: ${STORE.fiscal.regimen}`);
    line("Domicilio fiscal:");
  }
  for (const a of STORE.addressLines) block(a);
  line("=".repeat(WIDTH));

  size(0x01);                     // doble alto para el título del documento
  line(DOC_TITLES[kind]);
  size(0x00);
  if (d.reprint) line(spaced("REIMPRESION"));
  line();

  left();
  if (hasFolio(d)) line(padLine("Folio:", d.orderNumber));
  line(padLine("Fecha:", new Date(d.dateIso ?? Date.now()).toLocaleString("es-MX")));
  if (d.attendedBy) line(padLine("Cajero:", d.attendedBy));
  for (const m of d.meta ?? []) line(padLine(`${m.label}:`, m.value));
  line("=".repeat(WIDTH));

  // El detalle sólo se imprime si hay partidas (el corte de caja no las tiene).
  if (d.items.length) {
    center(); line(spaced(DOC_DETAIL_LABELS[kind])); left();
    line("-".repeat(WIDTH));
    const withQty = showsQty(d);
    for (const it of d.items) {
      const qty = withQty ? `${it.quantity}x ` : "";
      const amount = money(it.total_cents);
      const rows = wrap(it.name, WIDTH - qty.length - amount.length - 1);
      line(padLine(qty + rows[0], amount));
      for (const extra of rows.slice(1)) line(" ".repeat(qty.length) + extra);
    }
    line("-".repeat(WIDTH));
  }

  // Secciones libres (resumen del corte, estado del apartado…).
  (d.sections ?? []).forEach((sec, i) => {
    // El bloque de partidas ya cerró con una línea: no repetirla en la primera sección.
    if (i > 0 || !d.items.length) line("-".repeat(WIDTH));
    if (sec.title) { center(); line(spaced(sec.title)); left(); }
    for (const r of sec.rows) {
      const pad = r.indent ? "  " : "";
      if (r.value === undefined) {
        for (const l of wrap(r.label, WIDTH - pad.length)) line(pad + l);
      } else {
        if (r.strong) size(0x01);
        line(padLine(pad + r.label, (r.negative ? "-" : "") + r.value));
        if (r.strong) size(0x00);
      }
    }
  });
  if (d.sections?.length) line("-".repeat(WIDTH));

  if (d.discountCents && d.discountCents > 0) line(padLine("Descuento", `-${money(d.discountCents)}`));
  if (d.tax > 0) {
    line(padLine("Subtotal", money(d.subtotal)));
    line(padLine("IVA (16%)", money(d.tax)));
  }
  // Total a doble tamaño; si la etiqueta y el importe no caben en 21 columnas, va normal.
  const totalLabel = DOC_TOTAL_LABELS[kind];
  const totalAmount = money(d.total);
  const half = Math.floor(WIDTH / 2);
  const doubleFits = totalLabel.length + totalAmount.length + 1 <= half;
  if (doubleFits) size(0x11);
  line(padLine(totalLabel, totalAmount, doubleFits ? half : WIDTH));
  size(0x00);
  line();

  const pays = d.payments ?? (d.method && d.method !== "-" ? [{ method: d.method, amount_cents: d.total }] : []);
  if (pays.length) {
    line(spaced("FORMA DE PAGO"));
    for (const p of pays) line(padLine(methodLabel(p.method), money(p.amount_cents)));
  }

  line("=".repeat(WIDTH));
  center();
  if (isSale(d)) {
    line("Este ticket no es comprobante fiscal");
    line("(CFDI). Solicita tu factura con los");
    line("datos fiscales de arriba.");
    line("-".repeat(WIDTH));
    line(`Tel. ${STORE.phone}`);
    line(`Instagram ${STORE.instagram}`);
    line("Precios con IVA incluido");
    line();
    size(0x01);
    line("GRACIAS POR SU COMPRA");
    size(0x00);
  } else if (isCustomerDoc(d)) {
    // Apartados y abonos: el cliente se lo lleva, no lleva firma interna.
    line("Conserva este comprobante para");
    line("abonar o recoger tu pieza.");
    line("-".repeat(WIDTH));
    line(`Tel. ${STORE.phone}`);
    line(`Instagram ${STORE.instagram}`);
  } else {
    line("Documento interno de control");
    line();
    left();
    line();
    line("_".repeat(WIDTH - 8));
    center();
    line("Firma del responsable");
  }

  line();
  cmd(ESC, 0x64, 0x03);           // feed 3

  // Talón: se corta y se queda en la tienda (pegado a la pieza apartada).
  if (d.stub) {
    cmd(GS, 0x56, 0x42, 0x00);    // corte parcial: separa el comprobante del cliente
    center();
    line(STORE.brand);
    size(0x11);
    line(d.stub.title);
    size(0x00);
    if (d.stub.subtitle) line(d.stub.subtitle);
    line("=".repeat(WIDTH));
    left();
    for (const r of d.stub.rows) {
      if (r.value === undefined) {
        for (const l of wrap(r.label, WIDTH)) line(l);
      } else {
        if (r.strong) size(0x01);
        line(padLine(r.label, (r.negative ? "-" : "") + r.value));
        if (r.strong) size(0x00);
      }
    }
    line("=".repeat(WIDTH));
    line();
    cmd(ESC, 0x64, 0x03);
  }

  emph(false);
  cmd(GS, 0x56, 0x42, 0x00);      // corte parcial

  return new Uint8Array(bytes);
}
