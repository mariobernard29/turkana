import { createAdminClient } from "@/lib/supabase/admin";
import { loadEmployees, loadSchedules } from "@/lib/attendance-data";
import { AttendanceStaffManager } from "@/components/admin/attendance-staff-manager";

export const dynamic = "force-dynamic";

export default async function AsistenciaPersonalPage() {
  const db = createAdminClient();
  const [employees, schedules] = await Promise.all([loadEmployees(db, true), loadSchedules(db)]);
  return <AttendanceStaffManager employees={employees} schedules={schedules} />;
}
