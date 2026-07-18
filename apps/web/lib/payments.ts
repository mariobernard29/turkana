// Fuente única de los métodos de pago del sistema (etiquetas, tipos, agrupaciones).
// Tarjeta presencial (POS) separada en débito / crédito / American Express.
// Notas de claves:
//   - 'card'   = tarjeta presencial LEGACY (ventas antiguas); se sigue mostrando "Tarjeta".
//   - 'stripe' = pago en línea con tarjeta (no se separa por tipo).
//   - 'credit' = CRÉDITO DE CUENTA / fiado (no es tarjeta).

export type PaymentMethod =
  | "cash"
  | "debit"
  | "credit_card"
  | "amex"
  | "transfer"
  | "rewards"
  | "stripe"
  | "oxxo"
  | "credit"
  | "layaway"
  | "card";

export const METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  debit: "Débito",
  credit_card: "Crédito",
  amex: "American Express",
  transfer: "Transferencia",
  rewards: "Rewards",
  stripe: "Tarjeta (online)",
  oxxo: "OXXO",
  credit: "Crédito (cuenta)",
  layaway: "Apartado",
  card: "Tarjeta",
};

export function methodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method;
}

// Tarjetas presenciales (para desglose en corte/reportes).
export const CARD_METHODS = ["debit", "credit_card", "amex"] as const;
export type CardMethod = (typeof CARD_METHODS)[number];

// Botones rápidos de cobro con tarjeta en el POS.
export const POS_CARD_BUTTONS: { key: CardMethod; label: string }[] = [
  { key: "debit", label: "Débito" },
  { key: "credit_card", label: "Crédito" },
  { key: "amex", label: "Amex" },
];

// Métodos presenciales que se registran en caja (para selects y filtros del POS/movimientos).
export const POS_METHODS: { key: string; label: string }[] = [
  { key: "cash", label: "Efectivo" },
  { key: "debit", label: "Débito" },
  { key: "credit_card", label: "Crédito" },
  { key: "amex", label: "American Express" },
  { key: "transfer", label: "Transferencia" },
];
