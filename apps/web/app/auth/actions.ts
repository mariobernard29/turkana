"use server";

import { createClient } from "@/lib/supabase/server";

// Envía el correo de recuperación de contraseña. Sirve tanto para staff (admin/POS)
// como para clientes de Turkana Rewards; ambos son usuarios de Supabase Auth.
export async function requestPasswordReset(
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  const clean = email.trim();
  if (!clean) return { ok: false, error: "Ingresa tu correo" };

  const supabase = await createClient();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(clean, {
    redirectTo: `${site}/actualizar-contrasena`,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
