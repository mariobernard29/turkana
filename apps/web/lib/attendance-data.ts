// Carga de datos de asistencia (servidor, service_role). Las tablas tienen RLS
// sin políticas: sólo se llega a ellas desde aquí, detrás de un guard.
import { createAdminClient } from "@/lib/supabase/admin";
import { businessDayKey, storeDayRange } from "@/lib/dates";
import { parseAlertEmails } from "@/lib/admin-alerts";
import {
  ATTENDANCE_DEFAULTS, buildAttendanceReport, payAmountCents, payPeriodFor, shiftPayPeriod,
  type AttendanceEmployee, type AttendanceRecord, type AttendanceReport, type AttendanceSchedule,
  type EmployeeReport, type PayPeriod,
} from "@/lib/attendance";

type DB = ReturnType<typeof createAdminClient>;

export const ATTENDANCE_KEYS = {
  weekStart: "attendance_week_start",
  tolerance: "attendance_tolerance_min",
  email: "attendance_report_email",
  lastWeek: "attendance_last_report_week",
} as const;

export type AttendanceSettings = {
  weekStart: number;
  toleranceMin: number;
  reportEmail: string;     // lo que se guardó (vacío = usa el de administración)
  recipients: string[];    // a quién se manda de verdad
  lastReportWeek: string | null;
};

export async function getAttendanceSettings(db: DB = createAdminClient()): Promise<AttendanceSettings> {
  const { data } = await db.from("app_settings").select("key, value")
    .in("key", [...Object.values(ATTENDANCE_KEYS), "admin_alert_email"]);
  const map = new Map(((data as unknown as { key: string; value: string }[]) ?? []).map((r) => [r.key, r.value]));
  const ws = parseInt(map.get(ATTENDANCE_KEYS.weekStart) ?? "", 10);
  const tol = parseInt(map.get(ATTENDANCE_KEYS.tolerance) ?? "", 10);
  const reportEmail = map.get(ATTENDANCE_KEYS.email) ?? "";
  return {
    weekStart: ws >= 0 && ws <= 6 ? ws : ATTENDANCE_DEFAULTS.weekStart,
    toleranceMin: tol >= 0 ? tol : ATTENDANCE_DEFAULTS.toleranceMin,
    reportEmail,
    recipients: parseAlertEmails(reportEmail || map.get("admin_alert_email")),
    lastReportWeek: map.get(ATTENDANCE_KEYS.lastWeek) ?? null,
  };
}

export async function setSetting(db: DB, key: string, value: string) {
  const { error } = await db.from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

export async function loadEmployees(db: DB, includeInactive = false): Promise<AttendanceEmployee[]> {
  let q = db.from("attendance_employees").select("id, full_name, code, active, pay_frequency, pay_weekday, pay_kind, pay_amount_cents, created_at").order("full_name");
  if (!includeInactive) q = q.eq("active", true);
  const { data } = await q;
  return (data as unknown as AttendanceEmployee[]) ?? [];
}

export async function loadSchedules(db: DB): Promise<AttendanceSchedule[]> {
  const { data } = await db.from("attendance_schedules").select("employee_id, weekday, start_time, end_time");
  return (data as unknown as AttendanceSchedule[]) ?? [];
}

const RECORD_COLS = "id, employee_id, clock_in, clock_out, scheduled_start, scheduled_end, auto_closed, notes, edited_by";

/** Marcajes cuyo día de entrada cae en [fromKey, toKey], por tandas (PostgREST corta en 1000). */
export async function loadRecords(db: DB, fromKey: string, toKey: string, employeeId?: string): Promise<AttendanceRecord[]> {
  const from = storeDayRange(fromKey).from.toISOString();
  const to = storeDayRange(toKey).to.toISOString();
  const out: AttendanceRecord[] = [];
  for (let page = 0; page < 50; page++) {
    let q = db.from("attendance_records").select(RECORD_COLS)
      .gte("clock_in", from).lt("clock_in", to)
      .order("clock_in").range(page * 1000, page * 1000 + 999);
    if (employeeId) q = q.eq("employee_id", employeeId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data as unknown as AttendanceRecord[]) ?? [];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

/** Reporte de un rango. Con `employeeId` sólo esa persona (aunque esté inactiva). */
export async function loadAttendanceReport(
  fromKey: string,
  toKey: string,
  opts: { employeeId?: string; db?: DB } = {},
): Promise<{ report: AttendanceReport; settings: AttendanceSettings }> {
  const db = opts.db ?? createAdminClient();
  const [settings, all, schedules, records] = await Promise.all([
    getAttendanceSettings(db),
    loadEmployees(db, true),
    loadSchedules(db),
    loadRecords(db, fromKey, toKey, opts.employeeId),
  ]);
  // Activos + inactivos que sí checaron en el rango (bajas a media semana).
  const withRecords = new Set(records.map((r) => r.employee_id));
  const employees = opts.employeeId
    ? all.filter((e) => e.id === opts.employeeId)
    : all.filter((e) => e.active || withRecords.has(e.id));
  const report = buildAttendanceReport({
    employees, schedules, records, fromKey, toKey, toleranceMin: settings.toleranceMin,
  });
  return { report, settings };
}

// ── Nómina: cuánto toca pagarle a cada quien en su periodo ───────────────────

export type PayrollView = "pagar" | "curso" | "fecha";

export type PayrollRow = {
  employee: AttendanceEmployee;
  period: PayPeriod;
  totals: EmployeeReport["totals"];
  amountCents: number | null;
};

/**
 * Cada persona tiene su propio periodo (semanal o quincenal):
 *  - "pagar": el último periodo cuyo día de pago ya llegó (lo que hay que pagar).
 *  - "curso": el periodo que está corriendo hoy.
 *  - "fecha": el periodo que contiene `refKey`.
 */
export async function loadPayroll(
  view: PayrollView,
  refKey?: string,
  db: DB = createAdminClient(),
): Promise<{ rows: PayrollRow[]; settings: AttendanceSettings }> {
  const today = businessDayKey();
  const [settings, employees, schedules] = await Promise.all([
    getAttendanceSettings(db),
    loadEmployees(db, false),
    loadSchedules(db),
  ]);

  const periods = employees.map((e) => {
    if (view === "fecha" && refKey) return payPeriodFor(e, refKey);
    const current = payPeriodFor(e, today);
    if (view === "curso") return current;
    return current.payDayKey <= today ? current : shiftPayPeriod(e, current, -1);
  });
  if (!employees.length) return { rows: [], settings };

  const fromKey = periods.reduce((m, p) => (p.fromKey < m ? p.fromKey : m), periods[0].fromKey);
  const toKey = periods.reduce((m, p) => (p.toKey > m ? p.toKey : m), periods[0].toKey);
  const records = await loadRecords(db, fromKey, toKey);

  const rows = employees.map((employee, i) => {
    const period = periods[i];
    const { employees: [r] } = buildAttendanceReport({
      employees: [employee],
      schedules,
      records: records.filter((x) => x.employee_id === employee.id),
      fromKey: period.fromKey,
      toKey: period.toKey,
      toleranceMin: settings.toleranceMin,
    });
    return { employee, period, totals: r.totals, amountCents: payAmountCents(employee, r.totals.workedMin) };
  });
  return { rows, settings };
}
