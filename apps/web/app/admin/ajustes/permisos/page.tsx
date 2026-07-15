import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { getRolesData } from "../user-actions";
import { RolePermissions } from "@/components/admin/role-permissions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Permisos — Turkana Admin" };

export default async function PermisosSettingsPage() {
  const staff = await requireStaff();
  const isAdmin = ["super_admin", "admin"].includes(staff.role ?? "");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/ajustes" className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Ajustes
        </Link>
        <h1 className="mt-2 text-3xl text-ink">Permisos por rol</h1>
        <p className="mt-1 text-sm text-muted">Define qué puede hacer cada rol del sistema.</p>
      </div>

      {isAdmin ? (
        <RolePermissions data={await getRolesData()} />
      ) : (
        <p className="rounded-2xl border border-ink/10 bg-white p-6 text-sm text-muted shadow-sm">
          La gestión de permisos está disponible solo para administradores.
        </p>
      )}
    </div>
  );
}
