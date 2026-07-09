"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type DB = ReturnType<typeof createAdminClient>;
type Res = { ok: boolean; error?: string };
const pesos = (n: number) => Math.round((n || 0) * 100);

async function tiendaLocation(db: DB): Promise<string | null> {
  const { data } = await db.from("inventory_locations").select("id").eq("key", "tienda").maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}
async function adjustReserved(db: DB, variantId: string, delta: number) {
  const locId = await tiendaLocation(db);
  if (!locId) return;
  const { data: row } = await db.from("stock_levels").select("id, reserved").eq("variant_id", variantId).eq("location_id", locId).maybeSingle();
  if (row) {
    const r = row as { id: string; reserved: number };
    await db.from("stock_levels").update({ reserved: Math.max(0, r.reserved + delta) }).eq("id", r.id);
  }
}
function revalidate(customerId?: string) {
  revalidatePath("/admin/clientes");
  revalidatePath("/admin/clientes/apartados");
  revalidatePath("/admin/clientes/creditos");
  if (customerId) revalidatePath(`/admin/clientes/${customerId}`);
}

// ── Apartados ────────────────────────────────────────────────────────────────
export async function addLayawayPayment(layawayId: string, amountPesos: number): Promise<Res> {
  const staff = await requireStaff();
  const db = createAdminClient();
  const amount = pesos(amountPesos);
  if (amount <= 0) return { ok: false, error: "Importe inválido" };

  const { data: lay } = await db.from("layaways").select("total_cents, paid_cents, status, customer_id").eq("id", layawayId).maybeSingle();
  const l = lay as { total_cents: number; paid_cents: number; status: string; customer_id: string } | null;
  if (!l || l.status !== "active") return { ok: false, error: "Apartado no disponible" };

  const newPaid = Math.min(l.total_cents, l.paid_cents + amount);
  await db.from("layaways").update({ paid_cents: newPaid }).eq("id", layawayId);
  await db.from("layaway_payments").insert({ layaway_id: layawayId, amount_cents: amount, method: "cash", created_by: staff.id });
  revalidate(l.customer_id);
  return { ok: true };
}

export async function convertLayawayToSale(layawayId: string): Promise<Res> {
  const staff = await requireStaff();
  const db = createAdminClient();

  const { data: lay } = await db.from("layaways").select("customer_id, variant_id, total_cents, paid_cents, status").eq("id", layawayId).maybeSingle();
  const l = lay as { customer_id: string; variant_id: string | null; total_cents: number; paid_cents: number; status: string } | null;
  if (!l || l.status !== "active") return { ok: false, error: "Apartado no disponible" };
  if (l.paid_cents < l.total_cents) return { ok: false, error: "Aún hay saldo pendiente por abonar" };

  let sku = "APARTADO", name = "Apartado";
  if (l.variant_id) {
    const { data: v } = await db.from("product_variants").select("sku, products(name)").eq("id", l.variant_id).maybeSingle();
    const vr = v as { sku: string; products: { name: string } | { name: string }[] | null } | null;
    if (vr) { sku = vr.sku; const p = Array.isArray(vr.products) ? vr.products[0] : vr.products; name = p?.name ?? sku; }
  }

  const { data: order, error } = await db.from("orders").insert({
    channel: "pos", status: "completed", customer_id: l.customer_id,
    subtotal_cents: l.total_cents, tax_cents: 0, total_cents: l.total_cents, created_by: staff.id,
  }).select("id").single();
  if (error || !order) return { ok: false, error: error?.message ?? "No se pudo cerrar el apartado" };
  const orderId = (order as { id: string }).id;

  await db.from("order_items").insert({ order_id: orderId, variant_id: l.variant_id, sku, name, unit_price_cents: l.total_cents, quantity: 1, total_cents: l.total_cents });
  await db.from("payments").insert({ order_id: orderId, method: "layaway", amount_cents: l.total_cents, status: "completed" });

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

  await db.from("layaways").update({ status: "completed", order_id: orderId }).eq("id", layawayId);
  revalidate(l.customer_id);
  return { ok: true };
}

export async function cancelLayaway(layawayId: string): Promise<Res> {
  await requireStaff();
  const db = createAdminClient();
  const { data: lay } = await db.from("layaways").select("variant_id, status, customer_id").eq("id", layawayId).maybeSingle();
  const l = lay as { variant_id: string | null; status: string; customer_id: string } | null;
  if (!l || l.status !== "active") return { ok: false, error: "Apartado no disponible" };
  await db.from("layaways").update({ status: "cancelled" }).eq("id", layawayId);
  if (l.variant_id) await adjustReserved(db, l.variant_id, -1);
  revalidate(l.customer_id);
  return { ok: true };
}

// ── Créditos ─────────────────────────────────────────────────────────────────
export async function addCreditCharge(accountId: string, amountPesos: number, dueDate?: string): Promise<Res> {
  const staff = await requireStaff();
  const db = createAdminClient();
  const amount = pesos(amountPesos);
  if (amount <= 0) return { ok: false, error: "Importe inválido" };
  const { data: acc } = await db.from("credit_accounts").select("limit_cents, balance_cents, customer_id").eq("id", accountId).maybeSingle();
  const a = acc as { limit_cents: number; balance_cents: number; customer_id: string } | null;
  if (!a) return { ok: false, error: "Cuenta no encontrada" };
  if (a.balance_cents + amount > a.limit_cents) return { ok: false, error: "Excede el límite de crédito" };
  await db.from("credit_transactions").insert({ account_id: accountId, type: "charge", amount_cents: amount, due_date: dueDate || null, status: "vigente" });
  await db.from("credit_accounts").update({ balance_cents: a.balance_cents + amount }).eq("id", accountId);
  await db.from("audit_logs").insert({ actor_id: staff.id, action: "credit.charge", entity_type: "credit_accounts", entity_id: accountId });
  revalidate(a.customer_id);
  return { ok: true };
}

export async function addCreditPayment(accountId: string, amountPesos: number): Promise<Res> {
  await requireStaff();
  const db = createAdminClient();
  const amount = pesos(amountPesos);
  if (amount <= 0) return { ok: false, error: "Importe inválido" };
  const { data: acc } = await db.from("credit_accounts").select("balance_cents, customer_id").eq("id", accountId).maybeSingle();
  const a = acc as { balance_cents: number; customer_id: string } | null;
  if (!a) return { ok: false, error: "Cuenta no encontrada" };
  const applied = Math.min(amount, a.balance_cents);
  await db.from("credit_transactions").insert({ account_id: accountId, type: "payment", amount_cents: applied, status: "pagado" });
  await db.from("credit_accounts").update({ balance_cents: a.balance_cents - applied }).eq("id", accountId);
  revalidate(a.customer_id);
  return { ok: true };
}

export async function setCreditLimit(accountId: string, limitPesos: number): Promise<Res> {
  await requireStaff();
  const db = createAdminClient();
  const { error } = await db.from("credit_accounts").update({ limit_cents: pesos(limitPesos) }).eq("id", accountId);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function toggleCreditStatus(accountId: string, status: "active" | "suspended"): Promise<Res> {
  await requireStaff();
  const db = createAdminClient();
  await db.from("credit_accounts").update({ status }).eq("id", accountId);
  revalidate();
  return { ok: true };
}
