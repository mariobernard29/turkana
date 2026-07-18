"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type DB = ReturnType<typeof createAdminClient>;
type Method = "cash" | "debit" | "credit_card" | "amex" | "transfer";
const pesos = (n: number) => Math.round((n || 0) * 100);

async function tiendaLoc(db: DB): Promise<string | null> {
  const { data } = await db.from("inventory_locations").select("id").eq("key", "tienda").maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function sessionTotals(db: DB, sessionId: string) {
  const { data: sess } = await db.from("cash_sessions").select("opening_float_cents").eq("id", sessionId).maybeSingle();
  const opening = (sess as { opening_float_cents: number } | null)?.opening_float_cents ?? 0;
  const { data: movs } = await db.from("cash_movements").select("type, method, amount_cents").eq("session_id", sessionId);
  let cash = opening, debit = 0, credit = 0, amex = 0, cardLegacy = 0, transfer = 0, sales = 0;
  for (const m of (movs as unknown as { type: string; method: string | null; amount_cents: number }[]) ?? []) {
    const a = m.amount_cents;
    if (m.type === "sale") {
      sales++;
      if (m.method === "cash") cash += a;
      else if (m.method === "debit") debit += a;
      else if (m.method === "credit_card") credit += a;
      else if (m.method === "amex") amex += a;
      else if (m.method === "card") cardLegacy += a;
      else if (m.method === "transfer") transfer += a;
    }
    else if (m.type === "in") cash += a;
    else if (["out", "drop", "expense", "refund"].includes(m.type)) cash -= a;
  }
  return { expectedCash: cash, expectedDebit: debit, expectedCredit: credit, expectedAmex: amex, expectedCard: cardLegacy, expectedTransfer: transfer, salesCount: sales };
}

export type CajaInfo = {
  expectedCash: number; expectedTransfer: number; salesCount: number;
  expectedDebit: number; expectedCredit: number; expectedAmex: number; expectedCard: number;
  thresholdCents: number;
  staff: { id: string; full_name: string }[];
};

export async function getCajaInfo(sessionId: string): Promise<CajaInfo> {
  await requireStaff();
  const db = createAdminClient();
  const totals = await sessionTotals(db, sessionId);
  const { data: setting } = await db.from("app_settings").select("value").eq("key", "cash_drop_threshold_cents").maybeSingle();
  const thresholdCents = Number((setting as { value: string } | null)?.value ?? "0");
  const { data: staff } = await db.from("profiles").select("id, full_name").eq("is_active", true).is("deleted_at", null).order("full_name");
  return { ...totals, thresholdCents, staff: (staff as unknown as { id: string; full_name: string }[]) ?? [] };
}

export type Comprobante = {
  orderNumber: string;
  items: { name: string; quantity: number; total_cents: number }[];
  subtotal: number; tax: number; total: number; method: string;
};

// ── Resguardo (cash drop a caja fuerte) ──────────────────────────────────────
export async function createCashDrop(input: {
  sessionId: string; amountPesos: number; notes?: string;
}): Promise<{ ok: boolean; error?: string; comprobante?: Comprobante }> {
  const staff = await requireStaff();
  const db = createAdminClient();
  const amount = pesos(input.amountPesos);
  if (amount <= 0) return { ok: false, error: "Importe inválido" };

  const { data: setting } = await db.from("app_settings").select("value").eq("key", "cash_drop_threshold_cents").maybeSingle();
  const threshold = Number((setting as { value: string } | null)?.value ?? "0");

  await db.from("cash_drops").insert({ session_id: input.sessionId, amount_cents: amount, responsible_id: staff.id, threshold_cents: threshold, notes: input.notes || null });
  await db.from("cash_movements").insert({ session_id: input.sessionId, type: "drop", amount_cents: amount, reference_id: null, created_by: staff.id, notes: input.notes || "Resguardo a caja fuerte" });

  revalidatePath("/pos");
  return {
    ok: true,
    comprobante: { orderNumber: "RESGUARDO", items: [{ name: `Resguardo · ${staff.fullName}`, quantity: 1, total_cents: amount }], subtotal: amount, tax: 0, total: amount, method: "-" },
  };
}

// ── Precorte (corte parcial / cambio de cajero) ──────────────────────────────
export async function precut(input: {
  sessionId: string; cashPesos: number; debitPesos: number; creditPesos: number; amexPesos: number; transferPesos: number; newCashierId?: string;
}): Promise<{ ok: boolean; error?: string; comprobante?: Comprobante }> {
  const staff = await requireStaff();
  const db = createAdminClient();
  const cash = pesos(input.cashPesos), debit = pesos(input.debitPesos), credit = pesos(input.creditPesos), amex = pesos(input.amexPesos), transfer = pesos(input.transferPesos);
  const card = debit + credit + amex;

  await db.from("cash_movements").insert({
    session_id: input.sessionId, type: "precut", method: "cash", amount_cents: cash,
    notes: `Precorte · débito ${(debit / 100).toFixed(2)} · crédito ${(credit / 100).toFixed(2)} · amex ${(amex / 100).toFixed(2)} · transfer ${(transfer / 100).toFixed(2)}`,
    created_by: staff.id,
  });
  if (input.newCashierId) {
    await db.from("cash_sessions").update({ cashier_id: input.newCashierId }).eq("id", input.sessionId);
  }

  revalidatePath("/pos");
  return {
    ok: true,
    comprobante: {
      orderNumber: "PRECORTE",
      items: [
        { name: "Efectivo", quantity: 1, total_cents: cash },
        { name: "Débito", quantity: 1, total_cents: debit },
        { name: "Crédito", quantity: 1, total_cents: credit },
        { name: "American Express", quantity: 1, total_cents: amex },
        { name: "Transferencias", quantity: 1, total_cents: transfer },
      ],
      subtotal: cash + card + transfer, tax: 0, total: cash + card + transfer, method: "-",
    },
  };
}

// ── Devoluciones ─────────────────────────────────────────────────────────────
export async function registerReturn(input: {
  sessionId: string; variantId: string; qty: number; reason: string; method: Method; refundPesos: number;
}): Promise<{ ok: boolean; error?: string; comprobante?: Comprobante }> {
  const staff = await requireStaff();
  const db = createAdminClient();
  if (input.qty <= 0) return { ok: false, error: "Cantidad inválida" };
  const refund = pesos(input.refundPesos);

  const loc = await tiendaLoc(db);
  if (!loc) return { ok: false, error: "Almacén tienda no configurado" };

  await db.from("returns").insert({
    variant_id: input.variantId, quantity: input.qty, reason: input.reason || null,
    type: "return", refund_cents: refund, responsible_id: staff.id,
  });

  // Reingresar al inventario.
  const { data: row } = await db.from("stock_levels").select("id, quantity").eq("variant_id", input.variantId).eq("location_id", loc).maybeSingle();
  if (row) { const r = row as { id: string; quantity: number }; await db.from("stock_levels").update({ quantity: r.quantity + input.qty, updated_at: new Date().toISOString() }).eq("id", r.id); }
  else { await db.from("stock_levels").insert({ variant_id: input.variantId, location_id: loc, quantity: input.qty }); }
  await db.from("inventory_movements").insert({ variant_id: input.variantId, location_id: loc, type: "devolucion", quantity: input.qty, reference_type: "return", created_by: staff.id });

  if (refund > 0) {
    await db.from("cash_movements").insert({ session_id: input.sessionId, type: "refund", method: input.method, amount_cents: refund, created_by: staff.id });
  }

  revalidatePath("/pos");
  return {
    ok: true,
    comprobante: { orderNumber: "DEVOLUCION", items: [{ name: "Devolución", quantity: input.qty, total_cents: refund }], subtotal: refund, tax: 0, total: refund, method: input.method },
  };
}

// ── Cambios ──────────────────────────────────────────────────────────────────
export async function registerExchange(input: {
  sessionId: string; returnVariantId: string; newVariantId: string; qty: number; reason: string; method: Method;
}): Promise<{ ok: boolean; error?: string; difference?: number; comprobante?: Comprobante }> {
  const staff = await requireStaff();
  const db = createAdminClient();
  if (input.qty <= 0) return { ok: false, error: "Cantidad inválida" };
  if (input.returnVariantId === input.newVariantId) return { ok: false, error: "Selecciona piezas distintas" };

  const { data: vs } = await db.from("product_variants").select("id, price_cents").in("id", [input.returnVariantId, input.newVariantId]);
  const map = new Map(((vs as unknown as { id: string; price_cents: number }[]) ?? []).map((v) => [v.id, v.price_cents]));
  const oldPrice = map.get(input.returnVariantId); const newPrice = map.get(input.newVariantId);
  if (oldPrice == null || newPrice == null) return { ok: false, error: "Pieza no encontrada" };

  const loc = await tiendaLoc(db);
  if (!loc) return { ok: false, error: "Almacén tienda no configurado" };

  // Salida de la pieza nueva (valida stock).
  const { error: decErr } = await db.rpc("decrement_stock", { p_variant: input.newVariantId, p_location_key: "tienda", p_qty: input.qty, p_ref_type: "exchange", p_ref_id: null });
  if (decErr) return { ok: false, error: `Sin stock de la pieza nueva` };

  // Reingreso de la pieza devuelta.
  const { data: row } = await db.from("stock_levels").select("id, quantity").eq("variant_id", input.returnVariantId).eq("location_id", loc).maybeSingle();
  if (row) { const r = row as { id: string; quantity: number }; await db.from("stock_levels").update({ quantity: r.quantity + input.qty }).eq("id", r.id); }
  else { await db.from("stock_levels").insert({ variant_id: input.returnVariantId, location_id: loc, quantity: input.qty }); }
  await db.from("inventory_movements").insert({ variant_id: input.returnVariantId, location_id: loc, type: "devolucion", quantity: input.qty, reference_type: "exchange", created_by: staff.id });

  const difference = (newPrice - oldPrice) * input.qty; // >0 cobra, <0 reembolsa
  await db.from("returns").insert({
    variant_id: input.returnVariantId, exchange_variant_id: input.newVariantId, quantity: input.qty,
    reason: input.reason || null, type: "exchange", refund_cents: difference < 0 ? -difference : 0, responsible_id: staff.id,
  });

  if (difference > 0) await db.from("cash_movements").insert({ session_id: input.sessionId, type: "sale", method: input.method, amount_cents: difference, created_by: staff.id });
  else if (difference < 0) await db.from("cash_movements").insert({ session_id: input.sessionId, type: "refund", method: input.method, amount_cents: -difference, created_by: staff.id });

  revalidatePath("/pos");
  return {
    ok: true, difference,
    comprobante: {
      orderNumber: "CAMBIO",
      items: [{ name: "Diferencia", quantity: 1, total_cents: Math.abs(difference) }],
      subtotal: Math.abs(difference), tax: 0, total: Math.abs(difference), method: input.method,
    },
  };
}
