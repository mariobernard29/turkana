// El logo Turkana como PNG, para incrustarlo en los reportes en PDF.
//
// Se arma a partir del mismo mapa de bits que ya se imprime en los tickets
// (lib/logo-raster.ts) en vez de leer `public/turkana-logo.png` en caliente:
// en Vercel el sistema de archivos de la función sólo trae lo que el trazado de
// dependencias alcanzó a ver, y un archivo leído por su ruta no siempre viaja.
// Así el logo va dentro del código y no puede faltar.
//
// El raster viene empaquetado a 1 bit por punto, 64 bytes por renglón, que es
// exactamente el formato de una imagen PNG en escala de grises de 1 bit y 512
// de ancho. Lo único que cambia es el significado del bit: en ESC/POS un 1 es
// un punto negro y en PNG un 1 es blanco, así que se invierte.
import { deflateSync } from "node:zlib";
import { turkanaLogo } from "@/lib/logo-raster";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

let cached: Buffer | null = null;

/** El wordmark de Turkana en PNG (blanco y negro). Se arma una sola vez. */
export function turkanaLogoPng(): Buffer {
  if (cached) return cached;

  const logo = turkanaLogo();
  const width = logo.widthBytes * 8;
  const height = logo.height;

  // Cada renglón del PNG lleva delante su byte de filtro (0 = sin filtro).
  const raw = Buffer.alloc(height * (1 + logo.widthBytes));
  for (let y = 0; y < height; y++) {
    const src = y * logo.widthBytes;
    const dst = y * (1 + logo.widthBytes) + 1;
    for (let x = 0; x < logo.widthBytes; x++) raw[dst + x] = ~logo.data[src + x] & 0xff;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 1;  // bits por muestra
  ihdr[9] = 0;  // escala de grises
  ihdr[10] = 0; // compresión deflate
  ihdr[11] = 0; // filtrado estándar
  ihdr[12] = 0; // sin entrelazado

  cached = Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return cached;
}

/** Proporción ancho/alto del logo, para no deformarlo al colocarlo. */
export function turkanaLogoRatio(): number {
  const logo = turkanaLogo();
  return (logo.widthBytes * 8) / logo.height;
}
