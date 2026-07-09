"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function loginRewards(
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  if (!email.trim() || !password) return { ok: false, error: "Ingresa tu correo y contraseña" };
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("not confirmed")) return { ok: false, error: "Tu cuenta aún no está confirmada. Revisa tu correo para activarla." };
    if (m.includes("invalid login")) return { ok: false, error: "Correo o contraseña incorrectos, o la cuenta no existe." };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function registerRewards(input: {
  fullName: string;
  email: string;
  phone: string;
  password: string;
}): Promise<{ ok: boolean; error?: string; needsConfirm?: boolean }> {
  const supabase = await createClient();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { full_name: input.fullName, phone: input.phone, rewards: "true" },
      emailRedirectTo: `${site}/rewards`,
    },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, needsConfirm: !data.session };
}

export async function logoutRewards() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/rewards/acceso");
}
