import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { getRegisters } from "../pos-actions";
import { RegistersManager } from "@/components/admin/registers-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cajas — Turkana Admin" };

export default async function CajasSettingsPage() {
  const staff = await requireStaff();
  const isAdmin = ["super_admin", "admin"].includes(staff.role ?? "");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/ajustes" className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Ajustes
        </Link>
        <h1 className="mt-2 text-3xl text-ink">Cajas y equipos</h1>
        <p className="mt-1 text-sm text-muted">
          Cada caja lleva su propio fondo, su propio cajón y su propio corte. Un equipo elige su caja la primera vez que entra al POS.
        </p>
      </div>

      {isAdmin ? (
        <RegistersManager registers={await getRegisters()} />
      ) : (
        <p className="rounded-2xl border border-ink/10 bg-white p-6 text-sm text-muted shadow-sm">
          Las cajas solo pueden configurarlas los administradores.
        </p>
      )}
    </div>
  );
}
