"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildLineItems } from "@/lib/sale-items";
import { money, type ReceiptData } from "@/lib/escpos";
import { methodLabel } from "@/lib/payments";

type DB = ReturnType<typeof createAdminClient>;
type Method = "cash" | "debit" | "credit_card" | "amex" | "transfer";
const pesos = (n: number) => Math.round((n || 0) * 100);
const TAX_RATE = 0.16;

// Resultado de un abono (apartado o crédito), con su comprobante para imprimir.
export type AbonoResult = {
  ok: boolean;
  error?: string;
  appliedCents?: number;
  remainingCents?: number;
  comprobante?: ReceiptData;
};

async function layawayItems(db: DB, layawayId: string) {
  const { data } = await db
    .from("layaway_items")
    .select("variant_id, sku, name, unit_price_cents, quantity, total_cents")
    .eq("layaway_id", layawayId);
  return (data as unknown as {
    variant_id: string | null; sku: string; name: string;
    unit_price_cents: number; quantity: number; total_cents: number;
  }[]) ?? [];
}

// ── Apartados ────────────────────────────────────────────────────────────────
// Nace del carrito del POS: precios reales, varias piezas y reserva de cada una.
export async function createLayawayFromCart(input: {
  sessionId: string;
  customerId: string;
  items: { variantId: string; qty: number }[];
  anticipoCents: number;
  method: Method;
  dueDate?: string;
}): Promise<{ ok: boolean; error?: string; layawayId?: string; comprobante?: ReceiptData }> {
  const staff = await requireStaff();
  const db = createAdminClient();
  if (!input.customerId) return { ok: false, error: "El apartado requiere un cliente" };
  if (!input.items.length) return { ok: false, error: "Agrega piezas al apartado" };

  const built = await buildLineItems(db, input.items);
  if (!built.ok) return { ok: false, error: built.error };

  const total = built.lines.reduce((s, l) => s + l.totalCents, 0);
  if (total <= 0) return { ok: false, error: "Total inválido" };
  const anticipo = Math.max(0, Math.min(total, input.anticipoCents));

  const { data: lay, error } = await db
    .from("layaways")
    .insert({
      customer_id: input.customerId,
      // Se conserva variant_id cuando es una sola pieza (compatibilidad).
      variant_id: built.lines.length === 1 ? built.lines[0].variantId : null,
      total_cents: total, paid_cents: 0, status: "active",
      due_date: input.dueDate || null, created_by: staff.id,
    })
    .select("id, folio, created_at").single();
  if (error || !lay) return { ok: false, error: error?.message ?? "No se pudo crear el apartado" };
  const l = lay as { id: string; folio: string | null; created_at: string };
  const layawayId = l.id;
  const folio = l.folio ?? `AP-${layawayId.slice(0, 8).toUpperCase()}`;

  await db.from("layaway_items").insert(built.lines.map((l) => ({
    layaway_id: layawayId, variant_id: l.variantId, sku: l.sku, name: l.name,
    unit_price_cents: l.unitPriceCents, quantity: l.quantity, total_cents: l.totalCents,
  })));

  // Reservar cada pieza; si una falla, se libera lo ya reservado y se borra el apartado.
  const reserved: { variantId: string; qty: number }[] = [];
  for (const l of built.lines) {
    if (!l.tracksInventory) continue;
    const { error: resErr } = await db.rpc("reserve_stock", {
      p_variant: l.variantId, p_location_key: "tienda", p_qty: l.quantity,
    });
    if (resErr) {
      for (const r of reserved) {
        await db.rpc("release_reserved", { p_variant: r.variantId, p_location_key: "tienda", p_qty: r.qty });
      }
      await db.from("layaways").delete().eq("id", layawayId);
      const falta = String(resErr.message).includes("STOCK_INSUFICIENTE");
      return { ok: false, error: falta ? `Sin stock disponible para ${l.sku}` : `Reserva: ${resErr.message}` };
    }
    reserved.push({ variantId: l.variantId, qty: l.quantity });
  }

  // Anticipo: entra a caja con su método real (reference_type 'layaway').
  if (anticipo > 0) {
    const { error: payErr } = await db.rpc("pay_layaway", {
      p_layaway: layawayId, p_amount: anticipo, p_method: input.method,
      p_session: input.sessionId, p_by: staff.id,
    });
    if (payErr) return { ok: false, error: `Anticipo: ${payErr.message}` };
    const { error: movErr } = await db.from("cash_movements").insert({
      session_id: input.sessionId, type: "in", method: input.method, amount_cents: anticipo,
      reference_id: layawayId, reference_type: "layaway", notes: "Anticipo de apartado", created_by: staff.id,
    });
    if (movErr) return { ok: false, error: `Caja: ${movErr.message}` };
  }

  const { data: cust } = await db
    .from("customers").select("full_name, phone").eq("id", input.customerId).maybeSingle();
  const c = cust as { full_name: string; phone: string | null } | null;
  const customerName = c?.full_name ?? "—";
  const saldo = total - anticipo;
  const fecha = new Date(l.created_at).toLocaleDateString("es-MX");
  const vence = input.dueDate ? new Date(`${input.dueDate}T12:00:00`).toLocaleDateString("es-MX") : "Sin fecha límite";
  const piezas = built.lines.map((li) => `${li.quantity}× ${li.name}`).join(" · ");

  revalidatePath("/pos");
  return {
    ok: true,
    layawayId,
    comprobante: {
      // Comprobante del cliente + talón que se corta y se pega a la pieza.
      docType: "apartado",
      orderNumber: folio,
      attendedBy: staff.fullName,
      dateIso: l.created_at,
      items: built.lines.map((li) => ({ name: li.name, quantity: li.quantity, total_cents: li.totalCents })),
      subtotal: 0, tax: 0,
      total: saldo, // el cuadro grande muestra el SALDO que queda por pagar
      payments: anticipo > 0 ? [{ method: input.method, amount_cents: anticipo }] : [],
      meta: [
        { label: "Cliente", value: customerName },
        ...(c?.phone ? [{ label: "Teléfono", value: c.phone }] : []),
        { label: "Vence", value: vence },
      ],
      sections: [{
        title: "Estado del apartado",
        rows: [
          { label: "Total del apartado", value: money(total) },
          { label: "Anticipo recibido", value: money(anticipo) },
          { label: "Saldo pendiente", value: money(saldo), strong: true },
        ],
      }],
      stub: {
        title: "APARTADO",
        subtitle: "NO VENDER",
        rows: [
          { label: "Folio", value: folio, strong: true },
          { label: "Cliente", value: customerName },
          ...(c?.phone ? [{ label: "Teléfono", value: c.phone }] : []),
          { label: "Apartado el", value: fecha },
          { label: "Vence", value: vence },
          { label: "Saldo", value: money(saldo) },
          { label: "Atendió", value: staff.fullName },
          { label: piezas },
        ],
      },
    },
  };
}

export async function addLayawayPayment(input: {
  sessionId: string; layawayId: string; amountCents: number; method: Method;
}): Promise<AbonoResult> {
  const staff = await requireStaff();
  const db = createAdminClient();
  if (input.amountCents <= 0) return { ok: false, error: "Importe inválido" };

  // El RPC topa el abono al saldo pendiente y devuelve lo aplicado.
  const { data: applied, error } = await db.rpc("pay_layaway", {
    p_layaway: input.layawayId, p_amount: input.amountCents, p_method: input.method,
    p_session: input.sessionId, p_by: staff.id,
  });
  if (error) {
    const msg = String(error.message);
    if (msg.includes("APARTADO_LIQUIDADO")) return { ok: false, error: "El apartado ya está liquidado" };
    if (msg.includes("APARTADO_NO_ACTIVO")) return { ok: false, error: "Apartado no disponible" };
    return { ok: false, error: msg };
  }
  const appliedCents = Number(applied ?? 0);

  const { error: movErr } = await db.from("cash_movements").insert({
    session_id: input.sessionId, type: "in", method: input.method, amount_cents: appliedCents,
    reference_id: input.layawayId, reference_type: "layaway", notes: "Abono de apartado", created_by: staff.id,
  });
  if (movErr) return { ok: false, error: `Caja: ${movErr.message}` };

  const { data: lay } = await db
    .from("layaways").select("folio, total_cents, paid_cents, due_date, customers(full_name)").eq("id", input.layawayId).maybeSingle();
  const l = lay as unknown as {
    folio: string | null; total_cents: number; paid_cents: number; due_date: string | null;
    customers: { full_name: string } | { full_name: string }[] | null;
  } | null;
  const customerName = (Array.isArray(l?.customers) ? l?.customers[0] : l?.customers)?.full_name ?? "—";
  const remaining = Math.max(0, (l?.total_cents ?? 0) - (l?.paid_cents ?? 0));

  revalidatePath("/pos");
  return {
    ok: true,
    appliedCents,
    remainingCents: remaining,
    comprobante: {
      docType: "abono",
      orderNumber: l?.folio ?? `AP-${input.layawayId.slice(0, 8).toUpperCase()}`,
      attendedBy: staff.fullName,
      items: [{ name: `Abono de apartado · ${customerName}`, quantity: 1, total_cents: appliedCents }],
      subtotal: 0, tax: 0, total: appliedCents, method: input.method,
      meta: [{ label: "Cliente", value: customerName }],
      sections: [{
        title: "Estado del apartado",
        rows: [
          { label: "Total", value: money(l?.total_cents ?? 0) },
          { label: "Abonado", value: money(l?.paid_cents ?? 0) },
          { label: "Saldo pendiente", value: money(remaining), strong: true },
          ...(l?.due_date ? [{ label: "Vence", value: l.due_date }] : []),
        ],
      }],
    },
  };
}

// Entrega del apartado liquidado: se convierte en venta y sale del inventario.
// El dinero YA entró como abonos en turnos anteriores, así que no genera movimiento
// de caja (el corte lo marca como "apartado liquidado").
export async function convertLayaway(input: {
  sessionId: string; layawayId: string;
}): Promise<{ ok: boolean; error?: string; comprobante?: ReceiptData }> {
  const staff = await requireStaff();
  const db = createAdminClient();

  const { data: lay } = await db
    .from("layaways").select("customer_id, variant_id, total_cents, paid_cents, status").eq("id", input.layawayId).maybeSingle();
  const l = lay as { customer_id: string; variant_id: string | null; total_cents: number; paid_cents: number; status: string } | null;
  if (!l || l.status !== "active") return { ok: false, error: "Apartado no disponible" };
  if (l.paid_cents < l.total_cents) return { ok: false, error: "Aún hay saldo pendiente por abonar" };

  // Partidas del apartado (los apartados viejos traen una sola por el backfill).
  const items = await layawayItems(db, input.layawayId);
  const lines = items.length
    ? items
    : [{ variant_id: l.variant_id, sku: "APARTADO", name: "Apartado", unit_price_cents: l.total_cents, quantity: 1, total_cents: l.total_cents }];

  // Precios con IVA incluido, igual que en la venta normal.
  const total = l.total_cents;
  const base = Math.round(total / (1 + TAX_RATE));
  const tax = total - base;

  const { data: order, error } = await db
    .from("orders").insert({
      channel: "pos", status: "completed", customer_id: l.customer_id,
      subtotal_cents: base, tax_cents: tax, total_cents: total,
      cash_session_id: input.sessionId, created_by: staff.id,
      notes: "Apartado liquidado — cobrado en abonos previos",
    }).select("id, order_number").single();
  if (error || !order) return { ok: false, error: error?.message ?? "No se pudo cerrar el apartado" };
  const o = order as { id: string; order_number: string };

  await db.from("order_items").insert(lines.map((it) => ({
    order_id: o.id, variant_id: it.variant_id, sku: it.sku, name: it.name,
    unit_price_cents: it.unit_price_cents, quantity: it.quantity, total_cents: it.total_cents,
  })));
  await db.from("payments").insert({ order_id: o.id, method: "layaway", amount_cents: total, status: "completed" });

  // Liberar la reserva ANTES de descontar: decrement_stock valida quantity - reserved.
  for (const it of lines) {
    if (!it.variant_id) continue;
    await db.rpc("release_reserved", { p_variant: it.variant_id, p_location_key: "tienda", p_qty: it.quantity });
    const { error: stockErr } = await db.rpc("decrement_stock", {
      p_variant: it.variant_id, p_location_key: "tienda", p_qty: it.quantity,
      p_ref_type: "layaway", p_ref_id: o.id,
    });
    if (stockErr) return { ok: false, error: `Stock: ${stockErr.message}` };
  }

  await db.from("layaways").update({ status: "completed", order_id: o.id }).eq("id", input.layawayId);

  revalidatePath("/pos");
  return {
    ok: true,
    comprobante: {
      docType: "sale",
      orderNumber: o.order_number,
      attendedBy: staff.fullName,
      items: lines.map((it) => ({ name: it.name, quantity: it.quantity, total_cents: it.total_cents })),
      subtotal: base, tax, total,
      payments: [{ method: "layaway", amount_cents: total }],
      sections: [{ title: "Apartado", rows: [{ label: `Liquidado en abonos previos (${methodLabel("layaway")})` }] }],
    },
  };
}

// ── Crédito a clientes (solo tienda física) ──────────────────────────────────
// El cargo NO se teclea a mano: nace de una venta a crédito (ver applySale en
// pos/actions.ts), que descuenta la pieza del inventario y liga el cargo a la orden.
// Aquí sólo se abre la cuenta y se reciben abonos.
export async function createCreditAccount(input: {
  customerId: string; limitPesos: number;
}): Promise<{ ok: boolean; error?: string }> {
  await requireStaff();
  const db = createAdminClient();
  if (!input.customerId) return { ok: false, error: "Selecciona un cliente" };
  const { error } = await db.from("credit_accounts").insert({
    customer_id: input.customerId, limit_cents: pesos(input.limitPesos), balance_cents: 0, status: "active",
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pos");
  return { ok: true };
}

export async function addCreditPayment(input: {
  sessionId: string; accountId: string; amountCents: number; method: Method;
}): Promise<AbonoResult> {
  const staff = await requireStaff();
  const db = createAdminClient();
  if (input.amountCents <= 0) return { ok: false, error: "Importe inválido" };

  // El RPC topa el abono al saldo y devuelve lo aplicado.
  const { data: applied, error } = await db.rpc("pay_credit", {
    p_account: input.accountId, p_amount: input.amountCents, p_method: input.method,
    p_session: input.sessionId, p_by: staff.id,
  });
  if (error) {
    const msg = String(error.message);
    if (msg.includes("SIN_SALDO")) return { ok: false, error: "La cuenta no tiene saldo por cobrar" };
    return { ok: false, error: msg };
  }
  const appliedCents = Number(applied ?? 0);

  const { error: movErr } = await db.from("cash_movements").insert({
    session_id: input.sessionId, type: "in", method: input.method, amount_cents: appliedCents,
    reference_id: input.accountId, reference_type: "credit", notes: "Abono de crédito", created_by: staff.id,
  });
  if (movErr) return { ok: false, error: `Caja: ${movErr.message}` };

  const { data: acc } = await db
    .from("credit_accounts").select("limit_cents, balance_cents, customers(full_name)").eq("id", input.accountId).maybeSingle();
  const a = acc as unknown as {
    limit_cents: number; balance_cents: number;
    customers: { full_name: string } | { full_name: string }[] | null;
  } | null;
  const customerName = (Array.isArray(a?.customers) ? a?.customers[0] : a?.customers)?.full_name ?? "—";

  revalidatePath("/pos");
  return {
    ok: true,
    appliedCents,
    remainingCents: a?.balance_cents ?? 0,
    comprobante: {
      docType: "abono",
      orderNumber: `CREDITO ${input.accountId.slice(0, 8)}`,
      attendedBy: staff.fullName,
      items: [{ name: `Abono a crédito · ${customerName}`, quantity: 1, total_cents: appliedCents }],
      subtotal: 0, tax: 0, total: appliedCents, method: input.method,
      meta: [{ label: "Cliente", value: customerName }],
      sections: [{
        title: "Estado de la cuenta",
        rows: [
          { label: "Límite", value: money(a?.limit_cents ?? 0) },
          { label: "Saldo por cobrar", value: money(a?.balance_cents ?? 0), strong: true },
        ],
      }],
    },
  };
}

// ── Carga de datos para el panel ─────────────────────────────────────────────
export type AccountsData = {
  layaways: { id: string; folio: string; customer: string; items: string; total: number; paid: number; dueDate: string | null }[];
  credits: { id: string; customer: string; limit: number; balance: number; overdue: boolean }[];
};

// `q` filtra por cliente o por folio del apartado (el panel llegaba a traer TODO).
export async function getAccountsData(q?: string): Promise<AccountsData> {
  await requireStaff();
  const db = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const term = (q ?? "").trim();
  // Un folio (AP-000123 o "123") no debe filtrar la lista de créditos, que no tiene.
  const looksLikeFolio = /^(ap-?)?\d+$/i.test(term);

  let layQ = db
    .from("layaways")
    .select("id, folio, total_cents, paid_cents, due_date, customers!inner(full_name), layaway_items(name, quantity)")
    .eq("status", "active").order("created_at", { ascending: false }).limit(50);
  let accQ = db
    .from("credit_accounts")
    .select("id, limit_cents, balance_cents, status, customers!inner(full_name), credit_transactions(type, due_date)")
    .order("created_at", { ascending: false }).limit(50);
  if (term) {
    layQ = looksLikeFolio
      ? layQ.ilike("folio", `%${term.replace(/^ap-?/i, "")}%`)
      : layQ.ilike("customers.full_name", `%${term}%`);
    accQ = accQ.ilike("customers.full_name", `%${term}%`);
  }
  const [{ data: lays }, { data: accs }] = await Promise.all([layQ, accQ]);

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

  const layaways = ((lays as unknown as {
    id: string; folio: string | null; total_cents: number; paid_cents: number; due_date: string | null;
    customers: { full_name: string } | { full_name: string }[] | null;
    layaway_items: { name: string; quantity: number }[] | null;
  }[]) ?? []).map((l) => ({
    id: l.id,
    folio: l.folio ?? `AP-${l.id.slice(0, 8).toUpperCase()}`,
    customer: one(l.customers)?.full_name ?? "—",
    items: (l.layaway_items ?? []).map((it) => `${it.quantity}× ${it.name}`).join(" · ") || "Apartado",
    total: l.total_cents, paid: l.paid_cents, dueDate: l.due_date,
  }));

  const credits = ((accs as unknown as {
    id: string; limit_cents: number; balance_cents: number; status: string;
    customers: { full_name: string } | { full_name: string }[] | null;
    credit_transactions: { type: string; due_date: string | null }[] | null;
  }[]) ?? []).map((a) => {
    const overdue = (a.credit_transactions ?? []).some((t) => t.type === "charge" && t.due_date && t.due_date < today) && a.balance_cents > 0;
    return { id: a.id, customer: one(a.customers)?.full_name ?? "—", limit: a.limit_cents, balance: a.balance_cents, overdue };
  });

  return { layaways, credits };
}
