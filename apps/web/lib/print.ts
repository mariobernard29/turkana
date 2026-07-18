// Impresión del ticket: WebUSB (ESC/POS crudo) o respaldo HTML imprimible.
import { buildReceipt, type ReceiptData } from "@/lib/escpos";
import { STORE } from "@/lib/business";
import { methodLabel } from "@/lib/payments";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Envía bytes ESC/POS directo a una impresora térmica USB (Chrome/Edge, HTTPS).
export async function printEscPosUSB(data: ReceiptData): Promise<void> {
  const usb = (navigator as any).usb;
  if (!usb) throw new Error("WebUSB no está disponible en este navegador");

  const device = await usb.requestDevice({ filters: [] });
  await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);

  const iface =
    device.configuration.interfaces.find((i: any) =>
      i.alternate.endpoints.some((e: any) => e.direction === "out"),
    ) ?? device.configuration.interfaces[0];
  await device.claimInterface(iface.interfaceNumber);

  const ep = iface.alternate.endpoints.find((e: any) => e.direction === "out");
  if (!ep) throw new Error("La impresora no expone un endpoint de salida");

  await device.transferOut(ep.endpointNumber, buildReceipt(data));
  try { await device.close(); } catch { /* noop */ }
}

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

// Respaldo universal: abre una ventana con el ticket (80mm) y lanza imprimir.
export function printReceiptHTML(data: ReceiptData): void {
  const w = window.open("", "_blank", "width=320,height=600");
  if (!w) return;
  const rows = data.items
    .map((it) => `<tr><td>${it.quantity}× ${escapeHtml(it.name)}</td><td class="r">${money(it.total_cents)}</td></tr>`)
    .join("");

  const payRows = (data.payments ?? (data.method ? [{ method: data.method, amount_cents: data.total }] : []))
    .map((p) => `<tr><td>${methodLabel(p.method)}</td><td class="r">${money(p.amount_cents)}</td></tr>`).join("");

  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${data.orderNumber}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body { width: 76mm; margin: 0 auto; padding: 10px 6px; font-family: 'Courier New', monospace; font-size: 12px; color: #000; line-height: 1.4; }
    .c { text-align: center; }
    .r { text-align: right; white-space: nowrap; }
    .serif { font-family: Georgia, 'Times New Roman', serif; }
    img.logo { width: 46mm; margin: 0 auto 4px; display: block; }
    .tagline { text-align: center; font-size: 10px; letter-spacing: 5px; margin: 0 0 4px; }
    .addr { text-align: center; font-size: 10px; line-height: 1.5; margin: 0; }
    .rule { border: none; border-top: 1.5px solid #000; margin: 8px 0; }
    .dash { border: none; border-top: 1px dashed #000; margin: 8px 0; }
    .label { text-align: center; font-size: 9px; letter-spacing: 3px; text-transform: uppercase; margin: 8px 0 4px; }
    .meta { font-size: 11px; margin: 0; }
    table { width: 100%; border-collapse: collapse; }
    td { vertical-align: top; padding: 1px 0; }
    .totbox { border: 2px solid #000; padding: 5px 8px; margin: 8px 0; }
    .totbox td { font-size: 17px; font-weight: bold; letter-spacing: 1px; }
    .fiscal { font-size: 10px; line-height: 1.5; }
    .fiscal .name { font-weight: bold; letter-spacing: 0.5px; }
    .thanks { font-style: italic; text-align: center; font-size: 13px; margin: 6px 0 2px; }
    .foot { text-align: center; font-size: 10px; margin: 0; }
    .orn { text-align: center; letter-spacing: 6px; font-size: 11px; margin: 4px 0; }
  </style></head><body>
    <img class="logo" src="/turkana-logo.png" alt="Turkana" />
    <p class="tagline serif">${STORE.tagline.split("").join(" ")}</p>
    <div class="fiscal" style="text-align:center;margin-top:4px">
      <p class="name" style="margin:0">${STORE.fiscal.legalName}</p>
      <p style="margin:1px 0"><strong>RFC:</strong> ${STORE.fiscal.rfc}</p>
      <p style="margin:1px 0"><strong>Régimen fiscal:</strong> ${STORE.fiscal.regimen}</p>
      <p style="margin:1px 0"><strong>Domicilio fiscal:</strong><br/>${STORE.addressLines.join("<br/>")}</p>
    </div>
    <div class="orn">&#10086;</div>

    <p class="meta"><strong>Folio:</strong> ${data.orderNumber}<br/><strong>Fecha:</strong> ${new Date().toLocaleString("es-MX")}</p>

    <div class="label serif">Detalle de compra</div>
    <table>${rows}</table>

    <hr class="dash"/>
    <table>
      ${data.discountCents && data.discountCents > 0 ? `<tr><td>Descuento</td><td class="r">-${money(data.discountCents)}</td></tr>` : ""}
      <tr><td>Subtotal</td><td class="r">${money(data.subtotal)}</td></tr>
      <tr><td>IVA (16%)</td><td class="r">${money(data.tax)}</td></tr>
    </table>
    <table class="totbox"><tr><td>TOTAL</td><td class="r">${money(data.total)}</td></tr></table>
    ${payRows ? `<table>${payRows}</table>` : ""}

    <hr class="rule"/>
    <p class="foot" style="font-size:9px">Este ticket no es un comprobante fiscal (CFDI).<br/>Solicita tu factura con los datos fiscales de la parte superior.</p>

    <div class="orn">&#10086;</div>
    <p class="thanks serif">Gracias por su compra</p>
    <p class="foot">Tel. ${STORE.phone} &nbsp;·&nbsp; Instagram ${STORE.instagram}</p>
    <p class="foot">Precios con IVA incluido</p>
    <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 300); };</script>
  </body></html>`);
  w.document.close();
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
