"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkLowStockAfterSale, notifyCashCut } from "@/lib/admin-alerts";
import type { PaymentMethod } from "@/lib/payments";
import { CARD_METHODS } from "@/lib/payments";
import type { CashTotals } from "@/lib/cash";
import { loadCashCutReport, loadSessionTotals } from "@/lib/cash-report";
import { buildCashCutReceipt } from "@/lib/cash-receipt";
import { buildLineItems } from "@/lib/sale-items";
import type { ReceiptData } from "@/lib/escpos";

type DB = ReturnType<typeof createAdminClient>;
const TAX_RATE = 0.16;

// ── Apertura de caja ─────────────────────────────────────────────────────────
export async function openSession(input: {
  registerId: string;
  openingFloatPesos: number;
}): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireStaff();
  const db = createAdminClient();

  // Un solo turno a la vez para toda la tienda (el cajón es uno). Si ya hay uno
  // abierto —lo haya abierto quien sea— se sigue usando ese.
  const { data: existing } = await db
    .from("cash_sessions").select("id").eq("status", "open")
    .order("opened_at", { ascending: true }).limit(1).maybeSingle();
  if (existing) return { ok: true };

  const { error } = await db.from("cash_sessions").insert({
    register_id: input.registerId,
    cashier_id: staff.id,
    opening_float_cents: Math.round((input.openingFloatPesos || 0) * 100),
    status: "open",
  });
  // El índice único de la BD evita dos turnos si alguien abre desde otro equipo
  // al mismo tiempo; en ese caso ya hay turno y se continúa con él.
  if (error) {
    if (error.code === "23505") return { ok: true };
    return { ok: false, error: error.message };
  }

  revalidatePath("/pos");
  return { ok: true };
}

// ── Venta ────────────────────────────────────────────────────────────────────
export type SaleResult = {
  ok: boolean;
  error?: string;
  ticket?: {
    orderNumber: string;
    items: { name: string; sku: string; quantity: number; total_cents: number }[];
    subtotal: number;
    tax: number;
    total: number;
    discountCents: number;
    payments: { method: string; amount_cents: number }[];
  };
};

export type PaymentSplit = { method: PaymentMethod; amountCents: number };
export type DiscountInput = { cents: number; authorizedBy?: string; concept?: string };
// Datos del fiado (método de pago 'credit'): la pieza se entrega y queda el saldo.
export type CreditInput = { dueDate?: string; authorizedBy?: string; notes?: string };

type ServiceInput = { concept: string; description?: string; amountCents: number };
type SaleInput = {
  sessionId: string;
  items: { variantId: string; qty: number }[];
  services?: ServiceInput[];
  payments: PaymentSplit[];
  customerId?: string; // cliente de la venta (requerido para Rewards y fiado)
  discount?: DiscountInput;
  credit?: CreditInput;
};

const DEFAULT_CREDIT_LIMIT = 500000; // $5,000 si no hay ajuste configurado

// Cuenta de crédito del cliente: se toma la activa más reciente o se crea.
async function resolveCreditAccount(
  db: DB,
  customerId: string,
): Promise<{ ok: true; id: string; limitCents: number; balanceCents: number } | { ok: false; error: string }> {
  const { data } = await db
    .from("credit_accounts")
    .select("id, limit_cents, balance_cents, status")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  const accounts = (data as unknown as { id: string; limit_cents: number; balance_cents: number; status: string }[]) ?? [];

  const active = accounts.find((a) => a.status === "active");
  if (active) return { ok: true, id: active.id, limitCents: active.limit_cents, balanceCents: active.balance_cents };
  if (accounts.length) return { ok: false, error: "La cuenta de crédito del cliente está suspendida" };

  const { data: setting } = await db.from("app_settings").select("value").eq("key", "credit_default_limit_cents").maybeSingle();
  const limitCents = Number((setting as { value: string } | null)?.value ?? DEFAULT_CREDIT_LIMIT) || DEFAULT_CREDIT_LIMIT;
  const { data: created, error } = await db
    .from("credit_accounts")
    .insert({ customer_id: customerId, limit_cents: limitCents, balance_cents: 0, status: "active" })
    .select("id").single();
  if (error || !created) return { ok: false, error: error?.message ?? "No se pudo abrir la cuenta de crédito" };
  return { ok: true, id: (created as { id: string }).id, limitCents, balanceCents: 0 };
}

// Lógica de venta reutilizable (POS online y sincronización offline).
async function applySale(
  db: DB,
  staffId: string,
  input: SaleInput,
): Promise<SaleResult & { conflict?: boolean }> {
  const services = (input.services ?? []).filter((s) => s.concept && s.amountCents > 0);
  if (!input.items.length && services.length === 0)
    return { ok: false, error: "El ticket está vacío" };

  const ids = input.items.map((i) => i.variantId);

  const built = await buildLineItems(db, input.items);
  if (!built.ok) return { ok: false, error: built.error };
  const tracked = new Map(built.lines.map((l) => [l.variantId, l.tracksInventory]));

  // Stock de tienda (validación previa).
  const { data: loc } = await db
    .from("inventory_locations").select("id").eq("key", "tienda").maybeSingle();
  if (!loc) return { ok: false, error: "Almacén tienda no configurado" };
  const tiendaId = (loc as { id: string }).id;
  const { data: sData } = await db
    .from("stock_levels").select("variant_id, quantity, reserved")
    .eq("location_id", tiendaId).in("variant_id", ids);
  const smap = new Map(
    ((sData as unknown as { variant_id: string; quantity: number; reserved: number }[]) ?? [])
      .map((s) => [s.variant_id, Math.max(0, s.quantity - s.reserved)]),
  );

  let goods = 0; // importe con IVA incluido
  const orderItems: Record<string, unknown>[] = [];
  const ticketItems: NonNullable<SaleResult["ticket"]>["items"] = [];
  for (const l of built.lines) {
    if (l.tracksInventory && (smap.get(l.variantId) ?? 0) < l.quantity)
      return { ok: false, conflict: true, error: `Sin stock suficiente para ${l.sku}` };
    goods += l.totalCents;
    orderItems.push({ variant_id: l.variantId, sku: l.sku, name: l.name, unit_price_cents: l.unitPriceCents, quantity: l.quantity, total_cents: l.totalCents });
    ticketItems.push({ name: l.name, sku: l.sku, quantity: l.quantity, total_cents: l.totalCents });
  }

  // Servicios (sin inventario).
  for (const s of services) {
    goods += s.amountCents;
    orderItems.push({ variant_id: null, sku: "SERVICIO", name: s.concept, unit_price_cents: s.amountCents, quantity: 1, total_cents: s.amountCents, is_service: true });
    ticketItems.push({ name: s.concept, sku: "SERVICIO", quantity: 1, total_cents: s.amountCents });
  }

  // Descuento (porcentaje o monto ya convertido a centavos), acotado a los bienes.
  const discountCents = Math.max(0, Math.min(input.discount?.cents ?? 0, goods));
  const net = goods - discountCents;

  // Precios con IVA incluido: se desglosa la base y el IVA contenido del neto.
  const base = Math.round(net / (1 + TAX_RATE));
  const tax = net - base;
  const total = net;

  // El desglose de pagos debe cuadrar con el total (montos netos por método).
  const payments = (input.payments ?? []).filter((p) => p.amountCents > 0);
  const paid = payments.reduce((s, p) => s + p.amountCents, 0);
  if (paid !== total) return { ok: false, error: "El pago no coincide con el total" };

  const customerId = input.customerId ?? null;

  // Validar pago con Rewards (cliente, tope y saldo) antes de crear la orden.
  const rewardsTotal = payments.filter((p) => p.method === "rewards").reduce((s, p) => s + p.amountCents, 0);
  if (rewardsTotal > 0) {
    if (!customerId) return { ok: false, error: "El pago con Rewards requiere un cliente" };
    const { data: capRow } = await db.from("app_settings").select("value").eq("key", "rewards_max_redeem_cents").maybeSingle();
    const cap = Number((capRow as { value: string } | null)?.value ?? "100000");
    if (rewardsTotal > cap) return { ok: false, error: `Máximo ${(cap / 100).toFixed(0)} en Rewards por compra` };
    const { data: rw } = await db.from("customer_rewards").select("balance_cents").eq("customer_id", customerId).maybeSingle();
    if (((rw as { balance_cents: number } | null)?.balance_cents ?? 0) < rewardsTotal) return { ok: false, error: "Saldo de Rewards insuficiente" };
  }

  // Validar el fiado (cliente, cuenta y límite) ANTES de crear la orden.
  const creditTotal = payments.filter((p) => p.method === "credit").reduce((s, p) => s + p.amountCents, 0);
  let creditAccountId: string | null = null;
  const forceCredit = Boolean(input.credit?.authorizedBy?.trim());
  if (creditTotal > 0) {
    if (!customerId) return { ok: false, error: "El fiado requiere un cliente" };
    const acc = await resolveCreditAccount(db, customerId);
    if (!acc.ok) return { ok: false, error: acc.error };
    const available = acc.limitCents - acc.balanceCents;
    if (creditTotal > available && !forceCredit) {
      return {
        ok: false,
        error: `Excede el límite de crédito · disponible ${(available / 100).toFixed(2)} — requiere autorización`,
      };
    }
    creditAccountId = acc.id;
  }

  // Orden POS completada.
  const { data: orderData, error: orderErr } = await db
    .from("orders")
    .insert({
      channel: "pos",
      status: "completed",
      customer_id: customerId,
      subtotal_cents: base,
      tax_cents: tax,
      total_cents: total,
      discount_cents: discountCents,
      notes: discountCents > 0 ? `Descuento ${input.discount?.concept ?? ""} — autorizó ${input.discount?.authorizedBy ?? ""}`.trim() : null,
      cash_session_id: input.sessionId,
      created_by: staffId,
    })
    .select("id, order_number").single();
  if (orderErr || !orderData) return { ok: false, error: orderErr?.message ?? "No se pudo crear la venta" };
  const order = orderData as { id: string; order_number: string };

  await db.from("order_items").insert(orderItems.map((oi) => ({ ...oi, order_id: order.id })));

  if (discountCents > 0) {
    await db.from("audit_logs").insert({
      actor_id: staffId, action: "order.discount", entity_type: "orders", entity_id: order.id,
      after: { discount_cents: discountCents, authorized_by: input.discount?.authorizedBy ?? null, concept: input.discount?.concept ?? null },
    });
  }

  if (services.length) {
    await db.from("service_sales").insert(services.map((s) => ({
      order_id: order.id, concept: s.concept, description: s.description ?? null,
      amount_cents: s.amountCents, created_by: staffId,
    })));
  }

  // Cargo a la cuenta de crédito (sube el saldo del cliente y liga el cargo a la orden).
  if (creditTotal > 0 && creditAccountId) {
    const { error } = await db.rpc("charge_credit", {
      p_account: creditAccountId, p_order: order.id, p_amount: creditTotal,
      p_due: input.credit?.dueDate || null, p_session: input.sessionId,
      p_by: staffId, p_force: forceCredit, p_notes: input.credit?.notes || null,
    });
    if (error) {
      await db.from("orders").delete().eq("id", order.id);
      return { ok: false, error: `Crédito: ${error.message}` };
    }
    if (forceCredit) {
      await db.from("audit_logs").insert({
        actor_id: staffId, action: "credit.limit_override", entity_type: "credit_accounts", entity_id: creditAccountId,
        after: { order_id: order.id, amount_cents: creditTotal, authorized_by: input.credit?.authorizedBy ?? null },
      });
    }
  }

  // Descuento de stock tienda. Si falla, revertir la orden para no dejar huérfanas.
  for (const it of input.items) {
    if (tracked.get(it.variantId) === false) continue; // sin control de inventario (bolsas, kits)
    const { error } = await db.rpc("decrement_stock", {
      p_variant: it.variantId, p_location_key: "tienda",
      p_qty: it.qty, p_ref_type: "order", p_ref_id: order.id,
    });
    if (error) {
      if (creditTotal > 0) await db.rpc("reverse_credit_charge", { p_order: order.id });
      await db.from("orders").delete().eq("id", order.id);
      const conflict = String(error.message).includes("STOCK_INSUFICIENTE");
      return { ok: false, conflict, error: `Stock: ${error.message}` };
    }
  }

  // Pagos: efectivo/tarjeta/transferencia van a caja; Rewards canjea saldo.
  // El fiado también deja movimiento (method 'credit') para que el corte lo reporte
  // como "fiado del turno" sin sumarlo a ningún esperado.
  for (const p of payments) {
    await db.from("payments").insert({ order_id: order.id, method: p.method, amount_cents: p.amountCents, status: "completed" });
    if (p.method === "rewards") {
      await db.rpc("redeem_rewards", { p_customer: customerId, p_order: order.id, p_amount_cents: p.amountCents, p_channel: "pos" });
    } else {
      const { error } = await db.from("cash_movements").insert({
        session_id: input.sessionId, type: "sale", method: p.method, amount_cents: p.amountCents,
        reference_id: order.id, reference_type: "order", created_by: staffId,
      });
      // Sin este movimiento la venta no aparecería en el corte: hay que enterarse.
      // La orden ya está registrada, así que se avisa para NO volver a cobrarla.
      if (error) {
        return {
          ok: false,
          error: `La venta ${order.order_number} quedó registrada pero no se pudo anotar en caja (${error.message}). No la vuelvas a cobrar: avisa a administración.`,
        };
      }
    }
  }

  // (Rewards ya no es cashback: no se acumula saldo por compra.)

  // Alerta de inventario bajo en tienda física (no bloquea la venta si falla).
  await checkLowStockAfterSale(input.items.map((it) => ({ variantId: it.variantId, qty: it.qty })), "tienda", "Tienda física");

  return {
    ok: true,
    ticket: { orderNumber: order.order_number, items: ticketItems, subtotal: base, tax, total, discountCents, payments: payments.map((p) => ({ method: p.method, amount_cents: p.amountCents })) },
  };
}

// Venta online inmediata.
export async function chargeSale(input: SaleInput): Promise<SaleResult> {
  const staff = await requireStaff();
  const db = createAdminClient();
  const res = await applySale(db, staff.id, input);
  if (res.ok) revalidatePath("/pos");
  return { ok: res.ok, error: res.error, ticket: res.ticket };
}

// ── Sincronización de ventas offline (idempotente + conflictos) ─────────────
export type SyncOp = {
  clientOpId: string;
  sessionId: string;
  items: { variantId: string; qty: number }[];
  services?: ServiceInput[];
  payments: PaymentSplit[];
  customerId?: string;
  discount?: DiscountInput;
  createdAtIso: string;
};

export type SyncResult = {
  results: { clientOpId: string; status: "synced" | "conflict" | "error"; orderNumber?: string; error?: string }[];
};

export async function processSyncBatch(deviceId: string, ops: SyncOp[]): Promise<SyncResult> {
  const staff = await requireStaff();
  const db = createAdminClient();

  // Registrar el dispositivo (FK de sync_queue).
  await db.from("devices").upsert(
    { id: deviceId, name: "POS", platform: "web", last_seen_at: new Date().toISOString() },
    { onConflict: "id" },
  );

  const results: SyncResult["results"] = [];
  for (const op of ops) {
    // Idempotencia: registrar en la cola; si ya está sincronizada, no reprocesar.
    await db.from("sync_queue").upsert(
      {
        device_id: deviceId, client_op_id: op.clientOpId, operation_type: "sale",
        payload: op, client_created_at: op.createdAtIso, status: "pending",
      },
      { onConflict: "device_id,client_op_id", ignoreDuplicates: true },
    );
    const { data: q } = await db
      .from("sync_queue").select("status")
      .eq("device_id", deviceId).eq("client_op_id", op.clientOpId).maybeSingle();
    if ((q as { status: string } | null)?.status === "synced") {
      results.push({ clientOpId: op.clientOpId, status: "synced" });
      continue;
    }

    const res = await applySale(db, staff.id, {
      sessionId: op.sessionId, items: op.items, services: op.services,
      payments: op.payments, customerId: op.customerId, discount: op.discount,
    });
    const status: "synced" | "conflict" | "error" = res.ok ? "synced" : res.conflict ? "conflict" : "error";

    await db.from("sync_queue")
      .update({ status, error: res.error ?? null, processed_at: new Date().toISOString() })
      .eq("device_id", deviceId).eq("client_op_id", op.clientOpId);

    if (status === "conflict") {
      await db.from("notifications").insert({
        type: "sync_conflict",
        title: "Conflicto de sincronización",
        body: `Venta offline sin stock suficiente — requiere revisión manual`,
        data: { client_op_id: op.clientOpId, device_id: deviceId, error: res.error },
        target_role: "gerente",
      });
    }
    results.push({ clientOpId: op.clientOpId, status, orderNumber: res.ticket?.orderNumber, error: res.error });
  }

  revalidatePath("/pos");
  return { results };
}

// ── Totales de la sesión (para el corte) ─────────────────────────────────────
// El cálculo vive en lib/cash.ts y la carga en lib/cash-report.ts (compartidos).
export async function getSessionTotals(sessionId: string): Promise<CashTotals> {
  await requireStaff();
  const db = createAdminClient();
  return loadSessionTotals(db, sessionId);
}

// ── Corte de caja ────────────────────────────────────────────────────────────
export async function closeSession(input: {
  sessionId: string;
  countedCashPesos: number;
  countedDebitPesos: number;
  countedCreditPesos: number;
  countedAmexPesos: number;
  countedTransferPesos: number;
  peopleServed?: number;
}): Promise<{
  ok: boolean; error?: string;
  summary?: { expectedCash: number; countedCash: number; difference: number };
  receipt?: ReceiptData;
}> {
  const staff = await requireStaff();
  const db = createAdminClient();

  const totals = await loadSessionTotals(db, input.sessionId);
  const countedCash = Math.round((input.countedCashPesos || 0) * 100);
  const countedDebit = Math.round((input.countedDebitPesos || 0) * 100);
  const countedCredit = Math.round((input.countedCreditPesos || 0) * 100);
  const countedAmex = Math.round((input.countedAmexPesos || 0) * 100);
  const countedTransfer = Math.round((input.countedTransferPesos || 0) * 100);
  const difference = countedCash - totals.expectedCash;
  const peopleServed = Math.max(0, Math.round(input.peopleServed || 0));

  const closedAt = new Date().toISOString();
  const { error } = await db.from("cash_sessions").update({
    status: "closed",
    counted_cash_cents: countedCash,
    counted_debit_cents: countedDebit,
    counted_credit_cents: countedCredit,
    counted_amex_cents: countedAmex,
    counted_card_cents: countedDebit + countedCredit + countedAmex, // total tarjeta (compat históricos)
    counted_transfer_cents: countedTransfer,
    expected_cash_cents: totals.expectedCash,
    difference_cents: difference,
    people_served: peopleServed,
    closed_at: closedAt,
    closed_by: staff.id,
  }).eq("id", input.sessionId);
  if (error) return { ok: false, error: error.message };

  await db.from("notifications").insert({
    type: "cash_cut",
    title: "Corte de caja",
    body: `Esperado efectivo $${(totals.expectedCash / 100).toFixed(2)} · contado $${(countedCash / 100).toFixed(2)} · diferencia $${(difference / 100).toFixed(2)}`,
    data: { session_id: input.sessionId, ...totals, countedCash, countedDebit, countedCredit, countedAmex, countedTransfer, difference },
    target_role: "admin",
  });

  // Un solo reporte alimenta el correo de administración y el ticket impreso.
  const report = await loadCashCutReport(db, input.sessionId);
  if (report) await notifyCashCut(report);

  revalidatePath("/pos");
  return {
    ok: true,
    summary: { expectedCash: totals.expectedCash, countedCash, difference },
    receipt: report ? buildCashCutReceipt(report) : undefined,
  };
}
