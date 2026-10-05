import Link from "next/link";
import { LiveRefresh } from "@/components/live-refresh";
import { AttendanceSummaryTable } from "@/components/admin/attendance-summary-table";
import { loadAttendanceReport, getAttendanceSettings } from "@/lib/attendance-data";
import { formatDayKey, formatMinutes, formatTime, WEEKDAYS, workWeek } from "@/lib/attendance";

export const dynamic = "force-dynamic";

export default async function AsistenciaResumenPage() {
  const settings = await getAttendanceSettings();
  const week = workWeek(settings.weekStart);
  const { report } = await loadAttendanceReport(week.fromKey, week.toKey);

  // Quién tiene una entrada abierta ahora mismo.
  const now = Date.now();
  const working = report.employees.flatMap(({ employee, days }) =>
    days.flatMap((d) => d.records.filter((r) => !r.clock_out && !r.auto_closed && d.open).map((r) => ({ employee, r }))),
  );

  return (
    <div className="space-y-8">
      {/* Las tablas tienen RLS sin políticas: no hay Realtime, se repasa cada minuto. */}
      <LiveRefresh tables={[]} intervalMs={60_000} />

      <section>
        <h2 className="mb-3 text-lg text-ink">Trabajando ahora</h2>
        {working.length === 0 ? (
          <p className="rounded-2xl bg-white p-5 text-sm text-muted shadow-sm">Nadie tiene una entrada abierta.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {working.map(({ employee, r }) => (
              <div key={r.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-ink">{employee.full_name}</p>
                <p className="text-sm text-muted">
                  Entró {formatTime(r.clock_in)} · lleva {formatMinutes(Math.round((now - new Date(r.clock_in).getTime()) / 60000))}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg text-ink">
            Semana laboral en curso
            <span className="ml-2 text-sm text-muted">
              {formatDayKey(week.fromKey)} al {formatDayKey(week.toKey)}
            </span>
          </h2>
          <Link
            href={`/admin/asistencia/reportes?desde=${week.fromKey}&hasta=${week.toKey}`}
            className="text-sm text-gold hover:text-gold-dark"
          >
            Ver detalle día por día →
          </Link>
        </div>
        <AttendanceSummaryTable rows={report.employees} />
        <p className="mt-2 text-xs text-muted">
          La semana empieza en {WEEKDAYS[settings.weekStart].toLowerCase()} · tolerancia de {settings.toleranceMin} min ·
          el reporte semanal se envía el {WEEKDAYS[settings.weekStart].toLowerCase()} a las 7:00 a{" "}
          {settings.recipients.join(", ") || "— (sin correo configurado)"}.
        </p>
      </section>
    </div>
  );
}
