"use client";

// Alta/edición del personal que checa asistencia y su horario semanal.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Pencil, X } from "lucide-react";
import { saveEmployee, saveSchedule } from "@/app/admin/asistencia/actions";
import {
  payScheduleLabel, WEEKDAYS,
  type AttendanceEmployee, type AttendanceSchedule, type PayFrequency, type PayKind,
} from "@/lib/attendance";
import { formatMXN } from "@/lib/utils";
import { cn } from "@/lib/utils";

// Lunes primero en pantalla: así lo lee la gente aunque internamente 0 = domingo.
const ORDER = [1, 2, 3, 4, 5, 6, 0];

type DayRow = { on: boolean; start: string; end: string };

const hhmm = (t: string) => t.slice(0, 5);

function scheduleSummary(rows: AttendanceSchedule[]): string {
  if (!rows.length) return "Sin horario";
  return ORDER.filter((d) => rows.some((r) => r.weekday === d))
    .map((d) => {
      const r = rows.find((x) => x.weekday === d)!;
      return `${WEEKDAYS[d].slice(0, 3)} ${hhmm(r.start_time)}-${hhmm(r.end_time)}`;
    })
    .join(" · ");
}

export function AttendanceStaffManager({
  employees,
  schedules,
}: {
  employees: AttendanceEmployee[];
  schedules: AttendanceSchedule[];
}) {
  const [editing, setEditing] = useState<AttendanceEmployee | "new" | null>(null);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">{employees.filter((e) => e.active).length} personas activas</p>
        <button
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2 text-sm text-cream hover:bg-gold-dark"
        >
          <Plus className="h-4 w-4" /> Agregar persona
        </button>
      </div>

      {employees.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-sm text-muted shadow-sm">
          Aún no hay personal. Agrega a cada persona con su código, PIN y horario.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          {employees.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-4 border-b border-ink/5 px-5 py-4 last:border-0">
              <div className="min-w-0">
                <p className={cn("text-ink", !e.active && "text-muted line-through")}>
                  {e.full_name} <span className="ml-2 text-xs text-muted">código {e.code}</span>
                </p>
                <p className="truncate text-xs text-muted">
                  {scheduleSummary(schedules.filter((s) => s.employee_id === e.id))}
                </p>
                <p className="truncate text-xs text-gold">
                  {payScheduleLabel(e)}
                  {e.pay_kind && e.pay_amount_cents != null &&
                    ` · ${formatMXN(e.pay_amount_cents)} ${e.pay_kind === "hourly" ? "por hora" : e.pay_frequency === "biweekly" ? "por quincena" : "por semana"}`}
                </p>
              </div>
              <button onClick={() => setEditing(e)} className="shrink-0 text-muted hover:text-ink" aria-label="Editar">
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EmployeeModal
          employee={editing === "new" ? null : editing}
          schedules={editing === "new" ? [] : schedules.filter((s) => s.employee_id === editing.id)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function EmployeeModal({
  employee,
  schedules,
  onClose,
}: {
  employee: AttendanceEmployee | null;
  schedules: AttendanceSchedule[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(employee?.full_name ?? "");
  const [code, setCode] = useState(employee?.code ?? "");
  const [pin, setPin] = useState("");
  const [active, setActive] = useState(employee?.active ?? true);
  const [payFrequency, setPayFrequency] = useState<PayFrequency>(employee?.pay_frequency ?? "weekly");
  const [payWeekday, setPayWeekday] = useState(employee?.pay_weekday ?? 1);
  const [payKind, setPayKind] = useState<PayKind | "">(employee?.pay_kind ?? "");
  const [payAmount, setPayAmount] = useState(
    employee?.pay_amount_cents != null ? String(employee.pay_amount_cents / 100) : "",
  );
  const [days, setDays] = useState<Record<number, DayRow>>(() => {
    const out: Record<number, DayRow> = {};
    for (let d = 0; d < 7; d++) {
      const s = schedules.find((x) => x.weekday === d);
      out[d] = s ? { on: true, start: hhmm(s.start_time), end: hhmm(s.end_time) } : { on: false, start: "10:00", end: "19:00" };
    }
    return out;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setDay = (d: number, patch: Partial<DayRow>) => setDays((prev) => ({ ...prev, [d]: { ...prev[d], ...patch } }));

  // Copia el horario del primer día marcado a los demás días marcados.
  const copyToAll = () => {
    const first = ORDER.find((d) => days[d].on);
    if (first == null) return;
    setDays((prev) => {
      const next = { ...prev };
      for (const d of ORDER) if (next[d].on) next[d] = { ...next[d], start: prev[first].start, end: prev[first].end };
      return next;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await saveEmployee({
      id: employee?.id, fullName: name, code, pin: pin || undefined, active,
      payFrequency, payWeekday,
      payKind: payKind && payAmount !== "" ? payKind : null,
      payAmountPesos: payKind && payAmount !== "" ? Number(payAmount) : null,
    });
    if (!res.ok) { setBusy(false); setError(res.error ?? "Error"); return; }

    const id = res.id ?? employee?.id;
    if (id) {
      const rows = ORDER.filter((d) => days[d].on).map((d) => ({ weekday: d, start: days[d].start, end: days[d].end }));
      const sres = await saveSchedule(id, rows);
      if (!sres.ok) { setBusy(false); setError(sres.error ?? "Error al guardar el horario"); return; }
    }
    setBusy(false);
    router.refresh();
    onClose();
  };

  const field = "w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold";
  const label = "mb-1 block text-xs uppercase tracking-wider text-muted";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <form onSubmit={submit} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-xl text-ink">{employee ? "Editar persona" : "Agregar persona"}</h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={label}>Nombre completo</label>
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className={label}>Código de empleado</label>
            <input className={field} value={code} inputMode="numeric" maxLength={6}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required placeholder="Ej. 12" />
          </div>
          <div>
            <label className={label}>{employee ? "Nuevo PIN (opcional)" : "PIN de 4 dígitos"}</label>
            <input className={field} value={pin} inputMode="numeric" maxLength={4} type="password" autoComplete="new-password"
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} required={!employee}
              placeholder={employee ? "Dejar vacío para no cambiar" : "••••"} />
          </div>
          {employee && (
            <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Activo (si lo desactivas ya no puede checar; su historial se conserva)
            </label>
          )}
        </div>

        <div className="mt-6">
          <p className={label}>Pago</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <select className={field} value={payFrequency} onChange={(e) => setPayFrequency(e.target.value as PayFrequency)}>
              <option value="weekly">Semanal</option>
              <option value="biweekly">Quincenal (15 y fin de mes)</option>
            </select>
            {payFrequency === "weekly" ? (
              <select className={field} value={payWeekday} onChange={(e) => setPayWeekday(Number(e.target.value))}>
                {ORDER.map((d) => <option key={d} value={d}>Cobra el {WEEKDAYS[d].toLowerCase()}</option>)}
              </select>
            ) : (
              <p className="self-center text-xs text-muted">Periodos del 1 al 15 y del 16 a fin de mes.</p>
            )}
            <select className={field} value={payKind} onChange={(e) => setPayKind(e.target.value as PayKind | "")}>
              <option value="">Sin sueldo capturado</option>
              <option value="salary">Sueldo fijo por {payFrequency === "biweekly" ? "quincena" : "semana"}</option>
              <option value="hourly">Pago por hora</option>
            </select>
            {payKind && (
              <input type="number" min="0" step="0.01" inputMode="decimal" className={field} value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)} placeholder={payKind === "hourly" ? "$ por hora" : "$ por periodo"} />
            )}
          </div>
          {payFrequency === "weekly" && (
            <p className="mt-1 text-xs text-muted">
              Cobra el {WEEKDAYS[payWeekday].toLowerCase()} por los 7 días anteriores
              ({WEEKDAYS[payWeekday].toLowerCase()} a {WEEKDAYS[(payWeekday + 6) % 7].toLowerCase()}).
            </p>
          )}
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <p className={label}>Horario laboral</p>
            <button type="button" onClick={copyToAll} className="text-xs text-gold hover:text-gold-dark">
              Copiar el primero a todos
            </button>
          </div>
          <div className="space-y-2">
            {ORDER.map((d) => (
              <div key={d} className="flex items-center gap-3">
                <label className="flex w-28 items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={days[d].on} onChange={(e) => setDay(d, { on: e.target.checked })} />
                  {WEEKDAYS[d]}
                </label>
                {days[d].on ? (
                  <>
                    <input type="time" className={cn(field, "w-32")} value={days[d].start} onChange={(e) => setDay(d, { start: e.target.value })} required />
                    <span className="text-muted">a</span>
                    <input type="time" className={cn(field, "w-32")} value={days[d].end} onChange={(e) => setDay(d, { end: e.target.value })} required />
                  </>
                ) : (
                  <span className="text-sm text-muted">Descanso</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3 text-sm uppercase tracking-widest text-cream hover:bg-gold-dark disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
        </button>
      </form>
    </div>
  );
}
