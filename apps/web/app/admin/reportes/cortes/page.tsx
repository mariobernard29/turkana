import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMXN } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Filters = { desde?: string; hasta?: string; lote?: string };
type Row = {
  id: string;
  opened_at: string;
  closed_at: string | null;
  opening_float_cents: number;
  counted_cash_cents: number | null;
  counted_card_cents: number | null;
  counted_debit_cents: number | null;
  counted_credit_cents: number | null;
  counted_amex_cents: number | null;
  counted_transfer_cents: number | null;
  expected_cash_cents: number | null;
  difference_cents: number | null;
  cashier_id: string;
  cash_registers: { name: string } | { name: string }[] | null;
};

async function load(f: Filters): Promise<{ rows: Row[]; names: Record<string, string> }> {
  try {
    const db = createAdminClient();
    let q = db
      .from("cash_sessions")
      .select("id, opened_at, closed_at, opening_float_cents, counted_cash_cents, counted_card_cents, counted_debit_cents, counted_credit_cents, counted_amex_cents, counted_transfer_cents, expected_cash_cents, difference_cents, cashier_id, cash_registers(name)")
      .eq("status", "closed")
      .order("closed_at", { ascending: false })
      .limit(200);
    if (f.desde) q = q.gte("closed_at", `${f.desde}T00:00:00`);
    if (f.hasta) q = q.lte("closed_at", `${f.hasta}T23:59:59`);
    if (f.lote) q = q.ilike("id", `${f.lote}%`);
    const { data } = await q;
    const rows = (data as unknown as Row[]) ?? [];

    const ids = [...new Set(rows.map((r) => r.cashier_id))];
    const names: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await db.from("profiles").select("id, full_name").in("id", ids);
      for (const p of (profs as unknown as { id: string; full_name: string }[]) ?? []) names[p.id] = p.full_name;
    }
    return { rows, names };
  } catch {
    return { rows: [], names: {} };
  }
}

const reg = (c: Row["cash_registers"]) => (Array.isArray(c) ? c[0]?.name : c?.name) ?? "—";

export default async function CortesPage({ searchParams }: { searchParams: Promise<Filters> }) {
  const f = await searchParams;
  const { rows, names } = await load(f);
  const inputCls = "rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold";

  return (
    <div>
      <Link href="/admin/reportes" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft className="h-4 w-4" /> Reportes
      </Link>
      <h1 className="mb-1 text-3xl text-ink">Cortes de caja</h1>
      <p className="mb-6 text-sm text-muted">{rows.length} cortes realizados</p>

      <form className="mb-8 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-muted">Lote</label>
          <input name="lote" defaultValue={f.lote ?? ""} placeholder="Primeros dígitos del folio" className={`${inputCls} w-48`} />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-muted">Desde</label>
          <input type="date" name="desde" defaultValue={f.desde ?? ""} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-muted">Hasta</label>
          <input type="date" name="hasta" defaultValue={f.hasta ?? ""} className={inputCls} />
        </div>
        <button type="submit" className="rounded-full bg-ink px-6 py-2 text-sm uppercase tracking-widest text-cream hover:bg-gold-dark">Buscar</button>
        {(f.lote || f.desde || f.hasta) && <Link href="/admin/reportes/cortes" className="px-2 py-2 text-sm text-muted hover:text-ink">Limpiar</Link>}
      </form>

      <div className="space-y-4">
        {rows.length === 0 && <p className="py-12 text-center text-muted">Sin cortes en esta búsqueda.</p>}
        {rows.map((s) => {
          const diff = s.difference_cents ?? 0;
          return (
            <div key={s.id} className="rounded-2xl border border-ink/10 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-ink">{reg(s.cash_registers)} · <span className="text-muted">Cajero: {names[s.cashier_id] ?? "—"}</span></p>
                  <p className="text-xs text-muted">Lote {s.id.slice(0, 8)} · {s.closed_at ? new Date(s.closed_at).toLocaleString("es-MX") : ""}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wider text-muted">Diferencia</p>
                  <p className={`text-xl font-semibold tabular-nums ${diff === 0 ? "text-green-600" : diff > 0 ? "text-blue-600" : "text-red-600"}`}>
                    {diff >= 0 ? "+" : ""}{formatMXN(diff)}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <Detail label="Fondo inicial" value={formatMXN(s.opening_float_cents)} />
                <Detail label="Efectivo esperado" value={formatMXN(s.expected_cash_cents ?? 0)} />
                <Detail label="Efectivo contado" value={formatMXN(s.counted_cash_cents ?? 0)} />
                {s.counted_debit_cents == null && s.counted_credit_cents == null && s.counted_amex_cents == null ? (
                  <Detail label="Tarjeta contada" value={formatMXN(s.counted_card_cents ?? 0)} />
                ) : (
                  <>
                    <Detail label="Débito contado" value={formatMXN(s.counted_debit_cents ?? 0)} />
                    <Detail label="Crédito contado" value={formatMXN(s.counted_credit_cents ?? 0)} />
                    <Detail label="Amex contado" value={formatMXN(s.counted_amex_cents ?? 0)} />
                  </>
                )}
                <Detail label="Transferencias" value={formatMXN(s.counted_transfer_cents ?? 0)} />
                <Detail label="Apertura" value={new Date(s.opened_at).toLocaleString("es-MX")} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-ink/5 py-1">
      <span className="text-muted">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}
