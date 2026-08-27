// El contenido de los reportes en PDF: qué indicador va en qué tarjeta y qué
// columnas lleva cada tabla. El armado vive aquí y no en la acción de servidor
// para poder generarlos también fuera de una petición (pruebas, revisiones).
import { formatMXN } from "@/lib/utils";
import { formatStoreDate } from "@/lib/dates";
import { methodLabel } from "@/lib/payments";
import { ReportPdf } from "@/lib/pdf-doc";
import {
  loadPieces, loadReport, resolveRange,
  type PiecesFilters, type Range,
} from "@/lib/reports";

/** Un PDF listo para bajar: los bytes y el nombre con que se guarda. */
export type PdfRes = { ok: boolean; error?: string; fileBase64?: string; fileName?: string };

const CANAL_LABEL: Record<string, string> = { pos: "Mostrador", ecommerce: "Tienda en línea" };

// "01/08/2026 al 26/08/2026". El rango termina en la medianoche del día
// siguiente, así que para el texto se resta un instante y no se anuncia un día de más.
function periodoTexto(from: Date, to: Date): string {
  const fin = new Date(to.getTime() - 1000);
  const a = formatStoreDate(from);
  const b = formatStoreDate(fin);
  return a === b ? a : `${a} al ${b}`;
}

function nombreArchivo(base: string, from: Date, to: Date): string {
  const key = (d: Date) => formatStoreDate(d, { year: "numeric", month: "2-digit", day: "2-digit" })
    .split("/").reverse().join("-");
  return `${base}-${key(from)}-a-${key(new Date(to.getTime() - 1000))}.pdf`;
}

async function entregar(pdf: ReportPdf, fileName: string): Promise<PdfRes> {
  const bytes = await pdf.finish();
  return { ok: true, fileName, fileBase64: Buffer.from(bytes).toString("base64") };
}

/** Resumen del periodo: indicadores, métodos de pago, top de productos y vendedores. */
export async function buildKpiPdf(
  range: Range,
  desde?: string,
  hasta?: string,
): Promise<PdfRes> {
  try {
    const { from, to, label } = resolveRange(range, desde, hasta);
    const r = await loadReport(from, to);

    const pdf = await ReportPdf.create(
      "Reporte de ventas",
      `${label} · ${periodoTexto(from, to)}`,
    );

    await pdf.kpis([
      { label: "Ventas del periodo", value: formatMXN(r.sales.total), hint: `${r.sales.count} ventas` },
      { label: "Piezas vendidas", value: String(r.pieces), hint: `${r.productosDistintos} modelos distintos` },
      { label: "Ticket promedio", value: formatMXN(r.sales.avg) },
      { label: "Mostrador", value: formatMXN(r.sales.pos) },
      { label: "Tienda en línea", value: formatMXN(r.sales.online) },
      { label: "Servicios vendidos", value: String(r.services), hint: `${r.piercings} perforaciones` },
      { label: "Descuentos otorgados", value: formatMXN(r.sales.discounts) },
      { label: "Rewards generados", value: formatMXN(r.sales.rewardsEarned), hint: `Canjeados ${formatMXN(r.sales.rewardsRedeemed)}` },
      { label: "Clientes atendidos", value: String(r.clientes.atendidos), hint: `${r.clientes.nuevos} nuevos` },
      { label: "Créditos por cobrar", value: formatMXN(r.creditOutstanding) },
      { label: "Apartados activos", value: String(r.layawaysActive), hint: `Saldo ${formatMXN(r.layawayPending)}` },
      { label: "Variantes agotadas", value: String(r.outOfStock) },
    ]);

    await pdf.heading("Quién vendió");
    if (r.sellers.length === 0) {
      await pdf.emptyNote("Sin ventas en el periodo.");
    } else {
      await pdf.table(
        [
          { header: "Vendedor" },
          { header: "Ventas", align: "right", width: 70 },
          { header: "Piezas", align: "right", width: 70 },
          { header: "Importe", align: "right", width: 100 },
          { header: "Promedio", align: "right", width: 90 },
        ],
        r.sellers.map((s) => [
          s.name,
          String(s.orders),
          String(s.qty),
          formatMXN(s.total),
          formatMXN(s.orders ? Math.round(s.total / s.orders) : 0),
        ]),
        [
          "Total",
          String(r.sales.count),
          String(r.pieces),
          formatMXN(r.sales.total),
          formatMXN(r.sales.avg),
        ],
      );
    }

    await pdf.heading("Productos más vendidos por pieza");
    if (r.topByQty.length === 0) {
      await pdf.emptyNote("Sin ventas en el periodo.");
    } else {
      await pdf.table(
        [
          { header: "Código", width: 110 },
          { header: "Producto" },
          { header: "Piezas", align: "right", width: 70 },
          { header: "Importe", align: "right", width: 100 },
        ],
        r.topByQty.map((p) => [p.sku || "—", p.name, String(p.qty), formatMXN(p.total)]),
      );
    }

    await pdf.heading("Productos que más dejaron");
    if (r.topByAmount.length === 0) {
      await pdf.emptyNote("Sin ventas en el periodo.");
    } else {
      await pdf.table(
        [
          { header: "Código", width: 110 },
          { header: "Producto" },
          { header: "Piezas", align: "right", width: 70 },
          { header: "Importe", align: "right", width: 100 },
        ],
        r.topByAmount.map((p) => [p.sku || "—", p.name, String(p.qty), formatMXN(p.total)]),
      );
    }

    await pdf.heading("Métodos de pago");
    if (r.methods.length === 0) {
      await pdf.emptyNote("Sin pagos en el periodo.");
    } else {
      const totalPagos = r.methods.reduce((s, [, v]) => s + v, 0);
      await pdf.table(
        [
          { header: "Método" },
          { header: "Importe", align: "right", width: 120 },
          { header: "Participación", align: "right", width: 100 },
        ],
        r.methods.map(([m, v]) => [
          methodLabel(m),
          formatMXN(v),
          totalPagos ? `${((v / totalPagos) * 100).toFixed(1)}%` : "0%",
        ]),
        ["Total cobrado", formatMXN(totalPagos), "100%"],
      );
    }

    return entregar(pdf, nombreArchivo("reporte-ventas", from, to));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo generar el PDF" };
  }
}

/** Detalle de piezas vendidas: un renglón por código, para contar contra inventario. */
export async function buildPiecesPdf(
  range: Range,
  desde: string | undefined,
  hasta: string | undefined,
  filters: PiecesFilters,
): Promise<PdfRes> {
  try {
    const { from, to, label } = resolveRange(range, desde, hasta);
    const r = await loadPieces(from, to, filters);

    const canal = filters.canal ? ` · ${CANAL_LABEL[filters.canal] ?? filters.canal}` : "";
    const pdf = await ReportPdf.create(
      "Piezas vendidas",
      `${label} · ${periodoTexto(from, to)}${canal}`,
    );

    await pdf.kpis([
      { label: "Piezas vendidas", value: String(r.piezas) },
      { label: "Importe de las piezas", value: formatMXN(r.importe) },
      { label: "Modelos distintos", value: String(r.rows.length), hint: `${r.ventas} ventas` },
    ]);

    if (!filters.incluirServicios) {
      await pdf.paragraph("No se incluyen servicios (perforaciones, grabados): sólo piezas de inventario.");
    }

    await pdf.heading("Detalle por código");
    if (r.rows.length === 0) {
      await pdf.emptyNote("No se vendió nada en el periodo con estos filtros.");
    } else {
      await pdf.table(
        [
          { header: "Código", width: 110 },
          { header: "Producto" },
          { header: "Piezas", align: "right", width: 70 },
          { header: "Importe", align: "right", width: 100 },
        ],
        r.rows.map((p) => [p.sku || "—", p.name, String(p.qty), formatMXN(p.total)]),
        ["Total", "", String(r.piezas), formatMXN(r.importe)],
      );
    }

    return entregar(pdf, nombreArchivo("piezas-vendidas", from, to));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo generar el PDF" };
  }
}
