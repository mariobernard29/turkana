import { requireStaff } from "@/lib/auth";
import { AttendanceKiosk } from "@/components/pos/attendance-kiosk";

export const dynamic = "force-dynamic";
export const metadata = { title: "Asistencia · Turkana POS" };

export default async function AsistenciaPage() {
  await requireStaff("/pos/asistencia");
  return <AttendanceKiosk />;
}
