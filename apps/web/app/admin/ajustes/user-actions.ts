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

export type StaffUser = { id: string; fullName: string; email: string | null; roleId: string | null; roleKey: string | null; isActive: boolean };

export async function getStaffUsers(): Promise<StaffUser[]> {
  const g = await guard();
  if ("error" in g) return [];
  const db = createAdminClient();

  const { data: profiles } = await db
    .from("profiles")
    .select("id, full_name, is_active, role_id, roles(key)")
    .is("deleted_at", null)
    .order("full_name");

  const { data: authList } = await db.auth.admin.listUsers({ perPage: 1000 });
  const emailMap = new Map((authList?.users ?? []).map((u) => [u.id, u.email ?? null]));

  return ((profiles as unknown as { id: string; full_name: string; is_active: boolean; role_id: string | null; roles: { key: string } | { key: string }[] | null }[]) ?? []).map((p) => {
    const role = Array.isArray(p.roles) ? p.roles[0] : p.roles;
    return { id: p.id, fullName: p.full_name, email: emailMap.get(p.id) ?? null, roleId: p.role_id, roleKey: role?.key ?? null, isActive: p.is_active };
  });
}

export async function createStaffUser(input: { email: string; password: string; fullName: string; roleId: string }): Promise<Res> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  const db = createAdminClient();
  if (!input.email.trim() || input.password.length < 6 || !input.fullName.trim() || !input.roleId) return { ok: false, error: "Completa todos los campos (contraseña mín. 6)" };

  const { data, error } = await db.auth.admin.createUser({
    email: input.email.trim(), password: input.password, email_confirm: true,
    user_metadata: { full_name: input.fullName.trim() },
  });
  if (error || !data.user) return { ok: false, error: error?.message ?? "No se pudo crear el usuario" };

  const { error: pErr } = await db.from("profiles").insert({ id: data.user.id, role_id: input.roleId, full_name: input.fullName.trim(), created_by: g.id });
  if (pErr) return { ok: false, error: pErr.message };

  revalidatePath("/admin/ajustes");
  return { ok: true };
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
