import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { PiercingForm } from "@/components/admin/piercing-form";

export const dynamic = "force-dynamic";

export default async function NewPiercingPage() {
  await requireStaff();

  return (
    <div>
      <Link
        href="/admin/perforaciones"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" /> Perforaciones
      </Link>

      <h1 className="mb-1 text-3xl text-ink">Nueva perforación</h1>
      <p className="mb-6 text-sm text-muted">
        Registra los datos del cliente y en qué parte de la oreja se colocó el arete.
      </p>

      <PiercingForm />
    </div>
  );
}
