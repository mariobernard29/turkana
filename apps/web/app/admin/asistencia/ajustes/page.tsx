import { getAttendanceSettings } from "@/lib/attendance-data";
import { AttendanceSettingsForm } from "@/components/admin/attendance-settings-form";

export const dynamic = "force-dynamic";

export default async function AsistenciaAjustesPage() {
  const s = await getAttendanceSettings();
  return (
    <AttendanceSettingsForm
      weekStart={s.weekStart}
      toleranceMin={s.toleranceMin}
      reportEmail={s.reportEmail}
      fallbackEmails={s.reportEmail ? [] : s.recipients}
      lastReportWeek={s.lastReportWeek}
    />
  );
}
