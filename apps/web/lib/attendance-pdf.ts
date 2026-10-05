// Reporte de asistencia en PDF: resumen por persona + detalle día por día.
// Lo comparten el botón del panel y el correo semanal (va adjunto).
import { ReportPdf } from "@/lib/pdf-doc";
import { formatStoreDate } from "@/lib/dates";
import {
  dayStatus, formatDayKey, formatMinutes, formatTime,
  type AttendanceReport,
} from "@/lib/attendance";
import type { PdfRes } from "@/lib/report-pdf";

export function attendancePeriodText(fromKey: string, toKey: string): string {
  const a = formatStoreDate(fromKey);
  const b = formatStoreDate(toKey);
  return a === b ? a : `${a} al ${b}`;
}

export async function buildAttendancePdfBytes(report: AttendanceReport): Promise<Uint8Array> {
  const pdf = await ReportPdf.create(
    "Reporte de asistencia",
    `${attendancePeriodText(report.fromKey, report.toKey)} · tolerancia ${report.toleranceMin} min`,
  );

  await pdf.heading("Resumen por persona");
  if (report.employees.length === 0) {
    await pdf.emptyNote("No hay personal registrado.");
  } else {
    await pdf.table(
      [
        { header: "Persona" },
        { header: "Días", align: "right", width: 38 },
        { header: "Horas", align: "right", width: 74 },
        { header: "Retardos", align: "right", width: 82 },
        { header: "Salió antes", align: "right", width: 66 },
        { header: "Faltas", align: "right", width: 44 },
        { header: "Sin salida", align: "right", width: 56 },
        { header: "Extra", align: "right", width: 66 },
      ],
      report.employees.map(({ employee, totals: t }) => [
        employee.full_name + (employee.active ? "" : " (baja)"),
        String(t.daysWorked),
        formatMinutes(t.workedMin),
        t.lateCount ? `${t.lateCount} · ${formatMinutes(t.lateMin)}` : "0",
        String(t.earlyCount),
        String(t.absences),
        String(t.missingOut),
        formatMinutes(t.extraMin),
      ]),
    );
  }

  for (const { employee, days, totals } of report.employees) {
    await pdf.heading(`${employee.full_name} · código ${employee.code}`);
    const rows = days
      .filter((d) => d.records.length > 0 || d.absent)
      .map((d) => [
        formatDayKey(d.dayKey),
        d.scheduledStart ? `${formatTime(d.scheduledStart)}-${formatTime(d.scheduledEnd)}` : "Descanso",
        d.records.map((r) => formatTime(r.clock_in)).join(" / ") || "—",
        d.records.map((r) => (r.clock_out ? formatTime(r.clock_out) : "—")).join(" / ") || "—",
        d.workedMin ? formatMinutes(d.workedMin) : "—",
        dayStatus(d),
      ]);
    if (rows.length === 0) {
      await pdf.emptyNote("Sin registros en el periodo.");
      continue;
    }
    await pdf.table(
      [
        { header: "Día", width: 82 },
        { header: "Horario", width: 72 },
        { header: "Entrada", width: 62 },
        { header: "Salida", width: 62 },
        { header: "Horas", align: "right", width: 66 },
        { header: "Observaciones" },
      ],
      rows,
      ["Total", "", "", "", formatMinutes(totals.workedMin), `${totals.lateCount} retardo(s) · ${totals.absences} falta(s)`],
    );
  }

  return pdf.finish();
}

export async function buildAttendancePdf(report: AttendanceReport): Promise<PdfRes> {
  try {
    const bytes = await buildAttendancePdfBytes(report);
    return {
      ok: true,
      fileName: `asistencia-${report.fromKey}-a-${report.toKey}.pdf`,
      fileBase64: Buffer.from(bytes).toString("base64"),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo generar el PDF" };
  }
}
