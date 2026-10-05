// Tabla resumen por persona (resumen semanal y reportes). Sin estado: sirve en
// Server Components.
import { formatMinutes, type EmployeeReport } from "@/lib/attendance";
import { cn } from "@/lib/utils";

export function AttendanceSummaryTable({ rows }: { rows: EmployeeReport[] }) {
  if (rows.length === 0) {
    return <p className="rounded-2xl bg-white p-6 text-sm text-muted shadow-sm">No hay personal registrado.</p>;
  }
  const th = "px-3 py-2 text-left text-[11px] font-normal uppercase tracking-wider text-muted";
  const td = "px-3 py-2.5 tabular-nums";
  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm print:shadow-none">
      <table className="w-full text-sm">
        <thead className="border-b border-ink/10">
          <tr>
            <th className={th}>Persona</th>
            <th className={cn(th, "text-right")}>Días</th>
            <th className={cn(th, "text-right")}>Horas trabajadas</th>
            <th className={cn(th, "text-right")}>Retardos</th>
            <th className={cn(th, "text-right")}>Salió antes</th>
            <th className={cn(th, "text-right")}>Faltas</th>
            <th className={cn(th, "text-right")}>Sin salida</th>
            <th className={cn(th, "text-right")}>Tiempo extra</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ employee, totals: t }) => (
            <tr key={employee.id} className="border-b border-ink/5 last:border-0">
              <td className="px-3 py-2.5 text-ink">
                {employee.full_name}
                {!employee.active && <span className="ml-1 text-xs text-muted">(baja)</span>}
              </td>
              <td className={cn(td, "text-right")}>{t.daysWorked}</td>
              <td className={cn(td, "text-right text-ink")}>{formatMinutes(t.workedMin)}</td>
              <td className={cn(td, "text-right", t.lateCount && "text-amber-700")}>
                {t.lateCount ? `${t.lateCount} · ${formatMinutes(t.lateMin)}` : "0"}
              </td>
              <td className={cn(td, "text-right", t.earlyCount && "text-amber-700")}>{t.earlyCount}</td>
              <td className={cn(td, "text-right", t.absences && "text-red-600")}>{t.absences}</td>
              <td className={cn(td, "text-right", t.missingOut && "text-amber-700")}>{t.missingOut}</td>
              <td className={cn(td, "text-right")}>{formatMinutes(t.extraMin)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
