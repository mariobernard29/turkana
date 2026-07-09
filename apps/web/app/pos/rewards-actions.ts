"use server";

import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type RewardsLookup =
  | { found: true; customerId: string; name: string; balanceCents: number }
  | { found: false; error: string };

// Busca un cliente registrado en Rewards por correo (debe tener cuenta).
export async function lookupRewardsCustomer(email: string): Promise<RewardsLookup> {
  await requireStaff();
  const db = createAdminClient();
  const clean = email.trim().toLowerCase();
  if (!clean) return { found: false, error: "Ingresa un correo" };

  const { data } = await db
    .from("customers")
    .select("id, full_name, auth_user_id, customer_rewards(balance_cents)")
    .eq("email", clean)
    .maybeSingle();

  const c = data as unknown as {
    id: string; full_name: string; auth_user_id: string | null;
    customer_rewards: { balance_cents: number } | { balance_cents: number }[] | null;
  } | null;

  if (!c || !c.auth_user_id) {
    return { found: false, error: "Ese correo no está registrado en Turkana Rewards. El cliente puede crear su cuenta en turkanajewelry.com/rewards" };
  }
  const rw = Array.isArray(c.customer_rewards) ? c.customer_rewards[0] : c.customer_rewards;
  return { found: true, customerId: c.id, name: c.full_name, balanceCents: rw?.balance_cents ?? 0 };
}
