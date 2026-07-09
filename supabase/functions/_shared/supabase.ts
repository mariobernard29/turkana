// Cliente admin (service_role) para usar SOLO dentro de Edge Functions.
// Salta RLS de forma controlada; jamás exponer esta clave al cliente.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

// Dispara un correo reutilizando la función send-email.
export async function sendEmail(template: string, to: string, data: unknown) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`;
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({ template, to, data }),
  });
}
