// Verifica los enlaces de correo de Supabase (confirmación de cuenta y
// recuperación de contraseña) del lado servidor y establece la sesión en cookies.
// Los templates de correo deben apuntar aquí con ?token_hash=…&type=…&next=…
import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/";

  const supabase = await createClient();

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(new URL(next, origin));
  } else if (code) {
    // Flujo PKCE (?code=…) por compatibilidad.
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }

  const url = new URL("/login", origin);
  url.searchParams.set("error", "El enlace es inválido o ya expiró. Solicítalo de nuevo.");
  return NextResponse.redirect(url);
}
