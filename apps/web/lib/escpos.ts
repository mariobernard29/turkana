// Renderizador ESC/POS (impresoras térmicas 80mm).
//
// Qué dice cada renglón se decide en lib/receipt-layout.ts; aquí sólo se
// traduce ese modelo a bytes. Todo el cuerpo va en negrita (doble golpe) para
// que el ticket se lea bien en papel térmico.
import { turkanaLogo } from "@/lib/logo-raster";
import { layoutReceipt, type RasterLogo, type ReceiptData, type LineSize } from "@/lib/receipt-layout";

// Los tipos y las etiquetas viven en receipt-layout; se reexportan para que el
// resto de la app siga importando desde "@/lib/escpos" como hasta ahora.
export * from "@/lib/receipt-layout";

const stripAccents = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "");

// ── Comandos ESC/POS ─────────────────────────────────────────────────────────
const ESC = 0x1b, GS = 0x1d;

// 0x00 normal · 0x01 doble alto · 0x11 doble alto y ancho
const SIZE_BYTE: Record<LineSize, number> = { n: 0x00, tall: 0x01, big: 0x11 };

export function buildReceipt(d: ReceiptData, logo: RasterLogo | undefined = turkanaLogo()): Uint8Array {
  const bytes: number[] = [];
  const enc = (s: string) => { for (const ch of stripAccents(s)) bytes.push(ch.charCodeAt(0) & 0xff); };
  const cmd = (...b: number[]) => bytes.push(...b);

  // El alineado y el tamaño son de estado en la impresora: sólo se manda el
  // comando cuando cambian, para no inflar el trabajo de impresión.
  let curAlign = "";
  let curSize: LineSize = "n";
  const setAlign = (a: "l" | "c") => {
    if (curAlign === a) return;
    curAlign = a;
    cmd(ESC, 0x61, a === "c" ? 0x01 : 0x00);
  };
  const setSize = (s: LineSize) => {
    if (curSize === s) return;
    curSize = s;
    cmd(GS, 0x21, SIZE_BYTE[s]);
  };

  cmd(ESC, 0x40);                 // init
  cmd(ESC, 0x45, 0x01);           // negrita en todo el ticket: clave en térmica
  setAlign("c");

  for (const ln of layoutReceipt(d)) {
    if (ln.kind === "logo") {
      // Logo Turkana en mapa de bits; si no se pudo cargar, cae al nombre en
      // texto grande para que el ticket nunca salga descabezado.
      if (logo) {
        setSize("n");
        cmd(GS, 0x76, 0x30, 0x00,
          logo.widthBytes & 0xff, (logo.widthBytes >> 8) & 0xff,
          logo.height & 0xff, (logo.height >> 8) & 0xff);
        for (const b of logo.data) bytes.push(b);
      } else {
        setSize("big");
        enc(ln.fallback);
      }
      bytes.push(0x0a);
      continue;
    }
    if (ln.kind === "feed") { cmd(ESC, 0x64, ln.lines); continue; }
    if (ln.kind === "cut") { cmd(GS, 0x56, 0x42, 0x00); continue; } // corte parcial

    setAlign(ln.align);
    setSize(ln.size);
    enc(ln.text);
    bytes.push(0x0a);
  }

  setSize("n");
  cmd(ESC, 0x45, 0x00);           // fin de negrita

  return new Uint8Array(bytes);
}
