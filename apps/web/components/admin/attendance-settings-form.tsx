"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { saveAttendanceSettings } from "@/app/admin/asistencia/actions";
import { WEEKDAYS } from "@/lib/attendance";
import { formatStoreDate } from "@/lib/dates";

export function AttendanceSettingsForm(props: {
  weekStart: number;
  toleranceMin: number;
  reportEmail: string;
  fallbackEmails: string[];
  lastReportWeek: string | null;
}) {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(props.weekStart);
  const [tolerance, setTolerance] = useState(String(props.toleranceMin));
  const [email, setEmail] = useState(props.reportEmail);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const weekEnd = (weekStart + 6) % 7;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await saveAttendanceSettings({ weekStart, toleranceMin: Number(tolerance), reportEmail: email });
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: "Guardado." } : { ok: false, text: res.error ?? "Error" });
    if (res.ok) router.refresh();
  };

  const field = "w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold";
  const label = "mb-1 block text-xs uppercase tracking-wider text-muted";

  return (
    <form onSubmit={submit} className="max-w-xl space-y-5 rounded-2xl bg-white p-6 shadow-sm">
      <div>
        <label className={label}>La semana laboral empieza el</label>
        <select className={field} value={weekStart} onChange={(e) => setWeekStart(Number(e.target.value))}>
          {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
        </select>
        <p className="mt-1 text-xs text-muted">
          Semana de {WEEKDAYS[weekStart].toLowerCase()} a {WEEKDAYS[weekEnd].toLowerCase()}. El reporte de la semana
          llega el {WEEKDAYS[weekStart].toLowerCase()} a las 7:00 a.m., ya con el {WEEKDAYS[weekEnd].toLowerCase()} completo.
        </p>
      </div>

      <div>
        <label className={label}>Tolerancia (minutos)</label>
        <input type="number" min={0} max={120} className={field} value={tolerance} onChange={(e) => setTolerance(e.target.value)} required />
        <p className="mt-1 text-xs text-muted">
          Llegar hasta {tolerance || 0} min después de la hora (o salir hasta {tolerance || 0} min antes) no cuenta como
          retardo ni salida anticipada. Al personal nunca se le muestra; sólo sale en los reportes.
        </p>
      </div>

      <div>
        <label className={label}>Correo para el reporte semanal</label>
        <input className={field} value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder={props.fallbackEmails.join(", ") || "correo@ejemplo.com"} />
        <p className="mt-1 text-xs text-muted">
          Varios separados por coma. Si lo dejas vacío se usa el correo de administración
          {props.fallbackEmails.length ? ` (${props.fallbackEmails.join(", ")})` : " (no configurado)"}.
        </p>
      </div>

      {props.lastReportWeek && (
        <p className="text-xs text-muted">Último reporte automático: semana del {formatStoreDate(props.lastReportWeek)}.</p>
      )}

      {msg && <p className={msg.ok ? "text-sm text-green-700" : "text-sm text-red-700"}>{msg.text}</p>}

      <button type="submit" disabled={busy}
        className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-2.5 text-sm text-cream hover:bg-gold-dark disabled:opacity-50">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
      </button>
    </form>
  );
}
