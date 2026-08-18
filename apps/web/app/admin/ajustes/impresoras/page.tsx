import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { getPrinters, getRecentJobs, getRegisters } from "../pos-actions";
import { PrintersManager } from "@/components/admin/printers-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Impresoras — Turkana Admin" };

export default async function ImpresorasSettingsPage() {
  const staff = await requireStaff();
  const isAdmin = ["super_admin", "admin"].includes(staff.role ?? "");

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <Link href="/admin/ajustes" className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Ajustes
        </Link>
        <p className="rounded-2xl border border-ink/10 bg-white p-6 text-sm text-muted shadow-sm">
          Las impresoras solo pueden configurarlas los administradores.
        </p>
      </div>
    );
  }

  const [printers, jobs, registers] = await Promise.all([getPrinters(), getRecentJobs(), getRegisters()]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/ajustes" className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Ajustes
        </Link>
        <h1 className="mt-2 text-3xl text-ink">Impresoras</h1>
        <p className="mt-1 text-sm text-muted">
          Los tickets salen sin el diálogo del navegador: la venta los deja en una cola y el agente instalado en la PC del mostrador los manda a la impresora.
        </p>
      </div>

      <PrintersManager
        printers={printers}
        jobs={jobs}
        registers={registers.map((r) => ({ id: r.id, name: r.name }))}
      />
    </div>
  );
}
