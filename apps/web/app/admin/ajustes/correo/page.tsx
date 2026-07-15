import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { TestEmail } from "@/components/admin/test-email";

export const dynamic = "force-dynamic";
export const metadata = { title: "Correo — Turkana Admin" };

export default async function CorreoSettingsPage() {
  await requireStaff();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/ajustes" className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Ajustes
        </Link>
        <h1 className="mt-2 text-3xl text-ink">Correo</h1>
        <p className="mt-1 text-sm text-muted">Envía un correo de prueba para verificar la configuración de Resend.</p>
      </div>

      <TestEmail />
    </div>
  );
}
