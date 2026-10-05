import Link from "next/link";
import { loadAttendanceReport, getAttendanceSettings, loadEmployees } from "@/lib/attendance-data";
import { workWeek, formatDayKey } from "@/lib/attendance";
import { addDaysKey, businessDayKey } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import { AttendanceSummaryTable } from "@/components/admin/attendance-summary-table";
import { AttendanceReportDetail } from "@/components/admin/attendance-report-detail";
import { AttendanceReportActions } from "@/components/admin/attendance-report-actions";
import { STORE } from "@/lib/business";

export const dynamic = "force-dynamic";

type Search = { desde?: string; hasta?: string; persona?: string };
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function AsistenciaReportesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const f = await searchParams;
  const db = createAdminClient();
  const settings = await getAttendanceSettings(db);
  const week = workWeek(settings.weekStart);
  const prev = workWeek(settings.weekStart, new Date(), -1);

  let fromKey = f.desde && DAY_RE.test(f.desde) ? f.desde : week.fromKey;
  let toKey = f.hasta && DAY_RE.test(f.hasta) ? f.hasta : week.toKey;
  if (fromKey > toKey) [fromKey, toKey] = [toKey, fromKey];
  // Tope de un año para que nadie tumbe la página pidiendo una década.
  if (addDaysKey(fromKey, 366) < toKey) toKey = addDaysKey(fromKey, 366);

  const [{ report }, employees] = await Promise.all([
    loadAttendanceReport(fromKey, toKey, { employeeId: f.persona || undefined, db }),
    loadEmployees(db, true),
  ]);

  const today = businessDayKey();
  const monthStart = `${today.slice(0, 7)}-01`;
  const prevMonthEnd = addDaysKey(monthStart, -1);
  const prevMonthStart = `${prevMonthEnd.slice(0, 7)}-01`;
  const persona = f.persona ? `&persona=${f.persona}` : "";
  const shortcuts = [
    { label: "Semana actual", from: week.fromKey, to: week.toKey },
    { label: "Semana anterior", from: prev.fromKey, to: prev.toKey },
    { label: "Este mes", from: monthStart, to: today },
    { label: "Mes anterior", from: prevMonthStart, to: prevMonthEnd },
  ];

  const inputCls = "rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold";
  const personName = f.persona ? employees.find((e) => e.id === f.persona)?.full_name : null;

  return (
    <div>
      <div className="print:hidden">
        <form className="mb-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-muted">Desde</label>
            <input type="date" name="desde" defaultValue={fromKey} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-muted">Hasta</label>
            <input type="date" name="hasta" defaultValue={toKey} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-muted">Persona</label>
            <select name="persona" defaultValue={f.persona ?? ""} className={inputCls}>
              <option value="">Todo el personal</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.full_name}{e.active ? "" : " (baja)"}</option>
              ))}
            </select>
          </div>
          <button className="rounded-full bg-ink px-5 py-2 text-sm text-cream hover:bg-gold-dark">Ver reporte</button>
        </form>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {shortcuts.map((s) => (
              <Link
                key={s.label}
                href={`/admin/asistencia/reportes?desde=${s.from}&hasta=${s.to}${persona}`}
                className="rounded-full bg-white px-3 py-1 text-xs text-muted shadow-sm hover:text-ink"
              >
                {s.label}
              </Link>
            ))}
          </div>
          <AttendanceReportActions fromKey={fromKey} toKey={toKey} employeeId={f.persona} />
        </div>
      </div>

      {/* Encabezado que sólo sale en papel. */}
      <div className="mb-4 hidden print:block">
        <p className="font-serif text-2xl tracking-wide">{STORE.brand.toUpperCase()}</p>
        <p className="text-lg">Reporte de asistencia{personName ? ` · ${personName}` : ""}</p>
      </div>
      <p className="mb-4 text-sm text-muted">
        {formatDayKey(fromKey)} al {formatDayKey(toKey)} · tolerancia de {report.toleranceMin} min
      </p>

      <AttendanceSummaryTable rows={report.employees} />

      <AttendanceReportDetail
        report={report}
        employees={employees.filter((e) => e.active).map((e) => ({ id: e.id, name: e.full_name }))}
      />
    </div>
  );
}
