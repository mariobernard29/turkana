"use server";

// Los reportes en PDF que baja el panel. Se arman en el servidor y llegan al
// navegador en base64, igual que la plantilla de Excel del catálogo: así no hay
// que exponer una ruta pública ni mandar los números por la URL.
//
// El contenido vive en lib/report-pdf.ts; aquí sólo se comprueba que quien pide
// el archivo sea del personal.
import { requireStaff } from "@/lib/auth";
import { buildKpiPdf, buildPiecesPdf, type PdfRes } from "@/lib/report-pdf";
import type { PiecesFilters, Range } from "@/lib/reports";

export type { PdfRes };

/** Resumen del periodo: indicadores, vendedores, top de productos y métodos de pago. */
export async function kpiReportPdf(range: Range, desde?: string, hasta?: string): Promise<PdfRes> {
  await requireStaff();
  return buildKpiPdf(range, desde, hasta);
}

/** Detalle de piezas vendidas: un renglón por código, para contar contra inventario. */
export async function piecesReportPdf(
  range: Range,
  desde: string | undefined,
  hasta: string | undefined,
  filters: PiecesFilters,
): Promise<PdfRes> {
  await requireStaff();
  return buildPiecesPdf(range, desde, hasta, filters);
}
