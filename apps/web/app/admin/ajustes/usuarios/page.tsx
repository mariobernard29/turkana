import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { getStaffUsers, getRolesData, type StaffUser, type RolesData } from "../user-actions";
import { UsersManager } from "@/components/admin/users-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Usuarios — Turkana Admin" };

export default async function UsuariosSettingsPage() {
  const staff = await requireStaff();
  const isAdmin = ["super_admin", "admin"].includes(staff.role ?? "");

  let users: StaffUser[] = [];
  let rolesData: RolesData | null = null;
  if (isAdmin) [users, rolesData] = await Promise.all([getStaffUsers(), getRolesData()]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/ajustes" className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Ajustes
        </Link>
        <h1 className="mt-2 text-3xl text-ink">Usuarios del sistema</h1>
        <p className="mt-1 text-sm text-muted">Crea, activa y asigna roles al personal.</p>
      </div>

      {isAdmin && rolesData ? (
        <UsersManager users={users} roles={rolesData.roles} />
      ) : (
        <p className="rounded-2xl border border-ink/10 bg-white p-6 text-sm text-muted shadow-sm">
          La gestión de usuarios está disponible solo para administradores.
        </p>
      )}
    </div>
  );
}
