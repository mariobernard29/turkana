"use client";

// Detalle día por día de cada persona, con corrección manual de marcajes
// (olvidó checar la salida, checó mal, etc.). Toda corrección pide motivo y
// queda en la bitácora.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { deleteRecord, saveRecord } from "@/app/admin/asistencia/actions";
import {
  dayStatus, formatDayKey, formatMinutes, formatTime,
  type AttendanceRecord, type AttendanceReport,
} from "@/lib/attendance";
import { businessDayKey } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Editing = { record: AttendanceRecord | null; employeeId: string; dayKey: string };

export function AttendanceReportDetail({
  report,
  employees,
}: {
  report: AttendanceReport;
  employees: { id: string; name: string }[];
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const th = "px-3 py-2 text-left text-[11px] font-normal uppercase tracking-wider text-muted";

  return (
    <div className="mt-8 space-y-8">
      <div className="flex items-center justify-between print:hidden">
        <h2 className="text-lg text-ink">Detalle por persona</h2>
        {employees.length > 0 && (
          <button
            onClick={() => setEditing({ record: null, employeeId: employees[0].id, dayKey: businessDayKey() })}
            className="inline-flex items-center gap-1.5 text-sm text-gold hover:text-gold-dark"
          >
            <Plus className="h-4 w-4" /> Agregar registro manual
          </button>
        )}
      </div>

      {report.employees.map(({ employee, days, totals }) => {
        const shown = days.filter((d) => d.records.length > 0 || d.absent);
        return (
          <section key={employee.id} className="break-inside-avoid">
            <h3 className="mb-2 text-ink">
              {employee.full_name} <span className="text-xs text-muted">· código {employee.code}</span>
            </h3>
            {shown.length === 0 ? (
              <p className="rounded-2xl bg-white p-4 text-sm text-muted shadow-sm print:shadow-none">Sin registros en el periodo.</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl bg-white shadow-sm print:shadow-none">
                <table className="w-full text-sm">
                  <thead className="border-b border-ink/10">
                    <tr>
                      <th className={th}>Día</th>
                      <th className={th}>Horario</th>
                      <th className={th}>Entrada</th>
                      <th className={th}>Salida</th>
                      <th className={cn(th, "text-right")}>Horas</th>
                      <th className={th}>Observaciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((d) => (
                      <tr key={d.dayKey} className="border-b border-ink/5 align-top last:border-0">
                        <td className="whitespace-nowrap px-3 py-2.5 text-ink">{formatDayKey(d.dayKey)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-muted">
                          {d.scheduledStart ? `${formatTime(d.scheduledStart)} – ${formatTime(d.scheduledEnd)}` : "Descanso"}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums" colSpan={2}>
                          {d.records.length === 0 ? <span className="text-muted">—</span> : (
                            <div className="space-y-1">
                              {d.records.map((r) => (
                                <div key={r.id} className="flex items-center gap-2">
                                  <span className="w-14">{formatTime(r.clock_in)}</span>
                                  <span className="w-14">{r.clock_out ? formatTime(r.clock_out) : "—"}</span>
                                  {r.notes && <span className="truncate text-xs text-muted" title={r.notes}>✎ {r.notes}</span>}
                                  <button
                                    onClick={() => setEditing({ record: r, employeeId: employee.id, dayKey: d.dayKey })}
                                    className="ml-auto text-muted hover:text-ink print:hidden"
                                    aria-label="Corregir"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-ink">
                          {d.workedMin ? formatMinutes(d.workedMin) : "—"}
                        </td>
                        <td className={cn(
                          "px-3 py-2.5 text-xs",
                          d.absent ? "text-red-600" : d.lateMin || d.earlyMin || d.missingOut ? "text-amber-700" : "text-muted",
                        )}>
                          {dayStatus(d)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-ink/10">
                    <tr>
                      <td className="px-3 py-2 text-xs uppercase tracking-wider text-muted" colSpan={4}>Total</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink">{formatMinutes(totals.workedMin)}</td>
                      <td className="px-3 py-2 text-xs text-muted">
                        {totals.lateCount} retardo(s) · {totals.absences} falta(s)
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        );
      })}

      {editing && <RecordModal editing={editing} employees={employees} onClose={() => setEditing(null)} />}
    </div>
  );
}

// "YYYY-MM-DD" y "HH:MM" de un instante, en hora de la tienda.
function splitStore(iso: string): { day: string; time: string } {
  return { day: businessDayKey(new Date(iso)), time: formatTime(iso) };
}

function RecordModal({
  editing,
  employees,
  onClose,
}: {
  editing: Editing;
  employees: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const r = editing.record;
  const inP = r ? splitStore(r.clock_in) : { day: editing.dayKey, time: "" };
  const outP = r?.clock_out ? splitStore(r.clock_out) : { day: inP.day, time: "" };
  const [employeeId, setEmployeeId] = useState(editing.employeeId);
  const [inDay, setInDay] = useState(inP.day);
  const [inTime, setInTime] = useState(inP.time);
  const [outDay, setOutDay] = useState(outP.day);
  const [outTime, setOutTime] = useState(outP.time);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await saveRecord({ id: r?.id, employeeId, inDay, inTime, outDay, outTime, notes });
    setBusy(false);
    if (!res.ok) { setError(res.error ?? "Error"); return; }
    router.refresh();
    onClose();
  };

  const remove = async () => {
    if (!r) return;
    setBusy(true);
    const res = await deleteRecord(r.id);
    setBusy(false);
    if (!res.ok) { setError(res.error ?? "Error"); return; }
    router.refresh();
    onClose();
  };

  const field = "w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold";
  const label = "mb-1 block text-xs uppercase tracking-wider text-muted";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 print:hidden">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-xl text-ink">{r ? "Corregir registro" : "Registro manual"}</h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4">
          {!r && (
            <div>
              <label className={label}>Persona</label>
              <select className={field} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Día de entrada</label>
              <input type="date" className={field} value={inDay} onChange={(e) => setInDay(e.target.value)} required />
            </div>
            <div>
              <label className={label}>Hora de entrada</label>
              <input type="time" className={field} value={inTime} onChange={(e) => setInTime(e.target.value)} required />
            </div>
            <div>
              <label className={label}>Día de salida</label>
              <input type="date" className={field} value={outDay} onChange={(e) => setOutDay(e.target.value)} />
            </div>
            <div>
              <label className={label}>Hora de salida</label>
              <input type="time" className={field} value={outTime} onChange={(e) => setOutTime(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={label}>Motivo</label>
            <input className={field} value={notes} onChange={(e) => setNotes(e.target.value)} required
              placeholder="Ej. Olvidó checar su salida" />
          </div>
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}

        <div className="mt-6 flex gap-2">
          {r && (
            <button type="button" onClick={remove} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full border border-red-200 px-4 py-3 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50">
              <Trash2 className="h-4 w-4" /> Eliminar
            </button>
          )}
          <button type="submit" disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-ink py-3 text-sm uppercase tracking-widest text-cream hover:bg-gold-dark disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
          </button>
        </div>
      </form>
    </div>
  );
}
