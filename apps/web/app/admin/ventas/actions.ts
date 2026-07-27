"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, carrierLabel, carrierTrackUrl, type EmailTemplate } from "@/lib/email";

const VALID_STATUS = [
  "pending", "paid", "preparing", "shipped", "delivered", "completed", "cancelled",
] as const;
type OrderStatus = (typeof VALID_STATUS)[number];

// Cancelar una venta y reasignar sus formas de pago sólo lo hacen administradores.
const ADMIN_ROLES = ["super_admin", "admin"];
// Métodos que se pueden capturar a mano (Rewards, fiado y apartado mueven saldos
// del cliente, así que no se reasignan desde aquí).
const EDITABLE_METHODS = ["cash", "debit", "credit_card", "amex", "transfer"];

type OrderForAdmin = {
  id: string;
  order_number: string;
  channel: string;
  status: string;
  total_cents: number;
  cash_session_id: string | null;
  notes: string | null;
  customer_id: string | null;
  order_items: { variant_id: string | null; quantity: number; name: string }[] | null;
  payments: { id: string; method: string; amount_cents: number; status: string }[] | null;
};

const SELECT_FOR_ADMIN =
  "id, order_number, channel, status, total_cents, cash_session_id, notes, customer_id, order_items(variant_id, quantity, name), payments(id, method, amount_cents, status)";

// Reglas comunes: sólo admins, sólo ventas de tienda y que no estén canceladas.
async function loadEditableSale(orderId: string) {
  const staff = await requireStaff();
  if (!ADMIN_ROLES.includes(staff.role ?? "")) {
    return { error: "Solo administradores pueden hacer este cambio" as string };
  }
  const db = createAdminClient();
  const { data } = await db.from("orders").select(SELECT_FOR_ADMIN).eq("id", orderId).maybeSingle();
  const order = data as unknown as OrderForAdmin | null;
  if (!order) return { error: "Venta no encontrada" };
  if (order.channel !== "pos") {
    return { error: "Sólo se pueden ajustar ventas de tienda (las de Stripe se manejan en su panel)" };
  }
  if (order.status === "cancelled") return { error: "La venta ya está cancelada" };
  return { staff, db, order };
}

// ¿El turno en el que se cobró sigue abierto? De eso depende si se puede deshacer
// el movimiento o hay que registrar la salida de dinero en la caja de hoy.
async function sessionIsOpen(db: ReturnType<typeof createAdminClient>, sessionId: string | null) {
  if (!sessionId) return false;
  const { data } = await db.from("cash_sessions").select("status").eq("id", sessionId).maybeSingle();
  return (data as { status: string } | null)?.status === "open";
}

async function currentOpenSession(db: ReturnType<typeof createAdminClient>) {
  const { data } = await db
    .from("cash_sessions").select("id").eq("status", "open")
    .order("opened_at", { ascending: false }).limit(1).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

// ── Cancelar venta ───────────────────────────────────────────────────────────
// Regresa las piezas al inventario y deshace el dinero: si el turno sigue abierto
// se borran sus movimientos (el corte queda como si nunca hubiera pasado); si ya
// se cerró, se registra el reembolso en la caja de hoy para no tocar ese corte.
export async function cancelSale(
  orderId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string; note?: string }> {
  const ctx = await loadEditableSale(orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { staff, db, order } = ctx;

  if (!reason.trim()) return { ok: false, error: "Indica el motivo de la cancelación" };

  const payments = (order.payments ?? []).filter((p) => p.status === "completed");
  if (payments.some((p) => p.method === "layaway")) {
    return { ok: false, error: "Es la entrega de un apartado: manéjalo como devolución en el POS" };
  }

  const openTurn = await sessionIsOpen(db, order.cash_session_id);
  const cashPayments = payments.filter((p) => !["rewards", "credit"].includes(p.method));
  const refundTotal = cashPayments.reduce((s, p) => s + p.amount_cents, 0);

  // Turno cerrado con dinero por devolver: hace falta una caja abierta hoy.
  let refundSessionId: string | null = null;
  if (!openTurn && refundTotal > 0) {
    refundSessionId = await currentOpenSession(db);
    if (!refundSessionId) {
      return {
        ok: false,
        error: "El turno de esta venta ya se cerró. Abre una caja para poder registrar la salida del dinero.",
      };
    }
  }

  // 1) Dinero
  if (openTurn && order.cash_session_id) {
    const { error } = await db.from("cash_movements").delete()
      .eq("session_id", order.cash_session_id).eq("reference_id", order.id).eq("type", "sale");
    if (error) return { ok: false, error: `Caja: ${error.message}` };
  } else if (refundSessionId) {
    // Una fila por método para que el reembolso baje del bucket correcto del corte.
    const { error } = await db.from("cash_movements").insert(cashPayments.map((p) => ({
      session_id: refundSessionId, type: "refund", method: p.method, amount_cents: p.amount_cents,
      reference_id: order.id, reference_type: "order", created_by: staff.id,
      notes: `Cancelación de venta ${order.order_number}`,
    })));
    if (error) return { ok: false, error: `Caja: ${error.message}` };
  }

  // 2) Fiado: se borra la deuda que generó esta venta.
  if (payments.some((p) => p.method === "credit")) {
    await db.rpc("reverse_credit_charge", { p_order: order.id });
  }

  // 3) Rewards: se devuelve el saldo canjeado.
  const rewardsUsed = payments.filter((p) => p.method === "rewards").reduce((s, p) => s + p.amount_cents, 0);
  if (rewardsUsed > 0 && order.customer_id) {
    const { data: rw } = await db
      .from("customer_rewards").select("balance_cents").eq("customer_id", order.customer_id).maybeSingle();
    const balance = (rw as { balance_cents: number } | null)?.balance_cents ?? 0;
    await db.from("customer_rewards").update({ balance_cents: balance + rewardsUsed, updated_at: new Date().toISOString() })
      .eq("customer_id", order.customer_id);
    await db.from("reward_transactions").insert({
      customer_id: order.customer_id, type: "adjust", amount_cents: rewardsUsed,
      order_id: order.id, channel: "pos", created_by: staff.id,
      notes: `Cancelación de venta ${order.order_number}`,
    });
  }

  // 4) Inventario: sólo las piezas que sí descuentan stock.
  const restored = await restoreStock(db, order, staff.id);

  // 5) Marcar la venta y sus pagos.
  await db.from("payments").update({ status: "refunded" })
    .eq("order_id", order.id).eq("status", "completed");
  await db.from("orders").update({
    status: "cancelled",
    notes: [order.notes, `Cancelada por ${staff.fullName}: ${reason.trim()}`].filter(Boolean).join(" · "),
    // Si el turno sigue abierto la venta sale del lote: no dejó rastro de dinero.
    ...(openTurn ? { cash_session_id: null } : {}),
  }).eq("id", order.id);

  await db.from("audit_logs").insert({
    actor_id: staff.id, action: "order.cancel", entity_type: "orders", entity_id: order.id,
    after: {
      reason: reason.trim(), total_cents: order.total_cents,
      original_session: order.cash_session_id, refund_session: refundSessionId,
      undone_in_open_turn: openTurn, restored_items: restored,
    },
  });

  revalidatePath("/admin/ventas");
  revalidatePath(`/admin/ventas/${orderId}`);
  revalidatePath("/pos");

  const money = (c: number) => `$${(c / 100).toFixed(2)}`;
  const note = openTurn
    ? `Venta cancelada. Se deshizo el cobro en el turno abierto: el corte queda como si no hubiera pasado.${restored ? ` ${restored} pieza(s) de vuelta al inventario.` : ""}`
    : refundTotal > 0
      ? `Venta cancelada. Se registró un reembolso de ${money(refundTotal)} en la caja abierta (el corte anterior no se modificó).${restored ? ` ${restored} pieza(s) de vuelta al inventario.` : ""}`
      : `Venta cancelada.${restored ? ` ${restored} pieza(s) de vuelta al inventario.` : ""}`;
  return { ok: true, note };
}

// Reingresa al almacén tienda las piezas de la venta; devuelve cuántas restituyó.
async function restoreStock(
  db: ReturnType<typeof createAdminClient>,
  order: OrderForAdmin,
  staffId: string,
): Promise<number> {
  const items = (order.order_items ?? []).filter((it) => it.variant_id);
  if (!items.length) return 0;

  const { data: loc } = await db.from("inventory_locations").select("id").eq("key", "tienda").maybeSingle();
  const locId = (loc as { id: string } | null)?.id;
  if (!locId) return 0;

  // Los productos sin control de inventario (bolsas, kits) nunca descontaron.
  const { data: vs } = await db
    .from("product_variants").select("id, products(track_inventory)")
    .in("id", items.map((it) => it.variant_id as string));
  const tracks = new Map(((vs as unknown as { id: string; products: { track_inventory?: boolean } | { track_inventory?: boolean }[] | null }[]) ?? [])
    .map((v) => {
      const p = Array.isArray(v.products) ? v.products[0] : v.products;
      return [v.id, p?.track_inventory !== false];
    }));

  let count = 0;
  for (const it of items) {
    const variantId = it.variant_id as string;
    if (!tracks.get(variantId)) continue;
    const { data: row } = await db
      .from("stock_levels").select("id, quantity").eq("variant_id", variantId).eq("location_id", locId).maybeSingle();
    if (row) {
      const r = row as { id: string; quantity: number };
      await db.from("stock_levels")
        .update({ quantity: r.quantity + it.quantity, updated_at: new Date().toISOString() }).eq("id", r.id);
    } else {
      await db.from("stock_levels").insert({ variant_id: variantId, location_id: locId, quantity: it.quantity });
    }
    await db.from("inventory_movements").insert({
      variant_id: variantId, location_id: locId, type: "devolucion", quantity: it.quantity,
      reference_type: "order", reference_id: order.id, created_by: staffId,
      notes: `Cancelación de venta ${order.order_number}`,
    });
    count += it.quantity;
  }
  return count;
}

// ── Reasignar formas de pago ─────────────────────────────────────────────────
// El total no cambia: sólo se corrige CON QUÉ se pagó (p.ej. se cobró como débito
// y fue crédito). Sólo con el turno abierto, porque un corte cerrado ya se cuadró.
export async function updateSalePayments(
  orderId: string,
  splits: { method: string; amountCents: number }[],
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await loadEditableSale(orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { staff, db, order } = ctx;

  const clean = (splits ?? []).filter((s) => s.amountCents > 0);
  if (!clean.length) return { ok: false, error: "Captura al menos una forma de pago" };
  if (clean.some((s) => !EDITABLE_METHODS.includes(s.method))) {
    return { ok: false, error: "Forma de pago no válida para tienda" };
  }
  const sum = clean.reduce((s, p) => s + p.amountCents, 0);
  if (sum !== order.total_cents) {
    return { ok: false, error: "El desglose no coincide con el total de la venta" };
  }

  const previous = (order.payments ?? []).filter((p) => p.status === "completed");
  if (previous.some((p) => ["rewards", "credit", "layaway"].includes(p.method))) {
    return { ok: false, error: "Esta venta usó Rewards, fiado o apartado: no se puede reasignar desde aquí" };
  }
  if (!order.cash_session_id || !(await sessionIsOpen(db, order.cash_session_id))) {
    return { ok: false, error: "El corte de ese turno ya se cerró: cambiar los métodos lo descuadraría" };
  }

  // Se reemplazan pagos y movimientos de caja de la venta por el desglose nuevo.
  await db.from("payments").delete().eq("order_id", order.id);
  const { error: payErr } = await db.from("payments").insert(clean.map((s) => ({
    order_id: order.id, method: s.method, amount_cents: s.amountCents, status: "completed",
  })));
  if (payErr) return { ok: false, error: payErr.message };

  await db.from("cash_movements").delete()
    .eq("session_id", order.cash_session_id).eq("reference_id", order.id).eq("type", "sale");
  const { error: movErr } = await db.from("cash_movements").insert(clean.map((s) => ({
    session_id: order.cash_session_id, type: "sale", method: s.method, amount_cents: s.amountCents,
    reference_id: order.id, reference_type: "order", created_by: staff.id,
    notes: `Formas de pago corregidas por ${staff.fullName}`,
  })));
  if (movErr) return { ok: false, error: `Caja: ${movErr.message}` };

  await db.from("audit_logs").insert({
    actor_id: staff.id, action: "order.payments.update", entity_type: "orders", entity_id: order.id,
    before: { payments: previous.map((p) => ({ method: p.method, amount_cents: p.amount_cents })) },
    after: { payments: clean.map((s) => ({ method: s.method, amount_cents: s.amountCents })) },
  });

  revalidatePath("/admin/ventas");
  revalidatePath(`/admin/ventas/${orderId}`);
  revalidatePath("/pos");
  return { ok: true };
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireStaff();
  if (!VALID_STATUS.includes(status)) return { ok: false, error: "Estado inválido" };

  const db = createAdminClient();
  const { error } = await db.from("orders").update({ status }).eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  // Reflejar en envíos cuando aplique.
  if (status === "shipped" || status === "delivered") {
    const { data: ship } = await db
      .from("shipments").select("id").eq("order_id", orderId).maybeSingle();
    const patch = status === "shipped"
      ? { status: "shipped", shipped_at: new Date().toISOString() }
      : { status: "delivered", delivered_at: new Date().toISOString() };
    if (ship) await db.from("shipments").update(patch).eq("id", (ship as { id: string }).id);
    else await db.from("shipments").insert({ order_id: orderId, ...patch });
  }

  await db.from("audit_logs").insert({
    actor_id: staff.id, action: `order.status.${status}`,
    entity_type: "orders", entity_id: orderId,
  });

  revalidatePath("/admin/ventas");
  revalidatePath(`/admin/ventas/${orderId}`);
  return { ok: true };
}

export async function sendOrderEmail(
  orderId: string,
  template: EmailTemplate,
): Promise<{ ok: boolean; error?: string }> {
  await requireStaff();
  const db = createAdminClient();

  const { data } = await db
    .from("orders")
    .select("order_number, customers(full_name, email)")
    .eq("id", orderId)
    .maybeSingle();

  const order = data as unknown as {
    order_number: string;
    customers: { full_name: string; email: string | null } | { full_name: string; email: string | null }[] | null;
  } | null;
  if (!order) return { ok: false, error: "Pedido no encontrado" };

  const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers;
  if (!customer?.email) return { ok: false, error: "El cliente no tiene correo registrado" };

  const res = await sendEmail(template, customer.email, {
    customer_name: customer.full_name,
    order_number: order.order_number,
  });

  if (res.ok) {
    await db.from("notifications").insert({
      type: "email_sent",
      title: `Correo enviado al cliente`,
      body: `${template} → ${customer.email} (orden ${order.order_number})`,
      data: { order_id: orderId, template },
      target_role: "admin",
    });
  }
  return res;
}

// ── Guía de envío: guarda paquetería + número, marca enviado y avisa al cliente ─
async function orderCustomer(db: ReturnType<typeof createAdminClient>, orderId: string) {
  const { data } = await db.from("orders").select("order_number, customers(full_name, email)").eq("id", orderId).maybeSingle();
  const o = data as unknown as { order_number: string; customers: { full_name: string; email: string | null } | { full_name: string; email: string | null }[] | null } | null;
  if (!o) return null;
  const c = Array.isArray(o.customers) ? o.customers[0] : o.customers;
  return { orderNumber: o.order_number, name: c?.full_name ?? "", email: c?.email ?? null };
}

export async function sendShippingGuide(
  orderId: string,
  carrier: string,
  tracking: string,
): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireStaff();
  const db = createAdminClient();
  if (!carrier) return { ok: false, error: "Selecciona la paquetería" };
  if (!tracking.trim()) return { ok: false, error: "Ingresa el número de guía" };

  const info = await orderCustomer(db, orderId);
  if (!info) return { ok: false, error: "Pedido no encontrado" };
  if (!info.email) return { ok: false, error: "El cliente no tiene correo registrado" };

  // Guardar guía en el envío (upsert manual) y marcar el pedido como enviado.
  const now = new Date().toISOString();
  const patch = { status: "shipped" as const, shipped_at: now, carrier, tracking_number: tracking.trim() };
  const { data: ship } = await db.from("shipments").select("id").eq("order_id", orderId).maybeSingle();
  if (ship) await db.from("shipments").update(patch).eq("id", (ship as { id: string }).id);
  else await db.from("shipments").insert({ order_id: orderId, ...patch });
  await db.from("orders").update({ status: "shipped" }).eq("id", orderId);

  const res = await sendEmail("order_shipped", info.email, {
    customer_name: info.name,
    order_number: info.orderNumber,
    carrier: carrierLabel(carrier),
    tracking: tracking.trim(),
    tracking_url: carrierTrackUrl(carrier, tracking.trim()),
  });
  if (!res.ok) return res;

  await db.from("audit_logs").insert({ actor_id: staff.id, action: "order.shipped.guide", entity_type: "orders", entity_id: orderId, after: { carrier, tracking } });
  revalidatePath("/admin/ventas");
  revalidatePath(`/admin/ventas/${orderId}`);
  return { ok: true };
}

export async function sendDeliveredThankYou(orderId: string): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireStaff();
  const db = createAdminClient();
  const info = await orderCustomer(db, orderId);
  if (!info) return { ok: false, error: "Pedido no encontrado" };
  if (!info.email) return { ok: false, error: "El cliente no tiene correo registrado" };

  await db.from("orders").update({ status: "delivered" }).eq("id", orderId);
  const { data: ship } = await db.from("shipments").select("id").eq("order_id", orderId).maybeSingle();
  const patch = { status: "delivered" as const, delivered_at: new Date().toISOString() };
  if (ship) await db.from("shipments").update(patch).eq("id", (ship as { id: string }).id);
  else await db.from("shipments").insert({ order_id: orderId, ...patch });

  const res = await sendEmail("order_delivered", info.email, { customer_name: info.name, order_number: info.orderNumber });
  if (!res.ok) return res;

  await db.from("audit_logs").insert({ actor_id: staff.id, action: "order.delivered.thanks", entity_type: "orders", entity_id: orderId });
  revalidatePath("/admin/ventas");
  revalidatePath(`/admin/ventas/${orderId}`);
  return { ok: true };
}
