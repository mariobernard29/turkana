// Maquetación de tickets, independiente de cómo se pinten.
//
// Un ticket puede salir por dos caminos: la impresora térmica del mostrador
// (bytes ESC/POS, lib/escpos.ts) o el diálogo del navegador cuando el agente
// está caído (HTML, lib/print.ts). Antes cada camino armaba el ticket por su
// cuenta y los dos papeles no se parecían. Aquí se decide UNA vez qué dice cada
// renglón; los renderizadores sólo lo pintan.
//
// El modelo es deliberadamente pobre —líneas de texto de 42 columnas— porque es
// lo que la térmica sabe hacer. El HTML imita esa rejilla en monoespaciada.
import { STORE } from "@/lib/business";
import { methodLabel } from "@/lib/payments";
import { formatStore } from "@/lib/dates";

// Tipos de documento que se imprimen en el POS.
export type DocType =
  | "sale" | "resguardo" | "precorte" | "devolucion" | "cambio" | "abono" | "corte" | "apartado"
  | "gasto" | "ingreso" | "prueba";

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
  notes?: string[];   // renglones libres al pie (página de prueba, avisos)
};

// Logo convertido a mapa de bits 1bpp (ver lib/logo-raster.ts).
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
  gasto: "COMPROBANTE DE GASTO",
  ingreso: "COMPROBANTE DE INGRESO",
  prueba: "PÁGINA DE PRUEBA",
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
  gasto: "SE GASTÓ EN",
  ingreso: "MOTIVO DEL INGRESO",
  prueba: "PRUEBA",
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
  gasto: "SALIÓ DE CAJA",
  ingreso: "ENTRÓ A CAJA",
  prueba: "TOTAL",
};

export const docType = (d: ReceiptData): DocType => d.docType ?? "sale";
// Sólo la venta lleva datos fiscales y aviso de CFDI.
export const isSale = (d: ReceiptData) => docType(d) === "sale";
// Documentos que se le entregan al cliente: llevan folio y pie de cliente, no
// la línea de firma de los comprobantes internos.
const CUSTOMER_DOCS: DocType[] = ["sale", "apartado", "abono"];
export const isCustomerDoc = (d: ReceiptData) => CUSTOMER_DOCS.includes(docType(d));
// Los documentos del cliente son justo los que llevan folio real.
export const hasFolio = isCustomerDoc;
// En comprobantes internos la cantidad sólo estorba cuando siempre es 1.
export const showsQty = (d: ReceiptData) => isSale(d) || d.items.some((it) => it.quantity > 1);

export const WIDTH = 42; // columnas a 80mm, fuente A

// El signo va antes del símbolo ("-$10.00", no "$-10.00").
export const money = (cents: number) =>
  `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function padLine(left: string, right: string, width = WIDTH) {
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
export function wrap(text: string, width: number): string[] {
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

// ── El modelo de líneas ──────────────────────────────────────────────────────
// `n` = tamaño normal (42 columnas) · `tall` = doble alto · `big` = doble alto y
// ancho (21 columnas ocupan el ancho completo del papel).
export type LineSize = "n" | "tall" | "big";
export type Align = "l" | "c";

export type ReceiptLine =
  | { kind: "logo"; fallback: string } // mapa de bits; sin él, el nombre en grande
  | { kind: "text"; text: string; align: Align; size: LineSize }
  | { kind: "feed"; lines: number }
  | { kind: "cut" };

export function layoutReceipt(d: ReceiptData): ReceiptLine[] {
  const out: ReceiptLine[] = [];
  const kind = docType(d);

  // El alineado es de estado, como en la impresora: se fija y las líneas
  // siguientes lo heredan hasta que cambie.
  let align: Align = "c";
  const center = () => { align = "c"; };
  const left = () => { align = "l"; };
  const line = (text = "", size: LineSize = "n") => out.push({ kind: "text", text, align, size });
  // Dos rayas seguidas nunca son intencionales: pasa cuando un bloque de en
  // medio no se imprime (la página de prueba, por ejemplo, no lleva total).
  const rule = (char: string) => {
    const text = char.repeat(WIDTH);
    const last = out[out.length - 1];
    if (last?.kind === "text" && last.text === text) return;
    line(text);
  };
  const spaced = (s: string) => s.split("").join(" ");
  const block = (text: string) => { for (const l of wrap(text, WIDTH)) line(l); };

  center();
  out.push({ kind: "logo", fallback: STORE.brand });
  line(spaced(STORE.tagline));
  line();

  // Datos fiscales del emisor (formato SAT), sólo en la nota de venta.
  if (isSale(d)) {
    block(STORE.fiscal.legalName);
    block(`RFC: ${STORE.fiscal.rfc}`);
    block(`Reg. fiscal: ${STORE.fiscal.regimen}`);
    line("Domicilio fiscal:");
  }
  for (const a of STORE.addressLines) block(a);
  rule("=");

  line(DOC_TITLES[kind], "tall");
  if (d.reprint) line(spaced("REIMPRESION"));
  line();

  left();
  if (hasFolio(d)) line(padLine("Folio:", d.orderNumber));
  // Hora de la tienda: el ticket puede armarse en el servidor (UTC) o en el iPad.
  line(padLine("Fecha:", formatStore(d.dateIso ?? new Date())));
  if (d.attendedBy) line(padLine("Cajero:", d.attendedBy));
  for (const m of d.meta ?? []) line(padLine(`${m.label}:`, m.value));
  rule("=");

  // El detalle sólo se imprime si hay partidas (el corte de caja no las tiene).
  if (d.items.length) {
    center(); line(spaced(DOC_DETAIL_LABELS[kind])); left();
    rule("-");
    const withQty = showsQty(d);
    for (const it of d.items) {
      const qty = withQty ? `${it.quantity}x ` : "";
      const amount = money(it.total_cents);
      const rows = wrap(it.name, WIDTH - qty.length - amount.length - 1);
      line(padLine(qty + rows[0], amount));
      for (const extra of rows.slice(1)) line(" ".repeat(qty.length) + extra);
    }
    rule("-");
  }

  // Secciones libres (resumen del corte, estado del apartado…).
  (d.sections ?? []).forEach((sec, i) => {
    // El bloque de partidas ya cerró con una línea: no repetirla en la primera sección.
    if (i > 0 || !d.items.length) rule("-");
    if (sec.title) { center(); line(spaced(sec.title)); left(); }
    for (const r of sec.rows) {
      const pad = r.indent ? "  " : "";
      if (r.value === undefined) {
        for (const l of wrap(r.label, WIDTH - pad.length)) line(pad + l);
      } else {
        line(padLine(pad + r.label, (r.negative ? "-" : "") + r.value), r.strong ? "tall" : "n");
      }
    }
  });
  if (d.sections?.length) rule("-");

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
  // La página de prueba no tiene importe: un TOTAL de $0.00 sólo confunde.
  if (kind !== "prueba") {
    line(padLine(totalLabel, totalAmount, doubleFits ? half : WIDTH), doubleFits ? "big" : "n");
    line();
  }

  const pays = d.payments ?? (d.method && d.method !== "-" ? [{ method: d.method, amount_cents: d.total }] : []);
  if (pays.length) {
    line(spaced("FORMA DE PAGO"));
    for (const p of pays) line(padLine(methodLabel(p.method), money(p.amount_cents)));
  }

  rule("=");
  center();
  for (const n of d.notes ?? []) block(n);
  if (d.notes?.length) rule("-");

  if (isSale(d)) {
    line("Este ticket no es comprobante fiscal");
    line("(CFDI). Solicita tu factura con los");
    line("datos fiscales de arriba.");
    rule("-");
    line(`Tel. ${STORE.phone}`);
    line(`Instagram ${STORE.instagram}`);
    line("Precios con IVA incluido");
    line();
    line("GRACIAS POR SU COMPRA", "tall");
  } else if (isCustomerDoc(d)) {
    // Apartados y abonos: el cliente se lo lleva, no lleva firma interna.
    line("Conserva este comprobante para");
    line("abonar o recoger tu pieza.");
    rule("-");
    line(`Tel. ${STORE.phone}`);
    line(`Instagram ${STORE.instagram}`);
  } else if (kind !== "prueba") {
    line("Documento interno de control");
    line();
    left();
    line();
    line("_".repeat(WIDTH - 8));
    center();
    line("Firma del responsable");
  }

  line();
  out.push({ kind: "feed", lines: 3 });

  // Talón: se corta y se queda en la tienda (pegado a la pieza apartada).
  if (d.stub) {
    out.push({ kind: "cut" }); // separa el comprobante del cliente
    center();
    line(STORE.brand);
    line(d.stub.title, "big");
    if (d.stub.subtitle) line(d.stub.subtitle);
    rule("=");
    left();
    for (const r of d.stub.rows) {
      if (r.value === undefined) {
        for (const l of wrap(r.label, WIDTH)) line(l);
      } else {
        line(padLine(r.label, (r.negative ? "-" : "") + r.value), r.strong ? "tall" : "n");
      }
    }
    rule("=");
    line();
    out.push({ kind: "feed", lines: 3 });
  }

  out.push({ kind: "cut" });
  return out;
}
