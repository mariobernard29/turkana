"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkLowStockAfterSale, notifyCashCut } from "@/lib/admin-alerts";

type DB = ReturnType<typeof createAdminClient>;
const TAX_RATE = 0.16;

// ── Apertura de caja ─────────────────────────────────────────────────────────
export async function openSession(input: {
  registerId: string;
  openingFloatPesos: number;
}): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireStaff();
  const db = createAdminClient();

  const { data: existing } = await db
    .from("cash_sessions").select("id")
    .eq("cashier_id", staff.id).eq("status", "open").maybeSingle();
  if (existing) return { ok: true };

  const { error } = await db.from("cash_sessions").insert({
    register_id: input.registerId,
    cashier_id: staff.id,
    opening_float_cents: Math.round((input.openingFloatPesos || 0) * 100),
    status: "open",
  });
  if (error) return { ok: false, error: error.message };

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

export type PaymentSplit = { method: "cash" | "card" | "transfer" | "rewards"; amountCents: number };
export type DiscountInput = { cents: number; authorizedBy?: string; concept?: string };

type ServiceInput = { concept: string; description?: string; amountCents: number };
type SaleInput = {
  sessionId: string;
  items: { variantId: string; qty: number }[];
  services?: ServiceInput[];
  payments: PaymentSplit[];
  customerId?: string; // cliente Rewards registrado (acumula y puede canjear)
  discount?: DiscountInput;
};

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

  const { data: vData } = await db
    .from("product_variants")
    .select("id, sku, price_cents, attributes, products(name, track_inventory)")
    .in("id", ids);
  const vmap = new Map(
    ((vData as unknown as { id: string; sku: string; price_cents: number; attributes: Record<string, string> | null; products: { name: string; track_inventory?: boolean } | { name: string; track_inventory?: boolean }[] | null }[]) ?? [])
      .map((v) => [v.id, v]),
  );
  const tracksInventory = (v: { products: { track_inventory?: boolean } | { track_inventory?: boolean }[] | null }) => {
    const p = Array.isArray(v.products) ? v.products[0] : v.products;
    return p?.track_inventory !== false;
  };

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
  for (const it of input.items) {
    const v = vmap.get(it.variantId);
    if (!v) return { ok: false, error: "Producto no encontrado" };
    if (tracksInventory(v) && (smap.get(it.variantId) ?? 0) < it.qty)
      return { ok: false, conflict: true, error: `Sin stock suficiente para ${v.sku}` };
    const prod = Array.isArray(v.products) ? v.products[0] : v.products;
    const talla = v.attributes?.talla;
    const name = `${prod?.name ?? v.sku}${talla ? ` · Talla ${talla}` : ""}`;
    const lineTotal = v.price_cents * it.qty;
    goods += lineTotal;
    orderItems.push({ variant_id: v.id, sku: v.sku, name, unit_price_cents: v.price_cents, quantity: it.qty, total_cents: lineTotal });
    ticketItems.push({ name, sku: v.sku, quantity: it.qty, total_cents: lineTotal });
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

  // Descuento de stock tienda. Si falla, revertir la orden para no dejar huérfanas.
  for (const it of input.items) {
    const v = vmap.get(it.variantId);
    if (v && !tracksInventory(v)) continue; // productos sin control de inventario (bolsas, kits)
    const { error } = await db.rpc("decrement_stock", {
      p_variant: it.variantId, p_location_key: "tienda",
      p_qty: it.qty, p_ref_type: "order", p_ref_id: order.id,
    });
    if (error) {
      await db.from("orders").delete().eq("id", order.id);
      const conflict = String(error.message).includes("STOCK_INSUFICIENTE");
      return { ok: false, conflict, error: `Stock: ${error.message}` };
    }
  }

  // Pagos: efectivo/tarjeta/transferencia van a caja; Rewards canjea saldo.
  for (const p of payments) {
    await db.from("payments").insert({ order_id: order.id, method: p.method, amount_cents: p.amountCents, status: "completed" });
    if (p.method === "rewards") {
      await db.rpc("redeem_rewards", { p_customer: customerId, p_order: order.id, p_amount_cents: p.amountCents, p_channel: "pos" });
    } else {
      await db.from("cash_movements").insert({ session_id: input.sessionId, type: "sale", method: p.method, amount_cents: p.amountCents, reference_id: order.id, created_by: staffId });
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
async function computeTotals(db: DB, sessionId: string) {
  const { data: sess } = await db
    .from("cash_sessions").select("opening_float_cents").eq("id", sessionId).maybeSingle();
  const opening = (sess as { opening_float_cents: number } | null)?.opening_float_cents ?? 0;

  const { data: movs } = await db
    .from("cash_movements").select("type, method, amount_cents").eq("session_id", sessionId);

  let cash = opening, card = 0, transfer = 0, sales = 0, refunds = 0, drops = 0, precuts = 0;
  for (const m of (movs as unknown as { type: string; method: string | null; amount_cents: number }[]) ?? []) {
    const amt = m.amount_cents;
    if (m.type === "sale") {
      sales++;
      if (m.method === "cash") cash += amt;
      else if (m.method === "card") card += amt;
      else if (m.method === "transfer") transfer += amt;
    } else if (m.type === "in") cash += amt;
    else if (m.type === "refund") { cash -= amt; refunds += amt; }
    else if (m.type === "drop") { cash -= amt; drops += amt; }
    else if (m.type === "precut") precuts += amt;
    else if (["out", "expense"].includes(m.type)) cash -= amt;
  }

  // Descuentos aplicados en ventas de esta sesión.
  const { data: ords } = await db.from("orders").select("discount_cents").eq("cash_session_id", sessionId);
  const discounts = ((ords as unknown as { discount_cents: number }[]) ?? []).reduce((s, o) => s + (o.discount_cents ?? 0), 0);

  return { openingFloat: opening, expectedCash: cash, expectedCard: card, expectedTransfer: transfer, salesCount: sales, refundsCents: refunds, dropsCents: drops, discountsCents: discounts, precutsCents: precuts };
}

export async function getSessionTotals(sessionId: string) {
  await requireStaff();
  const db = createAdminClient();
  return computeTotals(db, sessionId);
}

// ── Corte de caja ────────────────────────────────────────────────────────────
export async function closeSession(input: {
  sessionId: string;
  countedCashPesos: number;
  countedCardPesos: number;
  countedTransferPesos: number;
  peopleServed?: number;
}): Promise<{ ok: boolean; error?: string; summary?: { expectedCash: number; countedCash: number; difference: number } }> {
  const staff = await requireStaff();
  const db = createAdminClient();

  const totals = await computeTotals(db, input.sessionId);
  const countedCash = Math.round((input.countedCashPesos || 0) * 100);
  const countedCard = Math.round((input.countedCardPesos || 0) * 100);
  const countedTransfer = Math.round((input.countedTransferPesos || 0) * 100);
  const difference = countedCash - totals.expectedCash;
  const peopleServed = Math.max(0, Math.round(input.peopleServed || 0));

  const closedAt = new Date().toISOString();
  const { error } = await db.from("cash_sessions").update({
    status: "closed",
    counted_cash_cents: countedCash,
    counted_card_cents: countedCard,
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
    data: { session_id: input.sessionId, ...totals, countedCash, countedCard, countedTransfer, difference },
    target_role: "admin",
  });

  // Alerta de corte al correo de administración con todo el detalle.
  const { data: sess } = await db.from("cash_sessions").select("opened_at, cash_registers(name)").eq("id", input.sessionId).maybeSingle();
  const s = sess as unknown as { opened_at: string; cash_registers: { name: string } | { name: string }[] | null } | null;
  const regRel = s?.cash_registers;
  const registerName = (Array.isArray(regRel) ? regRel[0]?.name : regRel?.name) ?? "Caja";
  await notifyCashCut({
    sessionId: input.sessionId,
    cashier: staff.fullName, registerName, openedAt: s?.opened_at ?? closedAt, closedAt,
    lote: input.sessionId.slice(0, 8), peopleServed,
    openingFloat: totals.openingFloat, salesCount: totals.salesCount,
    discountsCents: totals.discountsCents, refundsCents: totals.refundsCents,
    dropsCents: totals.dropsCents, precutsCents: totals.precutsCents,
    expectedCash: totals.expectedCash, expectedCard: totals.expectedCard, expectedTransfer: totals.expectedTransfer,
    countedCash, countedCard, countedTransfer, difference,
  });

  revalidatePath("/pos");
  return { ok: true, summary: { expectedCash: totals.expectedCash, countedCash, difference } };
}
