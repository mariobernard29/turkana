"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Res = { ok: boolean; error?: string };
const ADMIN_ROLES = ["super_admin", "admin"];

async function guard(): Promise<{ id: string; role: string | null } | { error: string }> {
  const staff = await requireStaff();
  if (!ADMIN_ROLES.includes(staff.role ?? "")) return { error: "Solo administradores pueden gestionar usuarios" };
  return { id: staff.id, role: staff.role };
}

export type StaffUser = { id: string; fullName: string; email: string | null; employeeCode: string | null; roleId: string | null; roleKey: string | null; isActive: boolean };

// Sin exportar: en un archivo "use server" sólo pueden salir funciones async.
const EMPLOYEE_CODE_RE = /^\d{4}$/;

// Busca un código de cuatro dígitos que nadie esté usando. Al azar, no
// secuencial: con 1001, 1002, 1003… basta ver uno para adivinar los demás.
async function freeEmployeeCode(db: ReturnType<typeof createAdminClient>): Promise<string | null> {
  for (let i = 0; i < 40; i++) {
    const code = String(1000 + Math.floor(Math.random() * 9000));
    const { data } = await db.from("profiles").select("id").eq("employee_code", code).is("deleted_at", null).maybeSingle();
    if (!data) return code;
  }
  return null;
}

export async function getStaffUsers(): Promise<StaffUser[]> {
  const g = await guard();
  if ("error" in g) return [];
  const db = createAdminClient();

  const { data: profiles } = await db
    .from("profiles")
    .select("id, full_name, is_active, role_id, employee_code, roles(key)")
    .is("deleted_at", null)
    .order("full_name");

  const { data: authList } = await db.auth.admin.listUsers({ perPage: 1000 });
  const emailMap = new Map((authList?.users ?? []).map((u) => [u.id, u.email ?? null]));

  return ((profiles as unknown as { id: string; full_name: string; is_active: boolean; role_id: string | null; employee_code: string | null; roles: { key: string } | { key: string }[] | null }[]) ?? []).map((p) => {
    const role = Array.isArray(p.roles) ? p.roles[0] : p.roles;
    return { id: p.id, fullName: p.full_name, email: emailMap.get(p.id) ?? null, employeeCode: p.employee_code, roleId: p.role_id, roleKey: role?.key ?? null, isActive: p.is_active };
  });
}

export async function createStaffUser(input: { email: string; password: string; fullName: string; roleId: string; employeeCode?: string }): Promise<Res & { employeeCode?: string }> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  const db = createAdminClient();
  if (!input.email.trim() || input.password.length < 6 || !input.fullName.trim() || !input.roleId) return { ok: false, error: "Completa todos los campos (contraseña mín. 6)" };

  // El número es con lo que va a entrar al POS: si no lo eligen, se le da uno.
  const wanted = input.employeeCode?.trim();
  if (wanted && !EMPLOYEE_CODE_RE.test(wanted)) return { ok: false, error: "El número de empleado son 4 dígitos" };
  if (wanted) {
    const { data: taken } = await db.from("profiles").select("full_name").eq("employee_code", wanted).is("deleted_at", null).maybeSingle();
    if (taken) return { ok: false, error: `El número ${wanted} ya es de ${(taken as { full_name: string }).full_name}` };
  }
  const code = wanted || await freeEmployeeCode(db);
  if (!code) return { ok: false, error: "No se encontró un número de empleado libre" };

  const { data, error } = await db.auth.admin.createUser({
    email: input.email.trim(), password: input.password, email_confirm: true,
    user_metadata: { full_name: input.fullName.trim() },
  });
  if (error || !data.user) return { ok: false, error: error?.message ?? "No se pudo crear el usuario" };

  const { error: pErr } = await db.from("profiles").insert({ id: data.user.id, role_id: input.roleId, full_name: input.fullName.trim(), employee_code: code, created_by: g.id });
  if (pErr) {
    // Sin perfil el usuario no es staff y no podría entrar: se deshace el alta
    // para no dejar una cuenta de auth suelta.
    await db.auth.admin.deleteUser(data.user.id);
    return { ok: false, error: pErr.message };
  }

  revalidatePath("/admin/ajustes");
  return { ok: true, employeeCode: code };
}

// Cambia el número de empleado. Vacío = se le genera uno nuevo, para cuando
// alguien deja de reconocer el suyo o se lo aprendió otra persona.
export async function setEmployeeCode(userId: string, code: string): Promise<Res & { employeeCode?: string }> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  const db = createAdminClient();

  const wanted = code.trim();
  if (wanted && !EMPLOYEE_CODE_RE.test(wanted)) return { ok: false, error: "El número de empleado son 4 dígitos" };

  if (wanted) {
    const { data: taken } = await db.from("profiles").select("id, full_name").eq("employee_code", wanted).is("deleted_at", null).maybeSingle();
    const hit = taken as { id: string; full_name: string } | null;
    if (hit && hit.id !== userId) return { ok: false, error: `El número ${wanted} ya es de ${hit.full_name}` };
  }

  const nuevo = wanted || await freeEmployeeCode(db);
  if (!nuevo) return { ok: false, error: "No se encontró un número de empleado libre" };

  const { error } = await db.from("profiles").update({ employee_code: nuevo }).eq("id", userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/ajustes");
  return { ok: true, employeeCode: nuevo };
}

export async function setUserRole(userId: string, roleId: string): Promise<Res> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  const db = createAdminClient();
  const { error } = await db.from("profiles").update({ role_id: roleId }).eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/ajustes");
  return { ok: true };
}

export async function toggleUserActive(userId: string, active: boolean): Promise<Res> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  if (userId === g.id) return { ok: false, error: "No puedes desactivar tu propia cuenta" };
  const db = createAdminClient();
  await db.from("profiles").update({ is_active: active }).eq("id", userId);
  // Bloquea/desbloquea el acceso real.
  await db.auth.admin.updateUserById(userId, { ban_duration: active ? "none" : "876000h" });
  revalidatePath("/admin/ajustes");
  return { ok: true };
}

export async function deleteStaffUser(userId: string): Promise<Res> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  if (userId === g.id) return { ok: false, error: "No puedes eliminar tu propia cuenta" };
  const db = createAdminClient();
  const { error } = await db.auth.admin.deleteUser(userId); // el profile cae por cascade
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/ajustes");
  return { ok: true };
}

// ── Roles y permisos ─────────────────────────────────────────────────────────
export type RolesData = {
  roles: { id: string; key: string; name: string }[];
  permissions: { id: string; key: string; description: string | null }[];
  granted: string[]; // "roleId:permissionId"
};

export async function getRolesData(): Promise<RolesData> {
  const g = await guard();
  if ("error" in g) return { roles: [], permissions: [], granted: [] };
  const db = createAdminClient();
  const [roles, perms, rp] = await Promise.all([
    db.from("roles").select("id, key, name").order("name"),
    db.from("permissions").select("id, key, description").order("key"),
    db.from("role_permissions").select("role_id, permission_id"),
  ]);
  return {
    roles: (roles.data as unknown as { id: string; key: string; name: string }[]) ?? [],
    permissions: (perms.data as unknown as { id: string; key: string; description: string | null }[]) ?? [],
    granted: ((rp.data as unknown as { role_id: string; permission_id: string }[]) ?? []).map((r) => `${r.role_id}:${r.permission_id}`),
  };
}

export async function toggleRolePermission(roleId: string, permissionId: string, enabled: boolean): Promise<Res> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  const db = createAdminClient();
  if (enabled) await db.from("role_permissions").upsert({ role_id: roleId, permission_id: permissionId }, { onConflict: "role_id,permission_id", ignoreDuplicates: true });
  else await db.from("role_permissions").delete().eq("role_id", roleId).eq("permission_id", permissionId);
  revalidatePath("/admin/ajustes");
  return { ok: true };
}
