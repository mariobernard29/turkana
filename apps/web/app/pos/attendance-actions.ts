"use server";

// Checador del POS: código + PIN → entrada o salida.
//
// Regla del negocio: al personal NUNCA se le dice si llegó tarde o temprano; eso
// sólo sale en los reportes del super admin. Por eso la respuesta no lleva el
// horario ni nada que permita deducirlo.
import { cookies } from "next/headers";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGISTER_COOKIE } from "@/lib/pos-register";
import { businessDayKey } from "@/lib/dates";
import { MAX_OPEN_HOURS, scheduleForDay, type AttendanceSchedule } from "@/lib/attendance";
import { PIN_RE, verifyPin } from "@/lib/attendance-pin";

const MAX_FAILS = 5;
const LOCK_MS = 5 * 60_000;
// Dos toques seguidos (o la misma persona que vuelve a teclear por si no se
// registró) no deben cerrar la entrada que se acaba de abrir.
const DOUBLE_TAP_MS = 2 * 60_000;

export type PunchResult =
  | { ok: true; kind: "in" | "out"; name: string; at: string; workedMin?: number }
  | { ok: false; error: string };

const BAD = "Código o PIN incorrecto";

export async function punch(input: { code: string; pin: string; deviceId?: string }): Promise<PunchResult> {
  await requireStaff("/pos/asistencia");
  const code = (input.code ?? "").trim();
  const pin = (input.pin ?? "").trim();
  if (!/^\d{1,6}$/.test(code) || !PIN_RE.test(pin)) return { ok: false, error: BAD };

  const db = createAdminClient();
  const { data: empData } = await db
    .from("attendance_employees")
    .select("id, full_name, pin_hash, active, failed_attempts, locked_until")
    .eq("code", code)
    .maybeSingle();
  const emp = empData as {
    id: string; full_name: string; pin_hash: string; active: boolean;
    failed_attempts: number; locked_until: string | null;
  } | null;
  if (!emp || !emp.active) return { ok: false, error: BAD };

  const now = new Date();
  if (emp.locked_until && new Date(emp.locked_until) > now) {
    return { ok: false, error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." };
  }

  if (!(await verifyPin(pin, emp.pin_hash))) {
    const fails = (emp.failed_attempts ?? 0) + 1;
    await db.from("attendance_employees").update({
      failed_attempts: fails >= MAX_FAILS ? 0 : fails,
      locked_until: fails >= MAX_FAILS ? new Date(now.getTime() + LOCK_MS).toISOString() : null,
    }).eq("id", emp.id);
    return { ok: false, error: fails >= MAX_FAILS ? "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." : BAD };
  }
  if (emp.failed_attempts || emp.locked_until) {
    await db.from("attendance_employees").update({ failed_attempts: 0, locked_until: null }).eq("id", emp.id);
  }

  const firstName = emp.full_name.split(" ")[0];

  // ¿Tiene una entrada abierta?
  const { data: openData } = await db
    .from("attendance_records")
    .select("id, clock_in, clock_out, created_at")
    .eq("employee_id", emp.id)
    .is("clock_out", null)
    .eq("auto_closed", false)
    .maybeSingle();
  const open = openData as { id: string; clock_in: string } | null;

  // Último marcaje (entrada o salida) para el anti doble toque.
  const { data: lastData } = await db
    .from("attendance_records")
    .select("clock_in, clock_out")
    .eq("employee_id", emp.id)
    .order("clock_in", { ascending: false })
    .limit(1)
    .maybeSingle();
  const last = lastData as { clock_in: string; clock_out: string | null } | null;
  const lastAt = last ? new Date(last.clock_out ?? last.clock_in) : null;
  if (lastAt && now.getTime() - lastAt.getTime() < DOUBLE_TAP_MS) {
    const what = last?.clock_out ? "salida" : "entrada";
    return { ok: false, error: `${firstName}, ya registraste tu ${what} hace un momento.` };
  }

  if (open) {
    const hours = (now.getTime() - new Date(open.clock_in).getTime()) / 3600_000;
    if (hours <= MAX_OPEN_HOURS) {
      const { error } = await db.from("attendance_records")
        .update({ clock_out: now.toISOString() })
        .eq("id", open.id);
      if (error) return { ok: false, error: "No se pudo registrar. Inténtalo de nuevo." };
      return {
        ok: true, kind: "out", name: firstName, at: now.toISOString(),
        workedMin: Math.round((now.getTime() - new Date(open.clock_in).getTime()) / 60000),
      };
    }
    // Entrada olvidada de otro día: se marca "sin salida" y se abre una nueva.
    await db.from("attendance_records").update({ auto_closed: true }).eq("id", open.id);
  }

  // Foto del horario de hoy: si mañana cambia, el reporte de hoy no se reescribe.
  const { data: schedData } = await db
    .from("attendance_schedules")
    .select("employee_id, weekday, start_time, end_time")
    .eq("employee_id", emp.id);
  const sched = scheduleForDay((schedData as unknown as AttendanceSchedule[]) ?? [], emp.id, businessDayKey(now));

  const jar = await cookies();
  const row = {
    employee_id: emp.id,
    clock_in: now.toISOString(),
    scheduled_start: sched?.start.toISOString() ?? null,
    scheduled_end: sched?.end.toISOString() ?? null,
    register_id: jar.get(REGISTER_COOKIE)?.value || null,
    device_id: input.deviceId || null,
  };
  let { error } = await db.from("attendance_records").insert(row);
  // La caja de la cookie ya no existe: la caja es un dato de referencia, no
  // vale la pena perder el marcaje por eso.
  if (error?.code === "23503") ({ error } = await db.from("attendance_records").insert({ ...row, register_id: null }));
  if (error) {
    // Índice único: otro toque simultáneo ya abrió la entrada.
    if (error.code === "23505") return { ok: false, error: `${firstName}, ya registraste tu entrada hace un momento.` };
    return { ok: false, error: "No se pudo registrar. Inténtalo de nuevo." };
  }
  return { ok: true, kind: "in", name: firstName, at: now.toISOString() };
}
