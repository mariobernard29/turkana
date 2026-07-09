// Helpers de sesión y rol para el panel admin / POS (server-side).
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const STAFF_ROLES = [
  "super_admin",
  "admin",
  "gerente",
  "cajero",
  "inventarios",
  "atencion",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export type Staff = {
  id: string;
  email: string | undefined;
  fullName: string;
  role: StaffRole | null;
};

// Devuelve el perfil del usuario autenticado, o null si no hay sesión.
export async function getStaff(): Promise<Staff | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("full_name, roles(key)")
    .eq("id", user.id)
    .maybeSingle();

  const profile = data as unknown as {
    full_name?: string;
    roles?: { key?: string } | { key?: string }[] | null;
  } | null;

  // roles puede venir como objeto o arreglo según el join.
  const roleRel = profile?.roles as unknown;
  const roleKey = Array.isArray(roleRel)
    ? (roleRel[0]?.key ?? null)
    : ((roleRel as { key?: string } | null)?.key ?? null);

  return {
    id: user.id,
    email: user.email,
    fullName: profile?.full_name ?? user.email ?? "Usuario",
    role: (roleKey as StaffRole) ?? null,
  };
}

// Exige sesión de staff; redirige a /login si no la hay.
export async function requireStaff(redirectTo = "/admin"): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) {
    redirect(`/login?redirect=${encodeURIComponent(redirectTo)}`);
  }
  if (!staff.role || !STAFF_ROLES.includes(staff.role)) {
    redirect("/login?error=Sin%20permisos%20de%20staff");
  }
  return staff;
}
