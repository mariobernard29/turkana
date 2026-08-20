// Respaldo de impresión por el diálogo del navegador.
//
// Es el camino que se usa cuando el agente del mostrador está caído. Pinta
// EXACTAMENTE las mismas líneas que la impresora térmica (lib/receipt-layout.ts)
// sobre una rejilla monoespaciada de 42 columnas, para que el papel se vea igual
// salga por donde salga. Antes este archivo maquetaba el ticket por su cuenta con
// Open Sans y los dos tickets no se parecían en nada.
import { buildReceipt } from "@/lib/escpos";
import { turkanaLogo } from "@/lib/logo-raster";
import { layoutReceipt, docType, DOC_TITLES, WIDTH, type ReceiptData } from "@/lib/receipt-layout";

/* eslint-disable @typescript-eslint/no-explicit-any */

const LOGO_SRC = "/turkana-logo.png";
// 512 puntos a 203 dpi ≈ 64 mm: el mismo ancho que ocupa el mapa de bits en térmica.
const LOGO_MM = 64;
// Ancho útil del papel de 80 mm. Las 42 columnas se estiran hasta llenarlo.
const PAPER_MM = 72;

// Envía bytes ESC/POS directo a una impresora térmica USB (Chrome/Edge, HTTPS).
// NOTA: hoy no hay botón que lo llame (el POS imprime por la cola del agente, y
// si se cae, por HTML). Se conserva para volver a cablearlo si hiciera falta.
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

  const payload = buildReceipt(data, turkanaLogo());
  // En trozos: el mapa de bits del logo desborda el búfer de algunas térmicas si va de golpe.
  const CHUNK = 2048;
  for (let i = 0; i < payload.length; i += CHUNK) {
    await device.transferOut(ep.endpointNumber, payload.slice(i, i + CHUNK));
  }
  try { await device.close(); } catch { /* noop */ }
}

// Abre el documento y deja que el propio script lance el diálogo de impresión.
// Si el navegador bloquea la ventana emergente, se imprime desde un iframe oculto
// para que el ticket nunca se pierda en silencio.
function openForPrint(html: string, title: string): void {
  const w = window.open("", "_blank", "width=380,height=700");
  if (w) {
    w.document.write(html);
    w.document.close();
    return;
  }
  const frame = document.createElement("iframe");
  frame.title = title;
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc) { frame.remove(); return; }
  doc.open();
  doc.write(html);
  doc.close();
  // El diálogo es modal: se limpia después, sin prisa.
  setTimeout(() => frame.remove(), 60000);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Respaldo universal: arma el ticket (80mm) y lanza imprimir.
export function printReceiptHTML(data: ReceiptData): void {
  const lines = layoutReceipt(data);
  const title = `${DOC_TITLES[docType(data)]} ${data.orderNumber}`;

  const body = lines
    .map((ln, i) => {
      if (ln.kind === "logo") {
        // El logo es dorado: brightness(0) lo pasa a negro puro para que marque.
        return `<img class="logo" src="${LOGO_SRC}" alt="${escapeHtml(ln.fallback)}">`;
      }
      if (ln.kind === "feed") return `<div class="feed" style="--n:${ln.lines}"></div>`;
      if (ln.kind === "cut") {
        // El corte final no se dibuja: no hay nada después que separar.
        const rest = lines.slice(i + 1);
        if (!rest.some((l) => l.kind !== "cut")) return "";
        return `<div class="cut"><span>✂ Cortar aquí</span></div>`;
      }
      const cls = `ln ${ln.size} ${ln.align === "c" ? "c" : "l"}`;
      // Una línea vacía necesita contenido o el navegador la colapsa.
      return `<div class="${cls}"><span>${escapeHtml(ln.text) || "&nbsp;"}</span></div>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body {
    width: ${PAPER_MM}mm; margin: 0 auto; padding: 3mm 0 6mm;
    /* Monoespaciada: es lo que permite clavar la rejilla de ${WIDTH} columnas. */
    font-family: "Cascadia Mono", Consolas, "DejaVu Sans Mono", "Liberation Mono", ui-monospace, monospace;
    font-size: 2.5mm; font-weight: 700; color: #000; background: #fff;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    -webkit-font-smoothing: none;
  }
  /* La altura de renglón es la unidad de toda la hoja. */
  body { --lh: 1.25em; }
  .ln { white-space: pre; line-height: var(--lh); }
  .ln.l { text-align: left; }
  .ln.c { text-align: center; }
  .ln > span { display: inline-block; }
  /* Doble alto y doble ancho, igual que GS ! en la térmica. */
  .ln.tall { height: calc(var(--lh) * 2); }
  .ln.tall > span { transform: scaleY(2); }
  .ln.big { height: calc(var(--lh) * 2); }
  .ln.big > span { transform: scale(2); }
  .ln.l > span { transform-origin: left top; }
  .ln.c > span { transform-origin: center top; }
  .feed { height: calc(var(--lh) * var(--n)); }
  img.logo {
    display: block; width: ${LOGO_MM}mm; margin: 0 auto;
    filter: brightness(0) saturate(0);
  }
  .cut {
    border-top: 2px dashed #000; text-align: center; margin: 6mm 0 4mm;
    break-before: page; page-break-before: always;
  }
  .cut > span { position: relative; top: -0.7em; background: #fff; padding: 0 2mm; }
  /* Un renglón no debe partirse entre páginas. */
  .ln { break-inside: avoid; page-break-inside: avoid; }
  /* Reglas auxiliares del ajuste automático; no se imprimen. */
  #ruler { position: absolute; visibility: hidden; width: ${PAPER_MM}mm; height: 0; }
  #probe { position: absolute; visibility: hidden; white-space: pre; }
</style></head>
<body>
<div id="ruler"></div><div id="probe">${"X".repeat(WIDTH)}</div>
${body}
<script>
  // Ajusta el tamaño de letra para que ${WIDTH} caracteres midan exactamente el
  // ancho del papel. Así el ticket cuadra con cualquier monoespaciada que tenga
  // instalada la PC del mostrador, sin depender de una fuente en concreto.
  (function () {
    function fit() {
      var ruler = document.getElementById("ruler");
      var probe = document.getElementById("probe");
      if (!ruler || !probe) return;
      var target = ruler.getBoundingClientRect().width;
      var w = probe.getBoundingClientRect().width;
      if (!target || !w) return;
      var cur = parseFloat(getComputedStyle(document.body).fontSize);
      document.body.style.fontSize = (cur * target / w) + "px";
    }
    function go() {
      fit();
      fit(); // segunda pasada: cierra el redondeo del navegador
      setTimeout(function () { window.print(); }, 150);
      setTimeout(function () { window.close(); }, 800);
    }
    var img = document.querySelector("img.logo");
    var waits = [document.fonts ? document.fonts.ready : null];
    if (img && !img.complete) {
      waits.push(new Promise(function (r) { img.onload = r; img.onerror = r; }));
    }
    Promise.race([
      Promise.all(waits.filter(Boolean)),
      new Promise(function (r) { setTimeout(r, 2000); }),
    ]).then(go, go);
  })();
</script>
</body></html>`;

  openForPrint(html, title);
}
