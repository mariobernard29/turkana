// Correo del reporte de asistencia: resumen en el cuerpo + PDF completo adjunto.
// Lo manda el cron semanal (app/api/cron/asistencia) y el botón de prueba del panel.
import { sendAdminEmail } from "@/lib/admin-alerts";
import { formatMinutes, workWeek } from "@/lib/attendance";
import { addDaysKey, businessDayKey } from "@/lib/dates";
import { attendancePeriodText, buildAttendancePdfBytes } from "@/lib/attendance-pdf";
import { loadAttendanceReport, ATTENDANCE_KEYS, getAttendanceSettings, setSetting } from "@/lib/attendance-data";
import { createAdminClient } from "@/lib/supabase/admin";

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function sendAttendanceReport(fromKey: string, toKey: string): Promise<{ ok: boolean; error?: string }> {
  const { report, settings } = await loadAttendanceReport(fromKey, toKey);
  if (!settings.recipients.length) {
    return { ok: false, error: "No hay correo configurado (asistencia ni administración)" };
  }

  const th = (t: string, right = false) =>
    `<th style="padding:6px 4px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#a08c6b;text-align:${right ? "right" : "left"};border-bottom:1px solid #eee">${t}</th>`;
  const td = (t: string, right = false, color = "#2b2b2b") =>
    `<td style="padding:6px 4px;font-size:13px;color:${color};text-align:${right ? "right" : "left"};border-bottom:1px solid #f3f3f3">${t}</td>`;

  const rows = report.employees.map(({ employee, totals: t }) => `<tr>
      ${td(esc(employee.full_name))}
      ${td(String(t.daysWorked), true)}
      ${td(formatMinutes(t.workedMin), true)}
      ${td(t.lateCount ? `${t.lateCount} (${formatMinutes(t.lateMin)})` : "0", true, t.lateCount ? "#b45309" : "#2b2b2b")}
      ${td(String(t.absences), true, t.absences ? "#dc2626" : "#2b2b2b")}
      ${td(String(t.missingOut), true, t.missingOut ? "#b45309" : "#2b2b2b")}
    </tr>`).join("");

  const inner = `
    <p style="margin:0 0 4px;font-size:13px"><strong>Periodo:</strong> ${attendancePeriodText(fromKey, toKey)}</p>
    <p style="margin:0 0 16px;font-size:13px;color:#8a8a8a">Tolerancia de ${report.toleranceMin} min. El detalle día por día va en el PDF adjunto.</p>
    ${report.employees.length === 0
      ? `<p style="font-size:13px;color:#999">No hay personal registrado.</p>`
      : `<table style="width:100%;border-collapse:collapse">
          <tr>${th("Persona")}${th("Días", true)}${th("Horas", true)}${th("Retardos", true)}${th("Faltas", true)}${th("Sin salida", true)}</tr>
          ${rows}
        </table>`}`;

  const pdf = await buildAttendancePdfBytes(report);
  const ok = await sendAdminEmail(
    settings.recipients,
    `🕘 Asistencia semanal — ${attendancePeriodText(fromKey, toKey)}`,
    "Reporte de asistencia",
    inner,
    [{ filename: `asistencia-${fromKey}-a-${toKey}.pdf`, content: Buffer.from(pdf).toString("base64") }],
  );
  return ok ? { ok: true } : { ok: false, error: "Resend no aceptó el correo (revisa la configuración)" };
}

/**
 * Lo llama el cron diario. Sólo actúa el día en que EMPIEZA la semana laboral
 * (con semana mié→mar: el miércoles temprano) y manda la semana que acaba de
 * cerrar. Guarda la semana enviada para no repetir si el cron corre dos veces.
 */
export async function runWeeklyAttendanceReport(now: Date = new Date()): Promise<{ sent: boolean; reason: string }> {
  const db = createAdminClient();
  const settings = await getAttendanceSettings(db);
  const current = workWeek(settings.weekStart, now);
  if (businessDayKey(now) !== current.fromKey) return { sent: false, reason: "hoy no empieza la semana laboral" };

  const fromKey = addDaysKey(current.fromKey, -7);
  const toKey = addDaysKey(current.fromKey, -1);
  if (settings.lastReportWeek === fromKey) return { sent: false, reason: "ya se envió esta semana" };

  const res = await sendAttendanceReport(fromKey, toKey);
  if (!res.ok) return { sent: false, reason: res.error ?? "error" };
  await setSetting(db, ATTENDANCE_KEYS.lastWeek, fromKey);
  return { sent: true, reason: `semana ${fromKey} a ${toKey}` };
}
