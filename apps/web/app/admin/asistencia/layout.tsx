import { requireSuperAdmin } from "@/lib/auth";
import { AttendanceTabs } from "@/components/admin/attendance-tabs";

// Toda la sección es sólo para super_admin (las acciones lo vuelven a revisar).
export default async function AsistenciaLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();
  return (
    <div>
      <div className="mb-6 print:hidden">
        <h1 className="mb-1 text-3xl text-ink">Asistencia</h1>
        <p className="mb-4 text-sm text-muted">Entradas y salidas del personal checadas en el POS.</p>
        <AttendanceTabs />
      </div>
      {children}
    </div>
  );
}
