"use server";

// Admin de apartados y crédito: SÓLO consulta y administración.
// Todo lo que mueve dinero (abonos y entrega del apartado) vive en el POS, donde
// hay una sesión de caja abierta y por lo tanto cuadra en el corte
// (ver app/pos/account-actions.ts).
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Res = { ok: boolean; error?: string };
const pesos = (n: number) => Math.round((n || 0) * 100);

function revalidate(customerId?: string) {
  revalidatePath("/admin/clientes");
  revalidatePath("/admin/clientes/apartados");
  revalidatePath("/admin/clientes/creditos");
  if (customerId) revalidatePath(`/admin/clientes/${customerId}`);
}

// ── Apartados ────────────────────────────────────────────────────────────────
export async function cancelLayaway(layawayId: string): Promise<Res> {
  await requireStaff();
  const db = createAdminClient();

  const { data: lay } = await db
    .from("layaways").select("variant_id, status, customer_id").eq("id", layawayId).maybeSingle();
  const l = lay as { variant_id: string | null; status: string; customer_id: string } | null;
  if (!l || l.status !== "active") return { ok: false, error: "Apartado no disponible" };

  await db.from("layaways").update({ status: "cancelled" }).eq("id", layawayId);

  // Liberar la reserva de cada pieza (los apartados pueden traer varias).
  const { data: items } = await db
    .from("layaway_items").select("variant_id, quantity").eq("layaway_id", layawayId);
  const lines = ((items as unknown as { variant_id: string | null; quantity: number }[]) ?? [])
    .filter((it) => it.variant_id);
  const toRelease = lines.length
    ? lines
    : l.variant_id ? [{ variant_id: l.variant_id, quantity: 1 }] : [];
  for (const it of toRelease) {
    await db.rpc("release_reserved", { p_variant: it.variant_id, p_location_key: "tienda", p_qty: it.quantity });
  }

  revalidate(l.customer_id);
  return { ok: true };
}

// ── Créditos ─────────────────────────────────────────────────────────────────
// El cargo nace de una venta a crédito en el POS (descuenta inventario y liga la
// orden). Aquí sólo se ajusta el límite o se suspende la cuenta.
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
