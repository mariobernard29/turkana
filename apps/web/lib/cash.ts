// Cuadre de caja: fuente ÚNICA de los totales de un turno (antes había dos
// implementaciones divergentes en pos/actions.ts y pos/caja-actions.ts).
// Puro (sin acceso a BD) para poder usarse igual en servidor y cliente.
import { methodLabel } from "@/lib/payments";

export type CashMovementRow = {
  type: string;
  method: string | null;
  amount_cents: number;
  reference_type?: string | null;
  notes?: string | null;
  created_at?: string;
};

export type CashTotals = {
  openingFloat: number;
  // Dinero que debe estar en caja/terminal al cierre (expectedCash INCLUYE el fondo inicial).
  expectedCash: number;
  expectedDebit: number;
  expectedCredit: number;
  expectedAmex: number;
  expectedTransfer: number;
  expectedCard: number; // 'card' legacy (tarjeta sin separar); 0 en turnos nuevos
  // Conteos e informativos.
  salesCount: number;
  discountsCents: number;
  refundsCents: number;
  dropsCents: number;
  precutsCents: number;
  expensesCents: number;
  outsCents: number;
  layawayInCents: number; // abonos de apartado cobrados en el turno (cualquier método)
  creditInCents: number;  // abonos a cuentas de crédito cobrados en el turno
  otherInCents: number;   // entradas manuales / sin referencia
  creditSalesCents: number; // FIADO del turno: venta sin dinero, no entra a ningún esperado
};

const emptyCashTotals = (openingFloat = 0): CashTotals => ({
  openingFloat,
  expectedCash: openingFloat, expectedDebit: 0, expectedCredit: 0,
  expectedAmex: 0, expectedTransfer: 0, expectedCard: 0,
  salesCount: 0, discountsCents: 0, refundsCents: 0, dropsCents: 0, precutsCents: 0,
  expensesCents: 0, outsCents: 0,
  layawayInCents: 0, creditInCents: 0, otherInCents: 0, creditSalesCents: 0,
});

// Suma o resta al bucket del método de pago. 'credit'/'layaway' no son dinero:
// el fiado se contabiliza aparte y el apartado ya entró como abono.
function applyToMethod(t: CashTotals, method: string | null, amount: number) {
  switch (method) {
    case "debit": t.expectedDebit += amount; break;
    case "credit_card": t.expectedCredit += amount; break;
    case "amex": t.expectedAmex += amount; break;
    case "transfer": t.expectedTransfer += amount; break;
    case "card": t.expectedCard += amount; break; // ventas antiguas
    case "credit": case "layaway": break;
    default: t.expectedCash += amount; break;     // 'cash' y movimientos sin método
  }
}

export function computeCashTotals(
  openingFloatCents: number,
  movements: CashMovementRow[],
  discountsCents = 0,
): CashTotals {
  const t = emptyCashTotals(openingFloatCents);
  t.discountsCents = discountsCents;

  for (const m of movements) {
    const amt = m.amount_cents ?? 0;
    switch (m.type) {
      case "sale":
        t.salesCount++;
        // Fiado: la venta se registra pero no entró dinero al turno.
        if (m.method === "credit") t.creditSalesCents += amt;
        else applyToMethod(t, m.method, amt);
        break;

      case "in":
        // Abonos de apartado/crédito y entradas manuales: suman al bucket de SU
        // método (el bug histórico era mandarlos siempre a efectivo).
        applyToMethod(t, m.method, amt);
        if (m.reference_type === "layaway") t.layawayInCents += amt;
        else if (m.reference_type === "credit") t.creditInCents += amt;
        else t.otherInCents += amt;
        break;

      case "refund":
        t.refundsCents += amt;
        applyToMethod(t, m.method, -amt);
        break;

      case "drop": // resguardo a caja fuerte: siempre efectivo
        t.dropsCents += amt;
        t.expectedCash -= amt;
        break;

      case "expense":
        t.expensesCents += amt;
        applyToMethod(t, m.method, -amt);
        break;

      case "out":
        t.outsCents += amt;
        applyToMethod(t, m.method, -amt);
        break;

      case "precut": // foto parcial del turno: no altera los esperados
        t.precutsCents += amt;
        break;
    }
  }

  return t;
}

// ── Etiquetas compartidas por correo, ticket y UI del corte ──────────────────
// Un solo lugar para el orden y los nombres (antes duplicados en tres archivos).

export type CashPair = { label: string; cents: number; negative?: boolean };

export function summaryPairs(t: CashTotals): CashPair[] {
  const pairs: CashPair[] = [{ label: "Fondo inicial", cents: t.openingFloat }];
  if (t.discountsCents > 0) pairs.push({ label: "Descuentos otorgados", cents: t.discountsCents, negative: true });
  if (t.refundsCents > 0) pairs.push({ label: "Reembolsos / cambios", cents: t.refundsCents, negative: true });
  if (t.dropsCents > 0) pairs.push({ label: "Resguardos", cents: t.dropsCents, negative: true });
  if (t.expensesCents > 0) pairs.push({ label: "Gastos", cents: t.expensesCents, negative: true });
  if (t.outsCents > 0) pairs.push({ label: "Salidas", cents: t.outsCents, negative: true });
  if (t.precutsCents > 0) pairs.push({ label: "Precortes", cents: t.precutsCents });
  if (t.layawayInCents > 0) pairs.push({ label: "Abonos de apartado", cents: t.layawayInCents });
  if (t.creditInCents > 0) pairs.push({ label: "Abonos de crédito", cents: t.creditInCents });
  if (t.otherInCents > 0) pairs.push({ label: "Otras entradas", cents: t.otherInCents });
  if (t.creditSalesCents > 0) pairs.push({ label: "Fiado del turno (sin cobro)", cents: t.creditSalesCents });
  return pairs;
}

export function expectedPairs(t: CashTotals): CashPair[] {
  const pairs: CashPair[] = [
    { label: "Efectivo esperado", cents: t.expectedCash },
    { label: "Débito esperado", cents: t.expectedDebit },
    { label: "Crédito esperado", cents: t.expectedCredit },
    { label: "Amex esperado", cents: t.expectedAmex },
    { label: "Transferencia esperada", cents: t.expectedTransfer },
  ];
  if (t.expectedCard !== 0) pairs.push({ label: "Tarjeta (histórico)", cents: t.expectedCard });
  return pairs;
}

export function countedPairs(c: {
  cash: number; debit: number; credit: number; amex: number; transfer: number;
}): CashPair[] {
  return [
    { label: "Efectivo contado", cents: c.cash },
    { label: "Débito contado", cents: c.debit },
    { label: "Crédito contado", cents: c.credit },
    { label: "Amex contado", cents: c.amex },
    { label: "Transferencia contada", cents: c.transfer },
  ];
}

export const CASH_TYPE_LABEL: Record<string, string> = {
  sale: "Venta",
  refund: "Reembolso",
  in: "Entrada",
  out: "Salida",
  drop: "Resguardo",
  expense: "Gasto",
  precut: "Precorte",
};

// Movimientos que restan dinero (para pintarlos en negativo).
export const CASH_NEGATIVE_TYPES = ["refund", "out", "drop", "expense"];

export function movementLabel(type: string, method: string | null): string {
  const t = CASH_TYPE_LABEL[type] ?? type;
  return method ? `${t} · ${methodLabel(method)}` : t;
}
