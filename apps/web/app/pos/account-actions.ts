"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type DB = ReturnType<typeof createAdminClient>;
const pesos = (n: number) => Math.round((n || 0) * 100);

async function findOrCreateCustomer(
  db: DB,
  c: { name: string; email?: string; phone?: string },
): Promise<string> {
  if (c.email) {
    const { data } = await db.from("customers").select("id").eq("email", c.email).maybeSingle();
    if (data) {
      const id = (data as { id: string }).id;
      await db.from("customers").update({ full_name: c.name, phone: c.phone || null }).eq("id", id);
      return id;
    }
  }
  const { data: created } = await db
    .from("customers")
    .insert({ full_name: c.name, email: c.email || null, phone: c.phone || null })
    .select("id").single();
  return (created as { id: string }).id;
}

async function tiendaLocation(db: DB): Promise<string | null> {
  const { data } = await db.from("inventory_locations").select("id").eq("key", "tienda").maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function adjustReserved(db: DB, variantId: string, delta: number) {
  const locId = await tiendaLocation(db);
  if (!locId) return;
  const { data: row } = await db
    .from("stock_levels").select("id, reserved").eq("variant_id", variantId).eq("location_id", locId).maybeSingle();
  if (row) {
    const r = row as { id: string; reserved: number };
    await db.from("stock_levels").update({ reserved: Math.max(0, r.reserved + delta) }).eq("id", r.id);
  } else {
    await db.from("stock_levels").insert({ variant_id: variantId, location_id: locId, quantity: 0, reserved: Math.max(0, delta) });
  }
}

// ── Apartados ────────────────────────────────────────────────────────────────
export async function createLayaway(input: {
  sessionId: string;
  customer: { name: string; email?: string; phone?: string };
  variantId?: string;
  totalPesos: number;
  anticipoPesos: number;
  method: "cash" | "debit" | "credit_card" | "amex" | "transfer";
  dueDate?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireStaff();
  const db = createAdminClient();
  if (!input.customer.name?.trim()) return { ok: false, error: "Nombre del cliente requerido" };

  const total = pesos(input.totalPesos);
  const anticipo = pesos(input.anticipoPesos);
  if (total <= 0) return { ok: false, error: "Total inválido" };
  if (anticipo > total) return { ok: false, error: "El anticipo no puede superar el total" };

  const customerId = await findOrCreateCustomer(db, input.customer);

  const { data: lay, error } = await db
    .from("layaways")
    .insert({
      customer_id: customerId, variant_id: input.variantId || null,
      total_cents: total, paid_cents: anticipo, status: "active",
      due_date: input.dueDate || null, created_by: staff.id,
    })
    .select("id").single();
  if (error || !lay) return { ok: false, error: error?.message ?? "No se pudo crear el apartado" };
  const layawayId = (lay as { id: string }).id;

  if (anticipo > 0) {
    await db.from("layaway_payments").insert({ layaway_id: layawayId, amount_cents: anticipo, method: input.method, created_by: staff.id });
    await db.from("cash_movements").insert({ session_id: input.sessionId, type: "in", method: input.method, amount_cents: anticipo, reference_id: layawayId, created_by: staff.id });
  }
  if (input.variantId) await adjustReserved(db, input.variantId, 1);

  revalidatePath("/pos");
  return { ok: true };
}

export async function addLayawayPayment(input: {
  sessionId: string; layawayId: string; amountPesos: number; method: "cash" | "debit" | "credit_card" | "amex" | "transfer";
}): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireStaff();
  const db = createAdminClient();
  const amount = pesos(input.amountPesos);
  if (amount <= 0) return { ok: false, error: "Importe inválido" };

  const { data: lay } = await db.from("layaways").select("total_cents, paid_cents, status").eq("id", input.layawayId).maybeSingle();
  const l = lay as { total_cents: number; paid_cents: number; status: string } | null;
  if (!l || l.status !== "active") return { ok: false, error: "Apartado no disponible" };

  const newPaid = Math.min(l.total_cents, l.paid_cents + amount);
  await db.from("layaways").update({ paid_cents: newPaid }).eq("id", input.layawayId);
  await db.from("layaway_payments").insert({ layaway_id: input.layawayId, amount_cents: amount, method: input.method, created_by: staff.id });
  await db.from("cash_movements").insert({ session_id: input.sessionId, type: "in", method: input.method, amount_cents: amount, reference_id: input.layawayId, created_by: staff.id });

  revalidatePath("/pos");
  return { ok: true };
}

export async function convertLayaway(input: {
  sessionId: string; layawayId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireStaff();
  const db = createAdminClient();

  const { data: lay } = await db
    .from("layaways").select("customer_id, variant_id, total_cents, paid_cents, status").eq("id", input.layawayId).maybeSingle();
  const l = lay as { customer_id: string; variant_id: string | null; total_cents: number; paid_cents: number; status: string } | null;
  if (!l || l.status !== "active") return { ok: false, error: "Apartado no disponible" };
  if (l.paid_cents < l.total_cents) return { ok: false, error: "Aún hay saldo pendiente por abonar" };

  // Datos de la variante (para la partida).
  let sku = "APARTADO", name = "Apartado";
  if (l.variant_id) {
    const { data: v } = await db.from("product_variants").select("sku, products(name)").eq("id", l.variant_id).maybeSingle();
    const vr = v as { sku: string; products: { name: string } | { name: string }[] | null } | null;
    if (vr) { sku = vr.sku; const p = Array.isArray(vr.products) ? vr.products[0] : vr.products; name = p?.name ?? sku; }
  }

  const { data: order, error } = await db
    .from("orders").insert({
      channel: "pos", status: "completed", customer_id: l.customer_id,
      subtotal_cents: l.total_cents, tax_cents: 0, total_cents: l.total_cents,
      cash_session_id: input.sessionId, created_by: staff.id,
    }).select("id").single();
  if (error || !order) return { ok: false, error: error?.message ?? "No se pudo cerrar el apartado" };
  const orderId = (order as { id: string }).id;

  await db.from("order_items").insert({ order_id: orderId, variant_id: l.variant_id, sku, name, unit_price_cents: l.total_cents, quantity: 1, total_cents: l.total_cents });
  await db.from("payments").insert({ order_id: orderId, method: "layaway", amount_cents: l.total_cents, status: "completed" });

  // Consumir la pieza reservada.
  if (l.variant_id) {
    const locId = await tiendaLocation(db);
    if (locId) {
      const { data: row } = await db.from("stock_levels").select("id, quantity, reserved").eq("variant_id", l.variant_id).eq("location_id", locId).maybeSingle();
      if (row) {
        const r = row as { id: string; quantity: number; reserved: number };
        await db.from("stock_levels").update({ quantity: r.quantity - 1, reserved: Math.max(0, r.reserved - 1) }).eq("id", r.id);
      }
      await db.from("inventory_movements").insert({ variant_id: l.variant_id, location_id: locId, type: "venta", quantity: -1, reference_type: "layaway", reference_id: orderId, created_by: staff.id });
    }
  }

  await db.from("layaways").update({ status: "completed", order_id: orderId }).eq("id", input.layawayId);
  await db.rpc("credit_rewards", { p_customer: l.customer_id, p_order: orderId, p_subtotal_cents: l.total_cents, p_channel: "pos" });

  revalidatePath("/pos");
  return { ok: true };
}

// ── Crédito a clientes (solo tienda física) ──────────────────────────────────
export async function createCreditAccount(input: {
  customer: { name: string; email?: string; phone?: string }; limitPesos: number;
}): Promise<{ ok: boolean; error?: string }> {
  await requireStaff();
  const db = createAdminClient();
  if (!input.customer.name?.trim()) return { ok: false, error: "Nombre del cliente requerido" };
  const customerId = await findOrCreateCustomer(db, input.customer);
  const { error } = await db.from("credit_accounts").insert({ customer_id: customerId, limit_cents: pesos(input.limitPesos), balance_cents: 0, status: "active" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pos");
  return { ok: true };
}

export async function addCreditCharge(input: {
  accountId: string; amountPesos: number; dueDate?: string; notes?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireStaff();
  const db = createAdminClient();
  const amount = pesos(input.amountPesos);
  if (amount <= 0) return { ok: false, error: "Importe inválido" };

  const { data: acc } = await db.from("credit_accounts").select("limit_cents, balance_cents").eq("id", input.accountId).maybeSingle();
  const a = acc as { limit_cents: number; balance_cents: number } | null;
  if (!a) return { ok: false, error: "Cuenta no encontrada" };
  if (a.balance_cents + amount > a.limit_cents) return { ok: false, error: "Excede el límite de crédito" };

  await db.from("credit_transactions").insert({ account_id: input.accountId, type: "charge", amount_cents: amount, due_date: input.dueDate || null, status: "vigente" });
  await db.from("credit_accounts").update({ balance_cents: a.balance_cents + amount }).eq("id", input.accountId);

  await db.from("audit_logs").insert({ actor_id: staff.id, action: "credit.charge", entity_type: "credit_accounts", entity_id: input.accountId });
  revalidatePath("/pos");
  return { ok: true };
}

export async function addCreditPayment(input: {
  sessionId: string; accountId: string; amountPesos: number; method: "cash" | "debit" | "credit_card" | "amex" | "transfer";
}): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireStaff();
  const db = createAdminClient();
  const amount = pesos(input.amountPesos);
  if (amount <= 0) return { ok: false, error: "Importe inválido" };

  const { data: acc } = await db.from("credit_accounts").select("balance_cents").eq("id", input.accountId).maybeSingle();
  const a = acc as { balance_cents: number } | null;
  if (!a) return { ok: false, error: "Cuenta no encontrada" };
  const applied = Math.min(amount, a.balance_cents);

  await db.from("credit_transactions").insert({ account_id: input.accountId, type: "payment", amount_cents: applied, status: "pagado" });
  await db.from("credit_accounts").update({ balance_cents: a.balance_cents - applied }).eq("id", input.accountId);
  await db.from("cash_movements").insert({ session_id: input.sessionId, type: "in", method: input.method, amount_cents: applied, reference_id: input.accountId, created_by: staff.id });

  revalidatePath("/pos");
  return { ok: true };
}

// ── Carga de datos para el panel ─────────────────────────────────────────────
export type AccountsData = {
  layaways: { id: string; customer: string; item: string; total: number; paid: number; dueDate: string | null }[];
  credits: { id: string; customer: string; limit: number; balance: number; overdue: boolean }[];
};

export async function getAccountsData(): Promise<AccountsData> {
  await requireStaff();
  const db = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: lays } = await db
    .from("layaways")
    .select("id, total_cents, paid_cents, due_date, customers(full_name), product_variants(sku, products(name))")
    .eq("status", "active").order("created_at", { ascending: false });

  const { data: accs } = await db
    .from("credit_accounts")
    .select("id, limit_cents, balance_cents, status, customers(full_name), credit_transactions(type, due_date)")
    .order("created_at", { ascending: false });

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

  const layaways = ((lays as unknown as {
    id: string; total_cents: number; paid_cents: number; due_date: string | null;
    customers: { full_name: string } | { full_name: string }[] | null;
    product_variants: { sku: string; products: { name: string } | { name: string }[] | null } | { sku: string; products: { name: string } | { name: string }[] | null }[] | null;
  }[]) ?? []).map((l) => {
    const variant = one(l.product_variants);
    const prod = variant ? one(variant.products) : null;
    return {
      id: l.id, customer: one(l.customers)?.full_name ?? "—",
      item: prod?.name ?? variant?.sku ?? "Apartado",
      total: l.total_cents, paid: l.paid_cents, dueDate: l.due_date,
    };
  });

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
