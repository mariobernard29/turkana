// Ticket del corte de caja: mismo contenido que el correo de corte, en 80mm.
// Puro: recibe el reporte ya cargado (lib/cash-report.ts) y arma el ReceiptData.
import { money, type ReceiptData, type ReceiptRow, type ReceiptSection } from "@/lib/escpos";
import { CASH_NEGATIVE_TYPES, countedPairs, expectedPairs, movementLabel, summaryPairs } from "@/lib/cash";
import type { CashCutReport } from "@/lib/cash-report";

const KIND_SUFFIX: Record<string, string> = {
  credit: " (fiado)",
  layaway: " (apartado liquidado)",
  sale: "",
};

const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-MX") : "—");

export function buildCashCutReceipt(r: CashCutReport): ReceiptData {
  const sections: ReceiptSection[] = [];

  // ── Ventas del lote ────────────────────────────────────────────────────────
  const salesRows: ReceiptRow[] = [];
  if (r.sales.length === 0) {
    salesRows.push({ label: "Sin ventas registradas en el lote." });
  } else {
    for (const s of r.sales) {
      salesRows.push({
        label: s.orderNumber + (KIND_SUFFIX[s.kind] ?? "") + (s.cancelled ? " (CANCELADA)" : ""),
        value: money(s.totalCents),
        strong: true,
      });
      for (const it of s.items) {
        salesRows.push({ label: `${it.quantity}x ${it.name}`, value: money(it.total_cents), indent: true });
      }
    }
  }
  sections.push({ title: `Ventas del lote (${r.sales.length})`, rows: salesRows });

  // ── Movimientos de caja (las ventas ya se listaron arriba) ─────────────────
  const movs = r.movements.filter((m) => m.type !== "sale");
  const movRows: ReceiptRow[] = movs.length === 0
    ? [{ label: "Sin movimientos de caja." }]
    : movs.flatMap((m) => {
        const rows: ReceiptRow[] = [{
          label: movementLabel(m.type, m.method),
          value: money(m.amountCents),
          negative: CASH_NEGATIVE_TYPES.includes(m.type),
        }];
        if (m.notes) rows.push({ label: m.notes, indent: true });
        return rows;
      });
  sections.push({ title: "Movimientos de caja", rows: movRows });

  // ── Resumen (mismas etiquetas y orden que el correo) ───────────────────────
  sections.push({
    title: "Resumen del turno",
    rows: [
      // Cuentas del lote (no movimientos de cobro): cuadra con la lista de arriba.
      { label: "Ventas", value: String(r.sales.length) },
      ...summaryPairs(r.totals).map((p) => ({ label: p.label, value: money(p.cents), negative: p.negative })),
    ],
  });

  sections.push({
    title: "Esperado",
    rows: expectedPairs(r.totals).map((p) => ({ label: p.label, value: money(p.cents) })),
  });

  // Un turno abierto (precorte/consulta) todavía no tiene conteo.
  if (r.closedAt) {
    sections.push({
      title: "Contado",
      rows: countedPairs(r.counted).map((p) => ({ label: p.label, value: money(p.cents) })),
    });
  }

  return {
    docType: "corte",
    orderNumber: `CORTE ${r.lote}`,
    attendedBy: r.cashier,
    dateIso: r.closedAt ?? undefined,
    items: [], // el corte no tiene partidas: todo va en secciones
    subtotal: 0,
    tax: 0,
    total: r.difference, // se imprime en el cuadro como DIFERENCIA
    meta: [
      { label: "Caja", value: r.registerName },
      { label: "Lote", value: r.lote },
      { label: "Apertura", value: dt(r.openedAt) },
      { label: "Personas", value: String(r.peopleServed) },
    ],
    sections,
  };
}
