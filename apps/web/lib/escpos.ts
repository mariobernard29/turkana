// Constructor de tickets ESC/POS (impresoras térmicas 80mm).
import { STORE } from "@/lib/business";

export type ReceiptData = {
  orderNumber: string;
  items: { name: string; quantity: number; total_cents: number }[];
  subtotal: number; // base sin IVA
  tax: number;      // IVA contenido
  total: number;    // total con IVA incluido
  discountCents?: number;
  payments?: { method: string; amount_cents: number }[];
  method?: string;  // comprobantes simples (devolución, resguardo…)
};

const WIDTH = 42; // columnas a 80mm, fuente A
const METHOD: Record<string, string> = {
  cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia",
  stripe: "Tarjeta", oxxo: "OXXO", layaway: "Apartado", rewards: "Rewards", credit: "Credito",
} as const;

const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function padLine(left: string, right: string, width = WIDTH) {
  const l = left.length + right.length + 1 > width ? left.slice(0, width - right.length - 1) : left;
  const spaces = Math.max(1, width - l.length - right.length);
  return l + " ".repeat(spaces) + right;
}

// ── Comandos ESC/POS ─────────────────────────────────────────────────────────
const ESC = 0x1b, GS = 0x1d;

export function buildReceipt(d: ReceiptData): Uint8Array {
  const bytes: number[] = [];
  const enc = (s: string) => { for (const ch of stripAccents(s)) bytes.push(ch.charCodeAt(0) & 0xff); };
  const line = (s = "") => { enc(s); bytes.push(0x0a); };
  const cmd = (...b: number[]) => bytes.push(...b);

  const center = () => cmd(ESC, 0x61, 0x01);
  const left = () => cmd(ESC, 0x61, 0x00);
  const emph = (on: boolean) => cmd(ESC, 0x45, on ? 0x01 : 0x00); // negrita

  cmd(ESC, 0x40);                 // init
  center();
  cmd(GS, 0x21, 0x11);            // doble alto/ancho
  line(STORE.brand);
  cmd(GS, 0x21, 0x00);            // normal
  emph(true);
  line(STORE.tagline.split("").join(" "));
  emph(false);

  // Datos fiscales del emisor (formato SAT), arriba.
  emph(true); line(STORE.fiscal.legalName); emph(false);
  line(`RFC: ${STORE.fiscal.rfc}`);
  line(`Reg. fiscal: ${STORE.fiscal.regimen}`);
  line("Domicilio fiscal:");
  for (const a of STORE.addressLines) line(a);
  line("=".repeat(WIDTH));

  left();
  emph(true); enc("Folio: "); emph(false); line(d.orderNumber);
  line(new Date().toLocaleString("es-MX"));
  line("=".repeat(WIDTH));

  center(); line("DETALLE DE COMPRA"); left();
  line("-".repeat(WIDTH));
  for (const it of d.items) {
    line(padLine(`${it.quantity}x ${it.name}`, money(it.total_cents)));
  }

  line("-".repeat(WIDTH));
  if (d.discountCents && d.discountCents > 0) line(padLine("Descuento", `-${money(d.discountCents)}`));
  line(padLine("Subtotal", money(d.subtotal)));
  line(padLine("IVA (16%)", money(d.tax)));
  emph(true);
  cmd(GS, 0x21, 0x01);            // doble alto para el total
  line(padLine("TOTAL", money(d.total), Math.floor(WIDTH / 2)));
  cmd(GS, 0x21, 0x00);
  emph(false);
  const pays = d.payments ?? (d.method ? [{ method: d.method, amount_cents: d.total }] : []);
  for (const p of pays) line(padLine(`Pago ${METHOD[p.method] ?? p.method}`, money(p.amount_cents)));

  line("=".repeat(WIDTH));
  center();
  line("Este ticket no es comprobante fiscal");
  line("(CFDI). Solicita tu factura con los");
  line("datos fiscales de arriba.");

  line("-".repeat(WIDTH));
  line(`Tel. ${STORE.phone}`);
  line(`Instagram ${STORE.instagram}`);
  line("Precios con IVA incluido");
  emph(true); line("Gracias por su compra"); emph(false);
  line();
  cmd(ESC, 0x64, 0x03);           // feed 3
  cmd(GS, 0x56, 0x42, 0x00);      // corte parcial

  return new Uint8Array(bytes);
}
