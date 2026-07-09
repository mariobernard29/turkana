import { requireStaff } from "@/lib/auth";
import { getStaffUsers, getRolesData, type StaffUser, type RolesData } from "./user-actions";
import { getBusinessSettings, type BusinessSettings } from "./actions";
import { UsersManager } from "@/components/admin/users-manager";
import { RolePermissions } from "@/components/admin/role-permissions";
import { BusinessSettingsForm } from "@/components/admin/business-settings";
import { TestEmail } from "@/components/admin/test-email";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ajustes — Turkana Admin" };

export default async function SettingsPage() {
  const staff = await requireStaff();
  const isAdmin = ["super_admin", "admin"].includes(staff.role ?? "");

  let users: StaffUser[] = [];
  let rolesData: RolesData | null = null;
  let business: BusinessSettings | null = null;
  if (isAdmin) {
    [users, rolesData, business] = await Promise.all([getStaffUsers(), getRolesData(), getBusinessSettings()]);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl text-ink">Ajustes</h1>
        <p className="mt-1 text-sm text-muted">Usuarios, permisos y configuración del sistema</p>
      </div>

      {isAdmin && rolesData && business ? (
        <>
          <BusinessSettingsForm initial={business} />
          <UsersManager users={users} roles={rolesData.roles} />
          <RolePermissions data={rolesData} />
        </>
      ) : (
        <p className="rounded-2xl border border-ink/10 bg-white p-6 text-sm text-muted shadow-sm">
          La gestión de usuarios y permisos está disponible solo para administradores.
        </p>
      )}

      <TestEmail />
    </div>
  );
}
