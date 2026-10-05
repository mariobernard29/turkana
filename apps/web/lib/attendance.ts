// Asistencia del personal: cálculo puro de horas, retardos, salidas anticipadas
// y faltas. Sin acceso a BD para poder usarse igual en pantalla, PDF y correo.
//
// Todo "día" es un día de la TIENDA (lib/dates.ts): el servidor corre en UTC y
// una entrada a las 18:00 de Los Mochis ya es el día siguiente en UTC.
import {
  addDaysKey, businessDayKey, dayKeyWeekday, formatStore, storeWallTime,
} from "@/lib/dates";

export const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export const ATTENDANCE_DEFAULTS = {
  weekStart: 3,  // miércoles: semana laboral mié → mar
  toleranceMin: 10,
};

// Una entrada abierta más de esto se da por olvidada ("sin salida").
export const MAX_OPEN_HOURS = 16;

export type AttendanceEmployee = { id: string; full_name: string; code: string; active: boolean };
export type AttendanceSchedule = { employee_id: string; weekday: number; start_time: string; end_time: string };
export type AttendanceRecord = {
  id: string;
  employee_id: string;
  clock_in: string;
  clock_out: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  auto_closed: boolean;
  notes: string | null;
  edited_by?: string | null;
};

/** Horario de una persona para un día de la tienda; null = descanso. */
export function scheduleForDay(
  schedules: AttendanceSchedule[],
  employeeId: string,
  dayKey: string,
): { start: Date; end: Date } | null {
  const wd = dayKeyWeekday(dayKey);
  const s = schedules.find((x) => x.employee_id === employeeId && x.weekday === wd);
  if (!s) return null;
  const start = storeWallTime(dayKey, s.start_time);
  let end = storeWallTime(dayKey, s.end_time);
  // Turno que cruza la medianoche.
  if (end <= start) end = storeWallTime(addDaysKey(dayKey, 1), s.end_time);
  return { start, end };
}

/**
 * Semana laboral que contiene `at` (o la de `offset` semanas atrás/adelante).
 * Devuelve claves de día inclusivas: con inicio miércoles, mié … mar.
 */
export function workWeek(weekStart: number, at: Date = new Date(), offset = 0): { fromKey: string; toKey: string } {
  const today = businessDayKey(at);
  const back = (dayKeyWeekday(today) - weekStart + 7) % 7;
  const fromKey = addDaysKey(today, -back + offset * 7);
  return { fromKey, toKey: addDaysKey(fromKey, 6) };
}

/** Lista de claves de día entre dos claves, inclusivas. */
export function dayKeysBetween(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  for (let k = fromKey; k <= toKey && out.length < 400; k = addDaysKey(k, 1)) out.push(k);
  return out;
}

const minutesBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 60000);

export type AttendanceDay = {
  dayKey: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  records: AttendanceRecord[];
  firstIn: string | null;
  lastOut: string | null;
  workedMin: number;
  scheduledMin: number;
  lateMin: number;      // > 0 sólo si pasó la tolerancia
  earlyMin: number;     // salida antes del horario, pasada la tolerancia
  extraMin: number;
  missingOut: boolean;  // alguna entrada sin salida (olvidada)
  open: boolean;        // trabajando ahora mismo
  absent: boolean;
  restDay: boolean;
};

export type AttendanceTotals = {
  daysWorked: number;
  workedMin: number;
  scheduledMin: number;
  extraMin: number;
  lateCount: number;
  lateMin: number;
  earlyCount: number;
  earlyMin: number;
  absences: number;
  missingOut: number;
};

export type EmployeeReport = {
  employee: AttendanceEmployee;
  days: AttendanceDay[];
  totals: AttendanceTotals;
};

export type AttendanceReport = {
  fromKey: string;
  toKey: string;
  toleranceMin: number;
  employees: EmployeeReport[];
};

export function buildAttendanceReport(input: {
  employees: AttendanceEmployee[];
  schedules: AttendanceSchedule[];
  records: AttendanceRecord[];
  fromKey: string;
  toKey: string;
  toleranceMin: number;
  now?: Date;
}): AttendanceReport {
  const now = input.now ?? new Date();
  const todayKey = businessDayKey(now);
  const keys = dayKeysBetween(input.fromKey, input.toKey);
  const tol = Math.max(0, input.toleranceMin);

  const employees = input.employees.map((employee) => {
    const mine = input.records
      .filter((r) => r.employee_id === employee.id)
      .sort((a, b) => a.clock_in.localeCompare(b.clock_in));

    const days: AttendanceDay[] = keys.map((dayKey) => {
      const recs = mine.filter((r) => businessDayKey(new Date(r.clock_in)) === dayKey);
      const current = scheduleForDay(input.schedules, employee.id, dayKey);
      // El horario que valía cuando checó (foto) manda sobre el horario de hoy.
      const snap = recs.find((r) => r.scheduled_start && r.scheduled_end);
      const sStart = snap ? new Date(snap.scheduled_start!) : current?.start ?? null;
      const sEnd = snap ? new Date(snap.scheduled_end!) : current?.end ?? null;
      const scheduledMin = sStart && sEnd ? minutesBetween(sStart, sEnd) : 0;

      let workedMin = 0;
      let missingOut = false;
      let open = false;
      for (const r of recs) {
        if (r.clock_out) workedMin += Math.max(0, minutesBetween(new Date(r.clock_in), new Date(r.clock_out)));
        else if (r.auto_closed) missingOut = true;
        else {
          const hours = (now.getTime() - new Date(r.clock_in).getTime()) / 3600_000;
          if (hours > MAX_OPEN_HOURS) missingOut = true;
          else open = true;
        }
      }

      const firstIn = recs[0]?.clock_in ?? null;
      const closed = recs.filter((r) => r.clock_out);
      const lastOut = !open && closed.length ? closed[closed.length - 1].clock_out : null;

      let lateMin = 0;
      if (sStart && firstIn) {
        const diff = minutesBetween(sStart, new Date(firstIn));
        if (diff > tol) lateMin = diff;
      }
      let earlyMin = 0;
      if (sEnd && lastOut && !missingOut) {
        const diff = minutesBetween(new Date(lastOut), sEnd);
        if (diff > tol) earlyMin = diff;
      }
      const extraMin = scheduledMin > 0 ? Math.max(0, workedMin - scheduledMin) : workedMin;

      // Falta: tenía horario, no checó, y su hora de salida ya pasó.
      const absent = recs.length === 0 && !!current && (dayKey < todayKey || (dayKey === todayKey && now > current.end));

      return {
        dayKey,
        scheduledStart: sStart?.toISOString() ?? null,
        scheduledEnd: sEnd?.toISOString() ?? null,
        records: recs,
        firstIn,
        lastOut,
        workedMin,
        scheduledMin,
        lateMin,
        earlyMin,
        extraMin,
        missingOut,
        open,
        absent,
        restDay: !current && !snap,
      };
    });

    const totals: AttendanceTotals = {
      daysWorked: days.filter((d) => d.records.length > 0).length,
      workedMin: sum(days, "workedMin"),
      scheduledMin: days.filter((d) => d.records.length > 0 || d.absent).reduce((s, d) => s + d.scheduledMin, 0),
      extraMin: sum(days, "extraMin"),
      lateCount: days.filter((d) => d.lateMin > 0).length,
      lateMin: sum(days, "lateMin"),
      earlyCount: days.filter((d) => d.earlyMin > 0).length,
      earlyMin: sum(days, "earlyMin"),
      absences: days.filter((d) => d.absent).length,
      missingOut: days.filter((d) => d.missingOut).length,
    };
    return { employee, days, totals };
  });

  return { fromKey: input.fromKey, toKey: input.toKey, toleranceMin: tol, employees };
}

function sum(days: AttendanceDay[], k: "workedMin" | "extraMin" | "lateMin" | "earlyMin") {
  return days.reduce((s, d) => s + d[k], 0);
}

// ── Formato ─────────────────────────────────────────────────────────────────

/** 545 → "9 h 05 min". */
export function formatMinutes(min: number): string {
  if (min <= 0) return "0 min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return `${h} h ${String(m).padStart(2, "0")} min`;
}

/** Hora de la tienda "09:05". */
export function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return formatStore(iso, { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** "Mié 01/10" para encabezados de día. */
export function formatDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-");
  const wd = WEEKDAYS[dayKeyWeekday(dayKey)].slice(0, 3);
  return `${wd} ${d}/${m}/${y}`;
}

/** Estado de un día para la tabla del reporte. */
export function dayStatus(d: AttendanceDay): string {
  const parts: string[] = [];
  if (d.absent) parts.push("Falta");
  if (d.open) parts.push("Trabajando");
  if (d.lateMin > 0) parts.push(`Retardo ${formatMinutes(d.lateMin)}`);
  if (d.earlyMin > 0) parts.push(`Salió antes ${formatMinutes(d.earlyMin)}`);
  if (d.missingOut) parts.push("Sin salida");
  if (d.records.length > 0 && d.restDay) parts.push("Día de descanso");
  if (!parts.length && d.records.length > 0) parts.push("A tiempo");
  return parts.join(" · ");
}
