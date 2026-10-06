"use server";

// Administración de asistencia: SÓLO super_admin. Cada acción revisa el rol por
// su cuenta (ocultar el menú no protege nada).
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { businessDayKey, storeWallTime } from "@/lib/dates";
import { hashPin, PIN_RE } from "@/lib/attendance-pin";
import { ATTENDANCE_KEYS, loadAttendanceReport, setSetting } from "@/lib/attendance-data";
import { buildAttendancePdf } from "@/lib/attendance-pdf";
import { sendAttendanceReport } from "@/lib/attendance-email";
import { parseAlertEmails } from "@/lib/admin-alerts";
import { scheduleForDay, type AttendanceSchedule } from "@/lib/attendance";
import type { PdfRes } from "@/lib/report-pdf";

type Res = { ok: boolean; error?: string };

const PATH = "/admin/asistencia";
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

// ── Personal ────────────────────────────────────────────────────────────────
export async function saveEmployee(input: {
  id?: string;
  fullName: string;
  code: string;
  pin?: string;
  active: boolean;
  payFrequency: "weekly" | "biweekly";
  payWeekday: number;
  payKind: "hourly" | "salary" | null;
  payAmountPesos: number | null;
}): Promise<Res & { id?: string }> {
  const staff = await requireSuperAdmin();
  const fullName = input.fullName.trim();
  const code = input.code.trim();
  const pin = (input.pin ?? "").trim();
  if (!fullName) return { ok: false, error: "Escribe el nombre" };
  if (!/^\d{1,6}$/.test(code)) return { ok: false, error: "El código debe ser de 1 a 6 números" };
  if (!input.id && !pin) return { ok: false, error: "Asigna un PIN de 4 dígitos" };
  if (pin && !PIN_RE.test(pin)) return { ok: false, error: "El PIN debe ser de 4 números" };
  if (!["weekly", "biweekly"].includes(input.payFrequency)) return { ok: false, error: "Elige cada cuándo cobra" };
  if (!(input.payWeekday >= 0 && input.payWeekday <= 6)) return { ok: false, error: "Elige el día de pago" };
  if (input.payKind && !["hourly", "salary"].includes(input.payKind)) return { ok: false, error: "Tipo de sueldo inválido" };
  const amount = input.payKind && input.payAmountPesos != null ? Math.round(input.payAmountPesos * 100) : null;
  if (amount != null && !(amount >= 0)) return { ok: false, error: "Revisa el sueldo" };

  const db = createAdminClient();
  const row: Record<string, unknown> = {
    full_name: fullName, code, active: input.active,
    pay_frequency: input.payFrequency,
    pay_weekday: input.payWeekday,
    pay_kind: amount != null ? input.payKind : null,
    pay_amount_cents: amount,
  };
  if (pin) Object.assign(row, { pin_hash: await hashPin(pin), failed_attempts: 0, locked_until: null });

  const { data, error } = input.id
    ? await db.from("attendance_employees").update(row).eq("id", input.id).select("id").single()
    : await db.from("attendance_employees").insert(row).select("id").single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: `El código ${code} ya lo tiene otra persona` };
    return { ok: false, error: error.message };
  }
  await db.from("audit_logs").insert({
    actor_id: staff.id,
    action: input.id ? "attendance.employee_update" : "attendance.employee_create",
    entity_type: "attendance_employee",
    entity_id: (data as { id: string }).id,
    after: { ...row, pin_hash: undefined, pin_changed: Boolean(pin) },
  });
  revalidatePath(PATH, "layout");
  return { ok: true, id: (data as { id: string }).id };
}

export async function saveSchedule(
  employeeId: string,
  days: { weekday: number; start: string; end: string }[],
): Promise<Res> {
  await requireSuperAdmin();
  for (const d of days) {
    if (d.weekday < 0 || d.weekday > 6 || !TIME_RE.test(d.start) || !TIME_RE.test(d.end)) {
      return { ok: false, error: "Revisa las horas del horario" };
    }
    if (d.start === d.end) return { ok: false, error: "La hora de entrada y salida no pueden ser iguales" };
  }
  const db = createAdminClient();
  const { error: delErr } = await db.from("attendance_schedules").delete().eq("employee_id", employeeId);
  if (delErr) return { ok: false, error: delErr.message };
  if (days.length) {
    const { error } = await db.from("attendance_schedules").insert(
      days.map((d) => ({ employee_id: employeeId, weekday: d.weekday, start_time: d.start, end_time: d.end })),
    );
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath(PATH, "layout");
  return { ok: true };
}

// ── Correcciones de marcajes ────────────────────────────────────────────────
// Las horas llegan como hora de la TIENDA ("YYYY-MM-DD" + "HH:MM").
function toInstant(day: string, time: string): Date | null {
  if (!DAY_RE.test(day) || !TIME_RE.test(time)) return null;
  return storeWallTime(day, time);
}

export async function saveRecord(input: {
  id?: string;
  employeeId: string;
  inDay: string;
  inTime: string;
  outDay?: string;
  outTime?: string;
  notes: string;
}): Promise<Res> {
  const staff = await requireSuperAdmin();
  const clockIn = toInstant(input.inDay, input.inTime);
  if (!clockIn) return { ok: false, error: "Fecha u hora de entrada inválida" };
  let clockOut: Date | null = null;
  if (input.outTime) {
    clockOut = toInstant(input.outDay || input.inDay, input.outTime);
    if (!clockOut) return { ok: false, error: "Fecha u hora de salida inválida" };
    if (clockOut < clockIn) return { ok: false, error: "La salida no puede ser antes de la entrada" };
  }
  const notes = input.notes.trim();
  if (!notes) return { ok: false, error: "Escribe el motivo de la corrección" };

  const db = createAdminClient();
  const row = {
    clock_in: clockIn.toISOString(),
    clock_out: clockOut?.toISOString() ?? null,
    // Corregido a mano: deja de contar como "sin salida" si ya tiene salida.
    auto_closed: false,
    edited_by: staff.id,
    notes,
  };

  // Foto del horario vigente para ese día (se usa en altas y si la corrección
  // mueve el registro a otro día; si no, se respeta la foto original).
  const snapshotFor = async (employeeId: string) => {
    const { data: sched } = await db.from("attendance_schedules")
      .select("employee_id, weekday, start_time, end_time").eq("employee_id", employeeId);
    const s = scheduleForDay((sched as unknown as AttendanceSchedule[]) ?? [], employeeId, input.inDay);
    return { scheduled_start: s?.start.toISOString() ?? null, scheduled_end: s?.end.toISOString() ?? null };
  };

  let before: unknown = null;
  let id = input.id;
  if (id) {
    const { data: prevData } = await db.from("attendance_records")
      .select("employee_id, clock_in, clock_out, notes").eq("id", id).maybeSingle();
    const prev = prevData as { employee_id: string; clock_in: string } | null;
    if (!prev) return { ok: false, error: "El registro ya no existe" };
    before = prev;
    const movedDay = businessDayKey(new Date(prev.clock_in)) !== input.inDay;
    const { error } = await db.from("attendance_records")
      .update(movedDay ? { ...row, ...(await snapshotFor(prev.employee_id)) } : row)
      .eq("id", id);
    if (error) return { ok: false, error: error.code === "23505" ? "Esa persona ya tiene una entrada abierta" : error.message };
  } else {
    // Registro manual (no checó).
    const { data, error } = await db.from("attendance_records").insert({
      ...row,
      employee_id: input.employeeId,
      ...(await snapshotFor(input.employeeId)),
    }).select("id").single();
    if (error) return { ok: false, error: error.code === "23505" ? "Esa persona ya tiene una entrada abierta" : error.message };
    id = (data as { id: string }).id;
  }

  await db.from("audit_logs").insert({
    actor_id: staff.id,
    action: input.id ? "attendance.edit" : "attendance.manual",
    entity_type: "attendance_record",
    entity_id: id,
    before,
    after: row,
  });
  revalidatePath(PATH, "layout");
  return { ok: true };
}

export async function deleteRecord(id: string): Promise<Res> {
  const staff = await requireSuperAdmin();
  const db = createAdminClient();
  const { data: prev } = await db.from("attendance_records").select("*").eq("id", id).maybeSingle();
  const { error } = await db.from("attendance_records").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await db.from("audit_logs").insert({
    actor_id: staff.id, action: "attendance.delete", entity_type: "attendance_record", entity_id: id, before: prev,
  });
  revalidatePath(PATH, "layout");
  return { ok: true };
}

// ── Ajustes ─────────────────────────────────────────────────────────────────
export async function saveAttendanceSettings(input: {
  weekStart: number;
  toleranceMin: number;
  reportEmail: string;
}): Promise<Res> {
  await requireSuperAdmin();
  if (!(input.weekStart >= 0 && input.weekStart <= 6)) return { ok: false, error: "Día inválido" };
  if (!(input.toleranceMin >= 0 && input.toleranceMin <= 120)) return { ok: false, error: "La tolerancia va de 0 a 120 minutos" };
  const emails = parseAlertEmails(input.reportEmail);
  if (emails.some((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) return { ok: false, error: "Revisa el correo" };
  const db = createAdminClient();
  try {
    await setSetting(db, ATTENDANCE_KEYS.weekStart, String(input.weekStart));
    await setSetting(db, ATTENDANCE_KEYS.tolerance, String(Math.round(input.toleranceMin)));
    await setSetting(db, ATTENDANCE_KEYS.email, emails.join(", "));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar" };
  }
  revalidatePath(PATH, "layout");
  return { ok: true };
}

// ── Reportes ────────────────────────────────────────────────────────────────
export async function attendancePdf(fromKey: string, toKey: string, employeeId?: string): Promise<PdfRes> {
  await requireSuperAdmin();
  if (!DAY_RE.test(fromKey) || !DAY_RE.test(toKey) || fromKey > toKey) return { ok: false, error: "Rango inválido" };
  const { report } = await loadAttendanceReport(fromKey, toKey, { employeeId: employeeId || undefined });
  return buildAttendancePdf(report);
}

export async function sendReportNow(fromKey: string, toKey: string): Promise<Res> {
  await requireSuperAdmin();
  if (!DAY_RE.test(fromKey) || !DAY_RE.test(toKey) || fromKey > toKey) return { ok: false, error: "Rango inválido" };
  return sendAttendanceReport(fromKey, toKey);
}
