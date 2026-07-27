"use server";

// Clientes en el POS: buscar por nombre/teléfono/correo y crear al vuelo.
// Antes sólo se podía adjuntar un cliente registrado en Rewards por correo exacto,
// así que un cliente de mostrador (el típico de fiado) era imposible de asociar.
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { findOrCreateCustomer, normalizePhone } from "@/lib/customers";

export type PosCustomer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  hasAccount: boolean;          // registrado en Turkana Rewards
  rewardsBalanceCents: number;
  credit: { accountId: string; limitCents: number; balanceCents: number; status: string } | null;
};

type Row = {
  id: string; full_name: string; phone: string | null; email: string | null; auth_user_id: string | null;
  customer_rewards: { balance_cents: number } | { balance_cents: number }[] | null;
  credit_accounts: { id: string; limit_cents: number; balance_cents: number; status: string; created_at: string }[] | null;
};

const SELECT =
  "id, full_name, phone, email, auth_user_id, customer_rewards(balance_cents), credit_accounts(id, limit_cents, balance_cents, status, created_at)";

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

function toPosCustomer(r: Row): PosCustomer {
  // Se toma la cuenta de crédito activa más reciente (la tabla permite varias).
  const active = (r.credit_accounts ?? [])
    .filter((a) => a.status === "active")
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  return {
    id: r.id,
    name: r.full_name,
    phone: r.phone,
    email: r.email,
    hasAccount: Boolean(r.auth_user_id),
    rewardsBalanceCents: one(r.customer_rewards)?.balance_cents ?? 0,
    credit: active
      ? { accountId: active.id, limitCents: active.limit_cents, balanceCents: active.balance_cents, status: active.status }
      : null,
  };
}

export async function searchCustomers(q: string): Promise<PosCustomer[]> {
  await requireStaff();
  const term = q.trim();
  if (term.length < 2) return [];
  const db = createAdminClient();

  const digits = normalizePhone(term);
  const like = `%${term}%`;
  const filters = [`full_name.ilike.${like}`, `email.ilike.${like}`, `phone.ilike.${like}`];
  if (digits.length >= 3) filters.push(`phone.ilike.%${digits}%`);

  const { data } = await db
    .from("customers")
    .select(SELECT)
    .is("deleted_at", null)
    .or(filters.join(","))
    .order("full_name")
    .limit(10);

  return ((data as unknown as Row[]) ?? []).map(toPosCustomer);
}

// Interna (no es acción): la usa createPosCustomer para devolver el cliente ya armado.
async function getPosCustomer(id: string): Promise<PosCustomer | null> {
  const db = createAdminClient();
  const { data } = await db.from("customers").select(SELECT).eq("id", id).maybeSingle();
  return data ? toPosCustomer(data as unknown as Row) : null;
}

export async function createPosCustomer(input: {
  name: string; phone?: string; email?: string;
}): Promise<{ ok: boolean; customer?: PosCustomer; error?: string }> {
  await requireStaff();
  if (!input.name?.trim()) return { ok: false, error: "Nombre del cliente requerido" };
  const db = createAdminClient();
  try {
    const id = await findOrCreateCustomer(db, { name: input.name.trim(), email: input.email, phone: input.phone });
    const customer = await getPosCustomer(id);
    return customer ? { ok: true, customer } : { ok: false, error: "No se pudo leer el cliente" };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "No se pudo crear el cliente" };
  }
}
