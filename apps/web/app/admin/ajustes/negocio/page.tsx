import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { getBusinessSettings } from "../actions";
import { BusinessSettingsForm } from "@/components/admin/business-settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Negocio — Turkana Admin" };

export default async function NegocioSettingsPage() {
  const staff = await requireStaff();
  const isAdmin = ["super_admin", "admin"].includes(staff.role ?? "");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/ajustes" className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Ajustes
        </Link>
        <h1 className="mt-2 text-3xl text-ink">Parámetros del negocio</h1>
        <p className="mt-1 text-sm text-muted">Envíos, límite de caja y alertas por correo.</p>
      </div>

      {isAdmin ? (
        <BusinessSettingsForm initial={await getBusinessSettings()} />
      ) : (
        <p className="rounded-2xl border border-ink/10 bg-white p-6 text-sm text-muted shadow-sm">
          Estos parámetros solo pueden editarlos los administradores.
        </p>
      )}
    </div>
  );
}
