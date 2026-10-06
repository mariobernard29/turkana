import Link from "next/link";
import { loadPayroll, type PayrollView } from "@/lib/attendance-data";
import { formatDayKey, formatMinutes, payScheduleLabel } from "@/lib/attendance";
import { businessDayKey } from "@/lib/dates";
import { formatMXN, cn } from "@/lib/utils";
import { STORE } from "@/lib/business";
import { PrintButton } from "@/components/admin/print-button";

export const dynamic = "force-dynamic";

type Search = { vista?: string; fecha?: string };
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const VIEWS: { key: PayrollView; label: string; hint: string }[] = [
  { key: "pagar", label: "Por pagar", hint: "El último periodo cuyo día de pago ya llegó." },
  { key: "curso", label: "Periodo en curso", hint: "Lo que lleva acumulado el periodo que corre hoy." },
];

export default async function NominaPage({ searchParams }: { searchParams: Promise<Search> }) {
  const f = await searchParams;
  const fecha = f.fecha && DAY_RE.test(f.fecha) ? f.fecha : undefined;
  const view: PayrollView = fecha ? "fecha" : f.vista === "curso" ? "curso" : "pagar";
  const { rows, settings } = await loadPayroll(view, fecha);
  const today = businessDayKey();

  const total = rows.reduce((s, r) => s + (r.amountCents ?? 0), 0);
  const missingPay = rows.filter((r) => r.amountCents == null).length;
  const inputCls = "rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold";
  const th = "px-3 py-2 text-left text-[11px] font-normal uppercase tracking-wider text-muted";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-end gap-2">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={`/admin/asistencia/nomina?vista=${v.key}`}
              title={v.hint}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm",
                view === v.key ? "bg-gold text-white" : "bg-white text-muted shadow-sm hover:text-ink",
              )}
            >
              {v.label}
            </Link>
          ))}
          <form className="flex items-end gap-2">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-muted">Periodo que incluye el día</label>
              <input type="date" name="fecha" defaultValue={fecha ?? ""} className={inputCls} />
            </div>
            <button className="rounded-full bg-ink px-4 py-2 text-sm text-cream hover:bg-gold-dark">Ver</button>
          </form>
        </div>
        <PrintButton />
      </div>

      <div className="mb-4 hidden print:block">
        <p className="font-serif text-2xl tracking-wide">{STORE.brand}</p>
        <p className="text-lg">Nómina · {VIEWS.find((v) => v.key === view)?.label ?? `periodo del ${fecha}`}</p>
      </div>
      <p className="mb-4 text-sm text-muted">
        Cada persona se calcula con su propio periodo y día de pago. Tolerancia de {settings.toleranceMin} min.
      </p>

      {rows.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-sm text-muted shadow-sm">No hay personal activo.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm print:shadow-none">
          <table className="w-full text-sm">
            <thead className="border-b border-ink/10">
              <tr>
                <th className={th}>Persona</th>
                <th className={th}>Periodo</th>
                <th className={th}>Día de pago</th>
                <th className={cn(th, "text-right")}>Días</th>
                <th className={cn(th, "text-right")}>Horas</th>
                <th className={cn(th, "text-right")}>Faltas</th>
                <th className={cn(th, "text-right")}>Retardos</th>
                <th className={cn(th, "text-right")}>Sueldo</th>
                <th className={cn(th, "text-right")}>A pagar</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ employee: e, period: p, totals: t, amountCents }) => (
                <tr key={e.id} className="border-b border-ink/5 align-top last:border-0">
                  <td className="px-3 py-2.5">
                    <p className="text-ink">{e.full_name}</p>
                    <p className="text-xs text-muted">{payScheduleLabel(e)}</p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <Link
                      href={`/admin/asistencia/reportes?desde=${p.fromKey}&hasta=${p.toKey}&persona=${e.id}`}
                      className="text-ink hover:text-gold print:no-underline"
                    >
                      {formatDayKey(p.fromKey)} al {formatDayKey(p.toKey)}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {formatDayKey(p.payDayKey)}
                    {p.payDayKey === today && <span className="ml-1 rounded bg-gold/15 px-1.5 text-xs text-gold-dark">hoy</span>}
                    {p.toKey >= today && <span className="ml-1 text-xs text-muted">(en curso)</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{t.daysWorked}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink">{formatMinutes(t.workedMin)}</td>
                  <td className={cn("px-3 py-2.5 text-right tabular-nums", t.absences && "text-red-600")}>{t.absences}</td>
                  <td className={cn("px-3 py-2.5 text-right tabular-nums", t.lateCount && "text-amber-700")}>{t.lateCount}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs text-muted">
                    {e.pay_kind && e.pay_amount_cents != null
                      ? `${formatMXN(e.pay_amount_cents)} ${e.pay_kind === "hourly" ? "/ hora" : "fijo"}`
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums font-medium text-ink">
                    {amountCents != null ? formatMXN(amountCents) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-ink/10">
              <tr>
                <td colSpan={8} className="px-3 py-2 text-xs uppercase tracking-wider text-muted">Total</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-ink">{formatMXN(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-muted">
        Sueldo fijo: se muestra el sueldo completo y las faltas aparte, para que decidas si descuentas.
        Pago por hora: horas trabajadas × tarifa.
        {missingPay > 0 && ` ${missingPay} persona(s) sin sueldo capturado: agrégalo en Personal y horarios para ver el importe.`}
      </p>
    </div>
  );
}
