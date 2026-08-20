// Convierte el logo PNG a mapa de bits 1bpp para el comando ESC/POS `GS v 0`.
//
// Antes esto se hacía en el navegador con un <canvas>, y por eso el ticket de
// prueba del panel salía sin logo: es un server action y ahí no hay canvas.
// Ahora el mapa de bits se calcula UNA vez, aquí, y se versiona como módulo; el
// servidor y el navegador imprimen exactamente el mismo logo y en runtime no
// hace falta ninguna dependencia.
//
// Uso:  node scripts/gen-logo-raster.mjs
// (sharp ya viene con Next.js; sólo se usa en este script, nunca en runtime)
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "public", "turkana-logo.png");
const OUT = join(here, "..", "lib", "logo-raster.ts");

// 512 puntos ≈ 64 mm en papel de 80 mm (el cabezal admite 576 como máximo).
const DOTS = 512;
// El logo es dorado sobre fondo transparente: la tinta es el canal alfa. El
// umbral bajo engorda un poco los trazos finos, que si no se pierden en térmica.
const ALPHA_MIN = 70;

const { data, info } = await sharp(SRC)
  .resize({ width: DOTS })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height, channels } = info;
const widthBytes = Math.ceil(width / 8);
const out = new Uint8Array(widthBytes * height);

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const alpha = data[(y * width + x) * channels + 3];
    if (alpha < ALPHA_MIN) continue;
    out[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
  }
}

const b64 = Buffer.from(out).toString("base64");
const ink = out.reduce((n, b) => n + b.toString(2).split("1").length - 1, 0);

writeFileSync(
  OUT,
  `// GENERADO por scripts/gen-logo-raster.mjs — no editar a mano.
// Logo de ${width}×${height} puntos empaquetado a 1bpp para \`GS v 0\`.
// Para regenerarlo tras cambiar public/turkana-logo.png:
//   node scripts/gen-logo-raster.mjs
import type { RasterLogo } from "@/lib/receipt-layout";

const WIDTH_BYTES = ${widthBytes};
const HEIGHT = ${height};
const DATA_B64 =
  "${b64}";

function unpack(): Uint8Array {
  // atob en el navegador, Buffer en el servidor: el ticket se arma en los dos.
  if (typeof atob === "function") {
    const bin = atob(DATA_B64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(DATA_B64, "base64"));
}

let cached: RasterLogo | null = null;

/** Logo Turkana listo para la impresora térmica. Se descomprime una sola vez. */
export function turkanaLogo(): RasterLogo {
  if (!cached) cached = { widthBytes: WIDTH_BYTES, height: HEIGHT, data: unpack() };
  return cached;
}
`,
  "utf8",
);

console.log(`OK  ${width}x${height}  widthBytes=${widthBytes}  bytes=${out.length}  base64=${b64.length}  tinta=${((ink / (width * height)) * 100).toFixed(1)}%`);
console.log(`->  ${OUT}`);
