// Verifica que la app esté cableada: variables presentes y conexión a Supabase.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const env = {
    supabase_url: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabase_anon: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    service_role: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    stripe_secret: Boolean(process.env.STRIPE_SECRET_KEY),
    stripe_pk: Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
  };

  let supabaseOk = false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("app_settings").select("key").limit(1);
    supabaseOk = !error;
  } catch {
    supabaseOk = false;
  }

  return NextResponse.json({ ok: true, env, supabaseOk });
}
