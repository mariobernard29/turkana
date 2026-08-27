// Armador de reportes en PDF con la identidad de Turkana.
//
// Es un ayudante pequeño a propósito: pdf-lib sólo sabe poner texto en una
// coordenada, así que aquí vive lo que un reporte necesita de verdad —portada
// con logo y datos de la tienda, títulos, tiras de indicadores, tablas que se
// parten solas en varias hojas y pie con folio de páginas—. Los reportes de
// `lib/report-pdf.ts` sólo describen su contenido.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { STORE } from "@/lib/business";
import { formatStore } from "@/lib/dates";
import { turkanaLogoPng, turkanaLogoRatio } from "@/lib/pdf-logo";

// Carta en puntos (72 por pulgada), que es lo que hay en cualquier impresora de aquí.
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

const INK = rgb(0.17, 0.17, 0.17);
const MUTED = rgb(0.45, 0.45, 0.45);
const GOLD = rgb(0.63, 0.55, 0.42);
const HAIRLINE = rgb(0.87, 0.86, 0.84);
const BAND = rgb(0.98, 0.97, 0.96);

export type Align = "left" | "right" | "center";

/** Una columna de tabla. `width` va en puntos; lo que sobra se reparte. */
export type Column = {
  header: string;
  align?: Align;
  width?: number;
};

export type Kpi = { label: string; value: string; hint?: string };

// Las fuentes estándar del PDF usan WinAnsi, que trae acentos y ñ pero no
// emojis ni comillas tipográficas raras. Se limpia antes de escribir para que
// un carácter suelto no tumbe la generación entera.
const REPLACEMENTS: [RegExp, string][] = [
  [/[‘’‛]/g, "'"],
  [/[“”]/g, '"'],
  [/[–—]/g, "-"],
  [/…/g, "..."],
  [/ /g, " "],
];

function clean(text: string): string {
  let out = text;
  for (const [re, to] of REPLACEMENTS) out = out.replace(re, to);
  // Todo lo que quede fuera de Latin-1 (emojis, símbolos) se cae: la fuente
  // estándar del PDF no los tiene y pdf-lib avienta error en vez de ignorarlos.
  return out.replace(/[^ -ÿ]/g, "");
}

/** Corta el texto con puntos suspensivos si no cabe en el ancho dado. */
function fit(text: string, font: PDFFont, size: number, width: number): string {
  const t = clean(text);
  if (font.widthOfTextAtSize(t, size) <= width) return t;
  let lo = 0;
  let hi = t.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (font.widthOfTextAtSize(`${t.slice(0, mid)}...`, size) <= width) lo = mid;
    else hi = mid - 1;
  }
  return `${t.slice(0, lo)}...`;
}

type Fonts = { regular: PDFFont; bold: PDFFont; serif: PDFFont };

export class ReportPdf {
  private doc!: PDFDocument;
  private fonts!: Fonts;
  private page!: PDFPage;
  private y = 0;
  private pages: PDFPage[] = [];

  private readonly title: string;
  private readonly subtitle: string;

  private constructor(title: string, subtitle: string) {
    this.title = title;
    this.subtitle = subtitle;
  }

  static async create(title: string, subtitle: string): Promise<ReportPdf> {
    const r = new ReportPdf(title, subtitle);
    r.doc = await PDFDocument.create();
    r.doc.setTitle(`${title} - ${STORE.brand}`);
    r.doc.setProducer("Turkana");
    r.fonts = {
      regular: await r.doc.embedFont(StandardFonts.Helvetica),
      bold: await r.doc.embedFont(StandardFonts.HelveticaBold),
      serif: await r.doc.embedFont(StandardFonts.TimesRoman),
    };
    await r.newPage(true);
    return r;
  }

  private async newPage(first: boolean) {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.pages.push(this.page);
    this.y = PAGE_H - MARGIN;
    if (first) await this.header();
    else this.y -= 12;
  }

  // Encabezado de la primera hoja: logo, domicilio y el título del reporte.
  private async header() {
    const png = await this.doc.embedPng(turkanaLogoPng());
    const logoW = 150;
    const logoH = logoW / turkanaLogoRatio();
    this.page.drawImage(png, { x: MARGIN, y: this.y - logoH, width: logoW, height: logoH });

    // Domicilio y contacto alineados a la derecha, a la altura del logo.
    let ty = this.y - 8;
    const datos = [...STORE.addressLines, `Tel. ${STORE.phone}`, STORE.instagram];
    for (const linea of datos) {
      const t = clean(linea);
      const w = this.fonts.regular.widthOfTextAtSize(t, 8);
      this.page.drawText(t, {
        x: PAGE_W - MARGIN - w, y: ty, size: 8, font: this.fonts.regular, color: MUTED,
      });
      ty -= 11;
    }

    this.y -= Math.max(logoH, datos.length * 11) + 18;
    this.rule();
    this.y -= 26;

    this.page.drawText(clean(this.title), {
      x: MARGIN, y: this.y, size: 20, font: this.fonts.serif, color: INK,
    });
    this.y -= 16;
    this.page.drawText(clean(this.subtitle), {
      x: MARGIN, y: this.y, size: 9.5, font: this.fonts.regular, color: MUTED,
    });
    this.y -= 24;
  }

  private rule() {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_W - MARGIN, y: this.y },
      thickness: 0.7,
      color: GOLD,
    });
  }

  /** Reserva alto; si ya no cabe en la hoja, abre otra. */
  private async ensure(needed: number) {
    if (this.y - needed >= MARGIN + 26) return;
    await this.newPage(false);
  }

  async heading(text: string) {
    await this.ensure(46);
    this.y -= 10;
    this.page.drawText(clean(text), {
      x: MARGIN, y: this.y, size: 12.5, font: this.fonts.serif, color: INK,
    });
    this.y -= 6;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_W - MARGIN, y: this.y },
      thickness: 0.5,
      color: HAIRLINE,
    });
    this.y -= 16;
  }

  async paragraph(text: string) {
    await this.ensure(18);
    this.page.drawText(fit(text, this.fonts.regular, 9, CONTENT_W), {
      x: MARGIN, y: this.y, size: 9, font: this.fonts.regular, color: MUTED,
    });
    this.y -= 15;
  }

  /** Indicadores en tarjetas, tres por renglón. */
  async kpis(items: Kpi[]) {
    const perRow = 3;
    const gap = 12;
    const cardW = (CONTENT_W - gap * (perRow - 1)) / perRow;

    for (let i = 0; i < items.length; i += perRow) {
      const fila = items.slice(i, i + perRow);
      const cardH = fila.some((k) => k.hint) ? 62 : 50;
      await this.ensure(cardH + 10);

      fila.forEach((k, j) => {
        const x = MARGIN + j * (cardW + gap);
        const top = this.y;
        this.page.drawRectangle({
          x, y: top - cardH, width: cardW, height: cardH,
          color: BAND, borderColor: HAIRLINE, borderWidth: 0.5,
        });
        this.page.drawText(fit(k.label.toUpperCase(), this.fonts.regular, 7, cardW - 20), {
          x: x + 10, y: top - 17, size: 7, font: this.fonts.regular, color: MUTED,
        });
        this.page.drawText(fit(k.value, this.fonts.bold, 15, cardW - 20), {
          x: x + 10, y: top - 37, size: 15, font: this.fonts.bold, color: INK,
        });
        if (k.hint) {
          this.page.drawText(fit(k.hint, this.fonts.regular, 7.5, cardW - 20), {
            x: x + 10, y: top - 51, size: 7.5, font: this.fonts.regular, color: MUTED,
          });
        }
      });

      this.y -= cardH + gap;
    }
    this.y -= 4;
  }

  /**
   * Tabla con encabezado que se repite si el contenido pasa a otra hoja.
   * `total` pinta un último renglón resaltado.
   */
  async table(columns: Column[], rows: string[][], total?: string[]) {
    const fixed = columns.reduce((s, c) => s + (c.width ?? 0), 0);
    const flex = columns.filter((c) => !c.width).length;
    const rest = flex ? (CONTENT_W - fixed) / flex : 0;
    const widths = columns.map((c) => c.width ?? rest);

    const rowH = 17;
    const drawRow = (cells: string[], font: PDFFont, size: number, color = INK) => {
      let x = MARGIN;
      cells.forEach((cell, i) => {
        const w = widths[i];
        const align = columns[i]?.align ?? "left";
        const t = fit(cell, font, size, w - 8);
        const tw = font.widthOfTextAtSize(t, size);
        const tx = align === "right" ? x + w - tw - 4 : align === "center" ? x + (w - tw) / 2 : x + 4;
        this.page.drawText(t, { x: tx, y: this.y - 12, size, font, color });
        x += w;
      });
      this.y -= rowH;
    };

    const head = () => {
      this.page.drawRectangle({
        x: MARGIN, y: this.y - rowH, width: CONTENT_W, height: rowH, color: BAND,
      });
      drawRow(columns.map((c) => c.header.toUpperCase()), this.fonts.bold, 7.5, MUTED);
    };

    await this.ensure(rowH * 3);
    head();

    for (const row of rows) {
      if (this.y - rowH < MARGIN + 26) {
        await this.newPage(false);
        head();
      }
      this.page.drawLine({
        start: { x: MARGIN, y: this.y },
        end: { x: PAGE_W - MARGIN, y: this.y },
        thickness: 0.4,
        color: HAIRLINE,
      });
      drawRow(row, this.fonts.regular, 8.5);
    }

    if (total) {
      if (this.y - rowH < MARGIN + 26) await this.newPage(false);
      this.page.drawLine({
        start: { x: MARGIN, y: this.y },
        end: { x: PAGE_W - MARGIN, y: this.y },
        thickness: 0.8,
        color: GOLD,
      });
      drawRow(total, this.fonts.bold, 9);
    }

    this.y -= 10;
  }

  async emptyNote(text: string) {
    await this.paragraph(text);
  }

  /** Cierra el documento: pie con folio de páginas y bytes listos. */
  async finish(): Promise<Uint8Array> {
    const sello = `Generado el ${formatStore(new Date())} - ${STORE.brand}`;
    this.pages.forEach((p, i) => {
      const pie = clean(`${sello}   |   Pagina ${i + 1} de ${this.pages.length}`);
      const w = this.fonts.regular.widthOfTextAtSize(pie, 7.5);
      p.drawLine({
        start: { x: MARGIN, y: MARGIN - 6 },
        end: { x: PAGE_W - MARGIN, y: MARGIN - 6 },
        thickness: 0.5,
        color: HAIRLINE,
      });
      p.drawText(pie, {
        x: (PAGE_W - w) / 2, y: MARGIN - 18, size: 7.5, font: this.fonts.regular, color: MUTED,
      });
    });
    return this.doc.save();
  }
}
