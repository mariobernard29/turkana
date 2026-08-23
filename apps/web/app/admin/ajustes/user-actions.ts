"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Res = { ok: boolean; error?: string; message?: string };
const ADMIN_ROLES = ["super_admin", "admin"];

async function guard(): Promise<{ id: string; role: string | null } | { error: string }> {
  const staff = await requireStaff();
  if (!ADMIN_ROLES.includes(staff.role ?? "")) return { error: "Solo administradores pueden gestionar usuarios" };
  return { id: staff.id, role: staff.role };
}

type Target = { id: string; fullName: string; roleKey: string | null; employeeCode: string | null; deletedAt: string | null; isActive: boolean };

async function findTarget(db: ReturnType<typeof createAdminClient>, userId: string): Promise<Target | null> {
  const { data } = await db
    .from("profiles")
    .select("id, full_name, employee_code, deleted_at, is_active, roles(key)")
    .eq("id", userId)
    .maybeSingle();
  const p = data as unknown as { id: string; full_name: string; employee_code: string | null; deleted_at: string | null; is_active: boolean; roles: { key: string } | { key: string }[] | null } | null;
  if (!p) return null;
  const role = Array.isArray(p.roles) ? p.roles[0] : p.roles;
  return { id: p.id, fullName: p.full_name, roleKey: role?.key ?? null, employeeCode: p.employee_code, deletedAt: p.deleted_at, isActive: p.is_active };
}

// La cuenta de un super admin sólo la toca otro super admin: si no, un admin
// podría degradarlo, desactivarlo o cambiarle la contraseña y quedarse con la tienda.
function blockedBySuperAdmin(actorRole: string | null, target: Target): string | null {
  if (target.roleKey === "super_admin" && actorRole !== "super_admin") {
    return `${target.fullName} es super admin: sólo otro super admin puede modificar su cuenta`;
  }
  return null;
}

// Los errores de la API de auth llegan a veces sin texto — un fallo de base de
// datos dentro de GoTrue se convierte en el literal "{}" al serializar la
// respuesta. Mejor decir algo que se pueda leer.
function authErrorText(error: { message?: string } | null, fallback: string): string {
  const raw = error?.message?.trim() ?? "";
  if (!raw || raw === "{}" || raw === "[object Object]") return fallback;
  return raw;
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

// Quien fue archivado en vez de borrado: sigue en profiles, sólo que fuera de
// la lista de todos los días.
export type ArchivedUser = StaffUser & { deletedAt: string | null };

type ProfileRow = { id: string; full_name: string; is_active: boolean; role_id: string | null; employee_code: string | null; deleted_at: string | null; roles: { key: string } | { key: string }[] | null };

function toStaffUser(p: ProfileRow, emails: Map<string, string | null>): ArchivedUser {
  const role = Array.isArray(p.roles) ? p.roles[0] : p.roles;
  return { id: p.id, fullName: p.full_name, email: emails.get(p.id) ?? null, employeeCode: p.employee_code, roleId: p.role_id, roleKey: role?.key ?? null, isActive: p.is_active, deletedAt: p.deleted_at };
}

const PROFILE_COLS = "id, full_name, is_active, role_id, employee_code, deleted_at, roles(key)";

// Las dos listas de un jalón: el mapa de correos sale de un solo listUsers en
// vez de pedirle a auth la plantilla completa dos veces por pantalla.
export async function getStaffDirectory(): Promise<{ active: StaffUser[]; archived: ArchivedUser[] }> {
  const g = await guard();
  if ("error" in g) return { active: [], archived: [] };
  const db = createAdminClient();

  const [activos, archivados, authList] = await Promise.all([
    db.from("profiles").select(PROFILE_COLS).is("deleted_at", null).order("full_name"),
    db.from("profiles").select(PROFILE_COLS).not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
    db.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const emails = new Map((authList.data?.users ?? []).map((u) => [u.id, u.email ?? null]));
  return {
    active: ((activos.data as unknown as ProfileRow[]) ?? []).map((p) => toStaffUser(p, emails)),
    archived: ((archivados.data as unknown as ProfileRow[]) ?? []).map((p) => toStaffUser(p, emails)),
  };
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
  if (error || !data.user) {
    // El correo puede estar ocupado por alguien archivado, que ya no sale en la
    // lista: sin este aviso el error no tiene sentido para quien lo lee.
    const { data: authList } = await db.auth.admin.listUsers({ perPage: 1000 });
    const previo = (authList?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === input.email.trim().toLowerCase());
    if (previo) {
      const { data: arch } = await db.from("profiles").select("full_name, deleted_at").eq("id", previo.id).maybeSingle();
      const p = arch as { full_name: string; deleted_at: string | null } | null;
      if (p?.deleted_at) return { ok: false, error: `Ese correo es de ${p.full_name}, una cuenta archivada. Usa otro correo o pide que se reactive la suya.` };
    }
    return { ok: false, error: authErrorText(error, "No se pudo crear el usuario") };
  }

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

  const target = await findTarget(db, userId);
  if (!target) return { ok: false, error: "No se encontró el usuario" };
  const veto = blockedBySuperAdmin(g.role, target);
  if (veto) return { ok: false, error: veto };

  const { error } = await db.from("profiles").update({ role_id: roleId }).eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/ajustes");
  return { ok: true };
}

// Cambia nombre, correo y/o contraseña de otra persona. Reservado a super admin:
// con esto se entra a cualquier cuenta, así que no es cosa de todos los admins.
export async function updateStaffUser(
  userId: string,
  input: { fullName?: string; email?: string; password?: string },
): Promise<Res> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  if (g.role !== "super_admin") return { ok: false, error: "Sólo un super admin puede cambiar los datos de otra persona" };
  const db = createAdminClient();

  const target = await findTarget(db, userId);
  if (!target) return { ok: false, error: "No se encontró el usuario" };

  const fullName = input.fullName?.trim();
  const email = input.email?.trim().toLowerCase();
  const password = input.password ?? "";

  if (input.fullName !== undefined && !fullName) return { ok: false, error: "El nombre no puede quedar vacío" };
  if (email !== undefined && email !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "El correo no tiene un formato válido" };
  if (password && password.length < 6) return { ok: false, error: "La contraseña debe tener al menos 6 caracteres" };
  if (!fullName && !email && !password) return { ok: false, error: "No hay nada que cambiar" };

  // Un correo repetido rompe el alta en auth con un mensaje feo: se avisa antes.
  if (email) {
    const { data: authList } = await db.auth.admin.listUsers({ perPage: 1000 });
    const clash = (authList?.users ?? []).find((u) => u.id !== userId && (u.email ?? "").toLowerCase() === email);
    if (clash) return { ok: false, error: `El correo ${email} ya está en uso por otra cuenta` };
  }

  const authPatch: { email?: string; email_confirm?: boolean; password?: string; user_metadata?: Record<string, unknown> } = {};
  if (email) { authPatch.email = email; authPatch.email_confirm = true; }
  if (password) authPatch.password = password;
  if (fullName) authPatch.user_metadata = { full_name: fullName };

  if (Object.keys(authPatch).length) {
    const { error } = await db.auth.admin.updateUserById(userId, authPatch);
    if (error) return { ok: false, error: authErrorText(error, "No se pudo actualizar la cuenta de acceso") };
  }

  if (fullName) {
    const { error } = await db.from("profiles").update({ full_name: fullName }).eq("id", userId);
    if (error) return { ok: false, error: error.message };
  }

  const cambios = [fullName && "nombre", email && "correo", password && "contraseña"].filter(Boolean).join(", ");
  revalidatePath("/admin/ajustes");
  return { ok: true, message: `Se actualizó ${cambios} de ${fullName || target.fullName}` };
}

export async function toggleUserActive(userId: string, active: boolean): Promise<Res> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  if (userId === g.id) return { ok: false, error: "No puedes desactivar tu propia cuenta" };
  const db = createAdminClient();

  const target = await findTarget(db, userId);
  if (!target) return { ok: false, error: "No se encontró el usuario" };
  const veto = blockedBySuperAdmin(g.role, target);
  if (veto) return { ok: false, error: veto };

  const { error } = await db.from("profiles").update({ is_active: active }).eq("id", userId);
  if (error) return { ok: false, error: error.message };
  // Bloquea/desbloquea el acceso real.
  const { error: aErr } = await db.auth.admin.updateUserById(userId, { ban_duration: active ? "none" : "876000h" });
  if (aErr) return { ok: false, error: authErrorText(aErr, "No se pudo cambiar el acceso de la cuenta") };
  revalidatePath("/admin/ajustes");
  return { ok: true };
}

export async function deleteStaffUser(userId: string): Promise<Res & { archived?: boolean }> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  if (userId === g.id) return { ok: false, error: "No puedes eliminar tu propia cuenta" };
  const db = createAdminClient();

  const target = await findTarget(db, userId);
  if (!target) return { ok: false, error: "No se encontró el usuario" };
  const veto = blockedBySuperAdmin(g.role, target);
  if (veto) return { ok: false, error: veto };

  const { error } = await db.auth.admin.deleteUser(userId); // el profile cae por cascade
  if (!error) {
    revalidatePath("/admin/ajustes");
    return { ok: true, message: `${target.fullName} fue eliminado` };
  }

  // Quien ya trabajó deja rastro: ventas, cortes de caja, movimientos de
  // inventario apuntan a su cuenta y la base no la deja borrar sin llevarse el
  // historial por delante. En ese caso se archiva: sale del listado, no puede
  // entrar, y su número de empleado queda libre (el índice único ignora los
  // archivados). Los papeles del negocio siguen diciendo quién los hizo.
  //
  // Primero el bloqueo y después el archivado: si el fallo de arriba fue que el
  // servicio de auth está caído (y no la llave foránea), esto también falla y se
  // sale sin dejar a nadie escondido de la lista pero con la cuenta viva.
  const { error: bErr } = await db.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  if (bErr) return { ok: false, error: authErrorText(error, "No se pudo eliminar la cuenta") };

  const { error: sErr } = await db
    .from("profiles")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", userId);
  if (sErr) return { ok: false, error: `${authErrorText(error, "La base no permitió borrar la cuenta")} — tampoco se pudo archivar: ${sErr.message}` };

  revalidatePath("/admin/ajustes");
  return {
    ok: true,
    archived: true,
    message: `${target.fullName} tiene movimientos registrados (ventas, cortes de caja), así que su historial no se puede borrar. La cuenta quedó archivada: fuera del listado, sin acceso${target.employeeCode ? `, y el número ${target.employeeCode} vuelve a estar libre` : ""}.`,
  };
}

// Deshace el archivado: la cuenta vuelve a la lista, recupera el acceso y sale
// otra vez en el login del POS.
export async function reactivateStaffUser(userId: string): Promise<Res & { employeeCode?: string }> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  const db = createAdminClient();

  const target = await findTarget(db, userId);
  if (!target) return { ok: false, error: "No se encontró el usuario" };
  if (!target.deletedAt) return { ok: false, error: `${target.fullName} no está archivado` };
  const veto = blockedBySuperAdmin(g.role, target);
  if (veto) return { ok: false, error: veto };

  // Su número pudo habérselo quedado alguien más mientras no estaba: el índice
  // único ignora a los archivados, así que se libera en cuanto se archiva.
  let code = target.employeeCode;
  if (code) {
    const { data: ocupado } = await db.from("profiles").select("id").eq("employee_code", code).is("deleted_at", null).maybeSingle();
    if (ocupado) code = null;
  }
  if (!code) code = await freeEmployeeCode(db);
  if (!code) return { ok: false, error: "No se encontró un número de empleado libre" };

  const { error } = await db
    .from("profiles")
    .update({ deleted_at: null, is_active: true, employee_code: code })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };

  // El desbloqueo va al final y con marcha atrás: si auth no responde, mejor
  // dejarlo archivado que visible en la lista y sin poder entrar.
  const { error: bErr } = await db.auth.admin.updateUserById(userId, { ban_duration: "none" });
  if (bErr) {
    await db.from("profiles").update({ deleted_at: target.deletedAt, is_active: target.isActive, employee_code: target.employeeCode }).eq("id", userId);
    return { ok: false, error: authErrorText(bErr, "No se pudo devolver el acceso a la cuenta; quedó archivada igual que antes") };
  }

  revalidatePath("/admin/ajustes");
  const cambio = code !== target.employeeCode ? ` Su número anterior ya estaba ocupado, ahora entra con el ${code}.` : ` Entra con el número ${code}.`;
  return { ok: true, employeeCode: code, message: `${target.fullName} vuelve a la lista.${cambio}` };
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
