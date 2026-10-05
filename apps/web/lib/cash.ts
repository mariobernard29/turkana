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
  // Lo VENDIDO en el turno (dinero cobrado por ventas), sin fondo ni fiado.
  // El esperado de efectivo trae el fondo dentro y se leía como "venta + fondo".
  salesCents: number;
  salesByMethod: Record<string, number>;
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
  salesCents: 0, salesByMethod: {},
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
        else {
          applyToMethod(t, m.method, amt);
          // 'layaway' es la liquidación de un apartado: su dinero ya entró como abonos.
          if (m.method !== "layaway") {
            const k = m.method ?? "cash";
            t.salesCents += amt;
            t.salesByMethod[k] = (t.salesByMethod[k] ?? 0) + amt;
          }
        }
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

export type CashPair = { label: string; cents: number; negative?: boolean; indent?: boolean; strong?: boolean };

// Orden fijo del desglose de la venta por método.
const SALE_METHOD_ORDER = ["cash", "debit", "credit_card", "amex", "transfer", "card"];

export function summaryPairs(t: CashTotals): CashPair[] {
  const pairs: CashPair[] = [{ label: "Venta del turno (sin fondo)", cents: t.salesCents, strong: true }];
  const rank = (m: string) => {
    const i = SALE_METHOD_ORDER.indexOf(m);
    return i < 0 ? SALE_METHOD_ORDER.length : i;
  };
  const methods = Object.keys(t.salesByMethod).sort((a, b) => rank(a) - rank(b));
  for (const m of methods) {
    if (t.salesByMethod[m] !== 0) pairs.push({ label: methodLabel(m), cents: t.salesByMethod[m], indent: true });
  }
  pairs.push({ label: "Fondo inicial", cents: t.openingFloat });
  if (t.discountsCents > 0) pairs.push({ label: "Descuentos otorgados", cents: t.discountsCents, negative: true });
  if (t.refundsCents > 0) pairs.push({ label: "Reembolsos / cambios", cents: t.refundsCents, negative: true });
  if (t.dropsCents > 0) pairs.push({ label: "Resguardos", cents: t.dropsCents, negative: true });
  if (t.expensesCents > 0) pairs.push({ label: "Gastos", cents: t.expensesCents, negative: true });
  if (t.outsCents > 0) pairs.push({ label: "Salidas", cents: t.outsCents, negative: true });
  if (t.precutsCents > 0) pairs.push({ label: "Precortes", cents: t.precutsCents });
  if (t.layawayInCents > 0) pairs.push({ label: "Abonos de apartado", cents: t.layawayInCents });
  if (t.creditInCents > 0) pairs.push({ label: "Abonos de crédito", cents: t.creditInCents });
  if (t.otherInCents > 0) pairs.push({ label: "Ingresos a caja", cents: t.otherInCents });
  if (t.creditSalesCents > 0) pairs.push({ label: "Fiado del turno (sin cobro)", cents: t.creditSalesCents });
  return pairs;
}

export function expectedPairs(t: CashTotals): CashPair[] {
  const pairs: CashPair[] = [
    // El cajón se cuenta con el fondo dentro; por eso se aclara y se da aparte
    // lo que corresponde entregar.
    { label: "Efectivo esperado (con fondo)", cents: t.expectedCash },
    { label: "A entregar (sin fondo)", cents: t.expectedCash - t.openingFloat, indent: true },
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
