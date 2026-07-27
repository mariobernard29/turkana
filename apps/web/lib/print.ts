// Impresión del ticket: WebUSB (ESC/POS crudo) o respaldo HTML imprimible.
import {
  buildReceipt, DOC_TITLES, DOC_DETAIL_LABELS, DOC_TOTAL_LABELS,
  docType, isSale, isCustomerDoc, hasFolio, showsQty, money,
  type ReceiptData, type RasterLogo,
} from "@/lib/escpos";
import { STORE } from "@/lib/business";
import { methodLabel } from "@/lib/payments";

/* eslint-disable @typescript-eslint/no-explicit-any */

const LOGO_SRC = "/turkana-logo.png";
const LOGO_DOTS = 512; // ancho en puntos ≈ 64mm en papel de 80mm (máx. del cabezal: 576)

// Convierte el logo PNG a mapa de bits 1bpp para el comando GS v 0.
// El logo es dorado sobre fondo transparente: se toma el canal alfa como tinta.
export async function loadLogoRaster(): Promise<RasterLogo | undefined> {
  try {
    const res = await fetch(LOGO_SRC, { cache: "force-cache" });
    if (!res.ok) return undefined;
    const bitmap = await createImageBitmap(await res.blob());

    const width = LOGO_DOTS;
    const height = Math.round((bitmap.height / bitmap.width) * width);
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);

    const widthBytes = Math.ceil(width / 8);
    const out = new Uint8Array(widthBytes * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha < 70) continue; // el umbral bajo engorda un poco los trazos finos
        out[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
    return { widthBytes, height, data: out };
  } catch {
    return undefined; // sin logo: buildReceipt cae al nombre en texto grande
  }
}

// Envía bytes ESC/POS directo a una impresora térmica USB (Chrome/Edge, HTTPS).
// NOTA: hoy no hay botón que lo llame (el POS imprime por HTML, que funciona con
// cualquier impresora instalada en Windows). Se conserva para volver a cablearlo
// si se quiere imprimir sin pasar por el diálogo del navegador.
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

  const logo = await loadLogoRaster();
  const payload = buildReceipt(data, logo);
  // En trozos: el mapa de bits del logo desborda el búfer de algunas térmicas si va de golpe.
  const CHUNK = 2048;
  for (let i = 0; i < payload.length; i += CHUNK) {
    await device.transferOut(ep.endpointNumber, payload.slice(i, i + CHUNK));
  }
  try { await device.close(); } catch { /* noop */ }
}

// Respaldo universal: abre una ventana con el ticket (80mm) y lanza imprimir.
export function printReceiptHTML(data: ReceiptData): void {
  const w = window.open("", "_blank", "width=380,height=700");
  if (!w) return;
  const kind = docType(data);
  const sale = isSale(data);
  const customerDoc = isCustomerDoc(data);

  const withQty = showsQty(data);
  const rows = data.items
    .map((it) => `<tr>
      ${withQty ? `<td class="q">${it.quantity}×</td>` : ""}
      <td class="d">${escapeHtml(it.name)}</td>
      <td class="r">${money(it.total_cents)}</td>
    </tr>`)
    .join("");

  const pays = data.payments ?? (data.method && data.method !== "-" ? [{ method: data.method, amount_cents: data.total }] : []);
  const payRows = pays
    .map((p) => `<tr><td>${methodLabel(p.method)}</td><td class="r">${money(p.amount_cents)}</td></tr>`)
    .join("");

  // Talón que se corta y se queda en la tienda (pegado a la pieza apartada).
  const stub = data.stub
    ? `<div class="cutline"><span>✂ Cortar aquí</span></div>
       <div class="stub">
         <p class="stubbrand">${STORE.brand}</p>
         <p class="stubtitle">${escapeHtml(data.stub.title)}</p>
         ${data.stub.subtitle ? `<p class="stubsub">${escapeHtml(data.stub.subtitle)}</p>` : ""}
         <hr class="rule"/>
         <table>${data.stub.rows.map((r) => (r.value === undefined
           ? `<tr><td colspan="2">${escapeHtml(r.label)}</td></tr>`
           : `<tr><td class="${r.strong ? "strong" : ""}">${escapeHtml(r.label)}</td>
              <td class="r${r.strong ? " strong" : ""}">${r.negative ? "−" : ""}${escapeHtml(r.value)}</td></tr>`
         )).join("")}</table>
       </div>`
    : "";

  // Secciones libres (resumen del corte, estado del apartado…).
  const sections = (data.sections ?? [])
    .map((sec) => `${sec.title ? `<p class="section">${escapeHtml(sec.title)}</p>` : ""}
      <table>${sec.rows.map((r) => (r.value === undefined
        ? `<tr><td colspan="2" class="${r.indent ? "ind" : ""}">${escapeHtml(r.label)}</td></tr>`
        : `<tr><td class="${r.indent ? "ind" : ""}${r.strong ? " strong" : ""}">${escapeHtml(r.label)}</td>
           <td class="r${r.strong ? " strong" : ""}">${r.negative ? "−" : ""}${escapeHtml(r.value)}</td></tr>`
      )).join("")}</table>
      <hr class="dash"/>`)
    .join("");

  w.document.write(`<!doctype html><html><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(data.orderNumber)}</title>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@600;700;800&display=swap">
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body {
      width: 76mm; margin: 0 auto; padding: 8px 5px;
      font-family: 'Open Sans', Calibri, 'Segoe UI', Arial, sans-serif;
      font-size: 14px; font-weight: 600; line-height: 1.35; color: #000;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
      -webkit-font-smoothing: none;
    }
    p, table { margin: 0; }
    .c { text-align: center; }
    .r { text-align: right; white-space: nowrap; }
    /* El logo es dorado: brightness(0) lo pasa a negro puro para que marque en térmica. */
    img.logo { width: 52mm; margin: 0 auto 6px; display: block; filter: brightness(0) saturate(0); }
    .tagline { text-align: center; font-size: 13px; font-weight: 800; letter-spacing: 6px; text-indent: 6px; margin: 0 0 8px; }
    .rule { border: none; border-top: 2px solid #000; margin: 7px 0; }
    .dash { border: none; border-top: 2px dashed #000; margin: 7px 0; }
    .doctitle { text-align: center; font-size: 18px; font-weight: 800; letter-spacing: 1.5px; margin: 8px 0 6px; }
    .section { text-align: center; font-size: 12px; font-weight: 800; letter-spacing: 3px; text-transform: uppercase; margin: 8px 0 4px; }
    .issuer { text-align: center; font-size: 13px; font-weight: 700; line-height: 1.4; }
    .issuer .name { font-size: 13px; font-weight: 800; }
    .meta { font-size: 14px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    td { vertical-align: top; padding: 2px 0; }
    td.q { width: 9mm; font-weight: 800; }
    td.d { padding-right: 3px; word-break: break-word; }
    .totbox { border: 2.5px solid #000; padding: 4px 7px; margin: 8px 0; }
    .totbox td { font-size: 22px; font-weight: 800; letter-spacing: 0.5px; padding: 0; }
    .totbox td.lbl { font-size: 17px; letter-spacing: 1.5px; } /* el importe manda; la etiqueta cabe aunque sea larga */
    .note { text-align: center; font-size: 12px; font-weight: 700; line-height: 1.4; }
    .thanks { text-align: center; font-size: 17px; font-weight: 800; letter-spacing: 2px; margin: 8px 0 6px; }
    .foot { text-align: center; font-size: 13px; font-weight: 700; margin: 0; }
    .sig { margin-top: 26px; border-top: 2px solid #000; padding-top: 4px; text-align: center; font-size: 13px; font-weight: 700; }
    td.ind { padding-left: 10px; }
    td.strong { font-size: 15px; font-weight: 800; }
    .reprint { text-align: center; font-size: 12px; font-weight: 800; letter-spacing: 4px; margin: 0 0 6px; }
    /* Talón: se corta y se pega a la pieza en tienda */
    .cutline { position: relative; text-align: center; margin: 22px 0 14px; border-top: 2px dashed #000; }
    .cutline span { position: relative; top: -9px; background: #fff; padding: 0 6px; font-size: 11px; font-weight: 700; }
    .stub { border: 2px solid #000; padding: 8px 7px; }
    .stubbrand { text-align: center; font-size: 12px; font-weight: 700; letter-spacing: 5px; margin: 0; }
    .stubtitle { text-align: center; font-size: 20px; font-weight: 800; letter-spacing: 1px; margin: 2px 0 0; }
    .stubsub { text-align: center; font-size: 13px; font-weight: 700; margin: 2px 0 0; }
  </style></head><body>
    <img class="logo" src="${LOGO_SRC}" alt="${STORE.brand}" />
    <p class="tagline">${STORE.tagline}</p>

    <div class="issuer">
      ${sale ? `<p class="name">${STORE.fiscal.legalName}</p>
      <p>RFC: ${STORE.fiscal.rfc}</p>
      <p>Régimen fiscal: ${STORE.fiscal.regimen}</p>
      <p>Domicilio fiscal:</p>` : ""}
      <p>${STORE.addressLines.join("<br/>")}</p>
    </div>

    <hr class="rule"/>
    <p class="doctitle">${DOC_TITLES[kind]}</p>
    ${data.reprint ? `<p class="reprint">REIMPRESIÓN</p>` : ""}
    <hr class="rule"/>

    <table class="meta">
      ${hasFolio(data) ? `<tr><td>Folio</td><td class="r">${escapeHtml(data.orderNumber)}</td></tr>` : ""}
      <tr><td>Fecha</td><td class="r">${new Date(data.dateIso ?? Date.now()).toLocaleString("es-MX")}</td></tr>
      ${data.attendedBy ? `<tr><td>Cajero</td><td class="r">${escapeHtml(data.attendedBy)}</td></tr>` : ""}
      ${(data.meta ?? []).map((m) => `<tr><td>${escapeHtml(m.label)}</td><td class="r">${escapeHtml(m.value)}</td></tr>`).join("")}
    </table>

    ${data.items.length ? `<p class="section">${DOC_DETAIL_LABELS[kind]}</p>
    <hr class="dash"/>
    <table>${rows}</table>
    <hr class="dash"/>` : ""}

    ${sections}

    <table>
      ${data.discountCents && data.discountCents > 0 ? `<tr><td>Descuento</td><td class="r">-${money(data.discountCents)}</td></tr>` : ""}
      ${data.tax > 0 ? `<tr><td>Subtotal</td><td class="r">${money(data.subtotal)}</td></tr>
      <tr><td>IVA (16%)</td><td class="r">${money(data.tax)}</td></tr>` : ""}
    </table>
    <table class="totbox"><tr><td class="lbl">${DOC_TOTAL_LABELS[kind]}</td><td class="r">${money(data.total)}</td></tr></table>

    ${payRows ? `<p class="section">Forma de pago</p><table>${payRows}</table>` : ""}

    <hr class="rule"/>
    ${sale ? `<p class="note">Este ticket no es un comprobante fiscal (CFDI).<br/>Solicita tu factura con los datos fiscales de la parte superior.</p>
    <hr class="dash"/>
    <p class="thanks">GRACIAS POR SU COMPRA</p>
    <p class="foot">Tel. ${STORE.phone} &nbsp;·&nbsp; ${STORE.instagram}</p>
    <p class="foot">Precios con IVA incluido</p>`
    : customerDoc ? `<p class="note">Conserva este comprobante para abonar o recoger tu pieza.</p>
    <hr class="dash"/>
    <p class="foot">Tel. ${STORE.phone} &nbsp;·&nbsp; ${STORE.instagram}</p>`
    : `<p class="note">Documento interno de control</p>
    <div class="sig">Firma del responsable</div>`}

    ${stub}

    <script>
      (function () {
        var imgs = Array.prototype.map.call(document.images, function (im) {
          return im.complete ? Promise.resolve() : new Promise(function (r) { im.onload = im.onerror = r; });
        });
        var fonts = document.fonts
          ? Promise.race([document.fonts.ready, new Promise(function (r) { setTimeout(r, 1500); })])
          : Promise.resolve();
        Promise.all(imgs.concat([fonts])).then(function () {
          window.focus(); window.print(); setTimeout(function () { window.close(); }, 400);
        });
      })();
    </script>
  </body></html>`);
  w.document.close();
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
