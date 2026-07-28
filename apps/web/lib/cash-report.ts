// Consultas del corte de caja. Fuente única para el correo, el ticket impreso y
// la UI (antes la lista de "ventas del lote" vivía dentro de notifyCashCut).
// Módulo de servidor normal (NO "use server"): recibe el cliente de BD.
import { createAdminClient } from "@/lib/supabase/admin";
import { computeCashTotals, type CashMovementRow, type CashTotals } from "@/lib/cash";

type DB = ReturnType<typeof createAdminClient>;

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

// ── Totales del turno ────────────────────────────────────────────────────────
export async function loadSessionTotals(db: DB, sessionId: string): Promise<CashTotals> {
  const { data: sess } = await db
    .from("cash_sessions").select("opening_float_cents").eq("id", sessionId).maybeSingle();
  const opening = (sess as { opening_float_cents: number } | null)?.opening_float_cents ?? 0;

  const { data: movs } = await db
    .from("cash_movements").select("type, method, amount_cents, reference_type").eq("session_id", sessionId);

  // Descuentos otorgados en las ventas de este turno.
  const { data: ords } = await db.from("orders").select("discount_cents").eq("cash_session_id", sessionId);
  const discounts = ((ords as unknown as { discount_cents: number }[]) ?? [])
    .reduce((s, o) => s + (o.discount_cents ?? 0), 0);

  return computeCashTotals(opening, (movs as unknown as CashMovementRow[]) ?? [], discounts);
}

// ── Turnos abiertos ──────────────────────────────────────────────────────────
// El turno es POR CAJERO: si dos personas usan el POS, cada una corta el suyo.
// Sin esta lista era imposible notar que había dinero en el turno de alguien más.
export type OpenSession = {
  id: string;
  lote: string;
  cashier: string;
  registerName: string;
  openedAt: string;
  expectedCash: number;
  salesCount: number;
};

export async function loadOpenSessions(db: DB): Promise<OpenSession[]> {
  const { data } = await db
    .from("cash_sessions")
    .select("id, opened_at, opening_float_cents, cashier_id, cash_registers(name)")
    .eq("status", "open")
    .order("opened_at", { ascending: true });
  const sessions = (data as unknown as {
    id: string; opened_at: string; opening_float_cents: number; cashier_id: string | null;
    cash_registers: { name: string } | { name: string }[] | null;
  }[]) ?? [];
  if (!sessions.length) return [];

  const ids = sessions.map((s) => s.id);
  const names = new Map<string, string>();
  const cashierIds = [...new Set(sessions.map((s) => s.cashier_id).filter(Boolean) as string[])];
  if (cashierIds.length) {
    const { data: profs } = await db.from("profiles").select("id, full_name").in("id", cashierIds);
    for (const p of (profs as unknown as { id: string; full_name: string }[]) ?? []) names.set(p.id, p.full_name);
  }

  const { data: movs } = await db
    .from("cash_movements").select("session_id, type, method, amount_cents, reference_type").in("session_id", ids);
  const bySession = new Map<string, CashMovementRow[]>();
  for (const m of (movs as unknown as (CashMovementRow & { session_id: string })[]) ?? []) {
    const list = bySession.get(m.session_id) ?? [];
    list.push(m);
    bySession.set(m.session_id, list);
  }

  return sessions.map((s) => {
    const totals = computeCashTotals(s.opening_float_cents, bySession.get(s.id) ?? []);
    return {
      id: s.id,
      lote: s.id.slice(0, 8),
      cashier: s.cashier_id ? names.get(s.cashier_id) ?? "—" : "—",
      registerName: one(s.cash_registers)?.name ?? "Caja",
      openedAt: s.opened_at,
      expectedCash: totals.expectedCash,
      salesCount: totals.salesCount,
    };
  });
}

// ── Reporte completo del corte ───────────────────────────────────────────────
export type SessionSale = {
  orderNumber: string;
  totalCents: number;
  createdAt: string;
  items: { name: string; quantity: number; total_cents: number }[];
  methods: string[];
  // 'layaway' = apartado liquidado (el dinero entró en turnos anteriores)
  // 'credit'  = fiado (no entró dinero)
  kind: "sale" | "layaway" | "credit";
  // Cancelada después del corte: el dinero de este turno sí entró, se devolvió luego.
  cancelled: boolean;
};

export type SessionMovement = {
  type: string;
  method: string | null;
  amountCents: number;
  referenceType: string | null;
  notes: string | null;
  createdAt: string;
};

export type CashCutReport = {
  sessionId: string;
  lote: string;
  registerName: string;
  cashier: string;
  openedAt: string;
  closedAt: string | null;
  peopleServed: number;
  totals: CashTotals;
  counted: { cash: number; debit: number; credit: number; amex: number; transfer: number };
  difference: number;
  sales: SessionSale[];
  movements: SessionMovement[];
};

type SessionRow = {
  id: string;
  opened_at: string;
  closed_at: string | null;
  opening_float_cents: number;
  counted_cash_cents: number | null;
  counted_debit_cents: number | null;
  counted_credit_cents: number | null;
  counted_amex_cents: number | null;
  counted_transfer_cents: number | null;
  difference_cents: number | null;
  people_served: number | null;
  cashier_id: string | null;
  closed_by: string | null;
  cash_registers: { name: string } | { name: string }[] | null;
};

type OrderRow = {
  order_number: string;
  total_cents: number;
  created_at: string;
  status: string;
  order_items: { name: string; quantity: number; total_cents: number }[] | null;
  payments: { method: string; amount_cents: number }[] | null;
};

export async function loadCashCutReport(db: DB, sessionId: string): Promise<CashCutReport | null> {
  const { data: sessData } = await db
    .from("cash_sessions")
    .select("id, opened_at, closed_at, opening_float_cents, counted_cash_cents, counted_debit_cents, counted_credit_cents, counted_amex_cents, counted_transfer_cents, difference_cents, people_served, cashier_id, closed_by, cash_registers(name)")
    .eq("id", sessionId)
    .maybeSingle();
  const sess = sessData as unknown as SessionRow | null;
  if (!sess) return null;

  const [{ data: movsData }, { data: ordsData }] = await Promise.all([
    db.from("cash_movements")
      .select("type, method, amount_cents, reference_type, notes, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true }),
    db.from("orders")
      .select("order_number, total_cents, created_at, status, discount_cents, order_items(name, quantity, total_cents), payments(method, amount_cents)")
      .eq("cash_session_id", sessionId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
  ]);

  const movs = (movsData as unknown as (CashMovementRow & { notes: string | null; created_at: string })[]) ?? [];
  const orders = (ordsData as unknown as (OrderRow & { discount_cents: number })[]) ?? [];
  const discounts = orders.reduce((s, o) => s + (o.discount_cents ?? 0), 0);

  const staffId = sess.closed_by ?? sess.cashier_id;
  let cashier = "—";
  if (staffId) {
    const { data: prof } = await db.from("profiles").select("full_name").eq("id", staffId).maybeSingle();
    cashier = (prof as { full_name: string } | null)?.full_name ?? "—";
  }

  const sales: SessionSale[] = orders.map((o) => {
    const methods = (o.payments ?? []).map((p) => p.method);
    const kind: SessionSale["kind"] =
      methods.length > 0 && methods.every((m) => m === "layaway") ? "layaway"
      : methods.includes("credit") ? "credit"
      : "sale";
    return {
      orderNumber: o.order_number,
      totalCents: o.total_cents,
      createdAt: o.created_at,
      items: o.order_items ?? [],
      methods,
      kind,
      cancelled: o.status === "cancelled",
    };
  });

  return {
    sessionId: sess.id,
    lote: sess.id.slice(0, 8),
    registerName: one(sess.cash_registers)?.name ?? "Caja",
    cashier,
    openedAt: sess.opened_at,
    closedAt: sess.closed_at,
    peopleServed: sess.people_served ?? 0,
    totals: computeCashTotals(sess.opening_float_cents, movs, discounts),
    counted: {
      cash: sess.counted_cash_cents ?? 0,
      debit: sess.counted_debit_cents ?? 0,
      credit: sess.counted_credit_cents ?? 0,
      amex: sess.counted_amex_cents ?? 0,
      transfer: sess.counted_transfer_cents ?? 0,
    },
    difference: sess.difference_cents ?? 0,
    sales,
    movements: movs.map((m) => ({
      type: m.type,
      method: m.method,
      amountCents: m.amount_cents,
      referenceType: m.reference_type ?? null,
      notes: m.notes ?? null,
      createdAt: m.created_at,
    })),
  };
}
