"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const EMPLOYEE_CODE_RE = /^\d{4}$/;

// Traduce el número de empleado al correo con el que está dada de alta la cuenta.
// Vive aquí, del lado servidor, porque el navegador nunca necesita el correo real
// para entrar: manda el número y la contraseña, y el correo se resuelve acá.
async function emailForCode(code: string): Promise<string | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("profiles")
    .select("id")
    .eq("employee_code", code)
    .is("deleted_at", null)
    .maybeSingle();
  const id = (data as { id: string } | null)?.id;
  if (!id) return null;

  const { data: user } = await db.auth.admin.getUserById(id);
  return user?.user?.email ?? null;
}

// "nadiavazquez_0409@hotmail.com" → "na••••••@hotmail.com".
// La pantalla de login es pública: quien quiera puede probar los 10 000 números
// de cuatro dígitos, y con el correo completo se llevaría la lista del personal.
// Enmascarado alcanza para que cada quien reconozca su cuenta antes de teclear
// la contraseña, que es lo único que de verdad autentica.
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  const head = local.slice(0, 2);
  return `${head}${"•".repeat(Math.max(3, local.length - 2))}@${domain}`;
}

export type EmployeeHint =
  | { found: true; firstName: string; emailHint: string }
  | { found: false };

// Lo que ve el mostrador al teclear su número: de quién es la cuenta, para que
// no se dé cuenta del dedazo hasta después de escribir la contraseña.
export async function lookupEmployee(code: string): Promise<EmployeeHint> {
  const clean = code.trim();
  if (!EMPLOYEE_CODE_RE.test(clean)) return { found: false };

  const db = createAdminClient();
  const { data } = await db
    .from("profiles")
    .select("id, full_name, is_active")
    .eq("employee_code", clean)
    .is("deleted_at", null)
    .maybeSingle();

  const profile = data as { id: string; full_name: string; is_active: boolean } | null;
  if (!profile || !profile.is_active) return { found: false };

  const { data: user } = await db.auth.admin.getUserById(profile.id);
  const email = user?.user?.email;
  if (!email) return { found: false };

  return {
    found: true,
    firstName: profile.full_name.trim().split(/\s+/)[0] ?? profile.full_name,
    emailHint: maskEmail(email),
  };
}

export async function login(formData: FormData) {
  // El campo acepta el número de empleado o, para quien lo prefiera, el correo
  // de siempre: se distinguen por la arroba.
  const identifier = String(formData.get("identificador") ?? "").trim();
  const password = String(formData.get("password"));
  const dest = String(formData.get("redirect") || "/admin");

  const porCorreo = identifier.includes("@");
  // El tipo va en la variable, no en la flecha: así TypeScript sabe que después
  // de fail() no se sigue ejecutando y no exige comprobar de nuevo el correo.
  const fail: (msg: string) => never = (msg) => redirect(`/login?error=${encodeURIComponent(msg)}`);

  if (!porCorreo && !EMPLOYEE_CODE_RE.test(identifier)) {
    fail("Escribe tu número de empleado (4 dígitos) o tu correo");
  }

  // Mismo mensaje que una contraseña mala: decir "ese número no existe" es
  // regalar cuáles de los 10 000 números están en uso.
  const email = porCorreo ? identifier : await emailForCode(identifier);
  if (!email) fail("Número de empleado o contraseña incorrectos");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Log del lado servidor para diagnóstico (revisa la terminal de `npm run dev`).
    console.error("[login] signInWithPassword error:", error);
    const msg = error.message?.trim() || error.code || "Error de autenticación";
    fail(porCorreo ? msg : "Número de empleado o contraseña incorrectos");
  }
  redirect(dest);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
