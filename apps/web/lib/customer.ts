// Helper de sesión de cliente (Turkana Rewards).
import { createClient } from "@/lib/supabase/server";

export type RewardsCustomer = {
  id: string;
  fullName: string;
  email: string | null;
  balanceCents: number;
  lifetimeCents: number;
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

// Devuelve el cliente autenticado (o null si no hay sesión de cliente).
export async function getCustomer(): Promise<RewardsCustomer | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("customers")
    .select("id, full_name, email, customer_rewards(balance_cents, lifetime_earned_cents)")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!data) return null;

  const c = data as unknown as {
    id: string; full_name: string; email: string | null;
    customer_rewards: { balance_cents: number; lifetime_earned_cents: number } | { balance_cents: number; lifetime_earned_cents: number }[] | null;
  };
  const rw = one(c.customer_rewards);
  return {
    id: c.id,
    fullName: c.full_name,
    email: c.email,
    balanceCents: rw?.balance_cents ?? 0,
    lifetimeCents: rw?.lifetime_earned_cents ?? 0,
  };
}
