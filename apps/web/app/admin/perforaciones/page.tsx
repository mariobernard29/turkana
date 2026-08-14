import Link from "next/link";
import { Plus } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  FOLLOWUP_LABEL,
  FOLLOWUP_STYLE,
  MONTH_DAYS,
  WEEK_DAYS,
  cutoffDate,
  followupState,
  sanitizeSpots,
  spotsSummary,
} from "@/lib/piercings";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  folio: string;
  performed_at: string;
  batch_number: string | null;
  spots: string[];
  week_email_sent_at: string | null;
  month_email_sent_at: string | null;
  customers: { full_name: string; phone: string | null } | { full_name: string; phone: string | null }[] | null;
};

type Filters = { q?: string; desde?: string; hasta?: string; seg?: string };

async function loadPiercings(f: Filters): Promise<Row[]> {
  try {
    const db = createAdminClient();
    let query = db
      .from("piercings")
      .select(
        "id, folio, performed_at, batch_number, spots, week_email_sent_at, month_email_sent_at, customers(full_name, phone)",
      )
      .is("deleted_at", null)
      .order("performed_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    // Buscador: el folio y el lote viven aquí, pero el nombre y el teléfono están
    // en customers. PostgREST no cruza un OR entre la tabla base y el embed, así
    // que primero se resuelven los ids del cliente y luego van en un solo .or().
    const term = (f.q ?? "").trim().replace(/[%,()]/g, "");
    if (term) {
      const clauses = [`folio.ilike.%${term}%`, `batch_number.ilike.%${term}%`];
      const digits = term.replace(/\D/g, "");
      const custOr = [
        `full_name.ilike.%${term}%`,
        `phone.ilike.%${term}%`,
        // phone_digits (columna generada de 0024) permite buscar "6681234567"
        // aunque el teléfono se haya guardado como "668 123 4567".
        ...(digits.length >= 4 ? [`phone_digits.ilike.%${digits}%`] : []),
      ].join(",");
      const { data: cust } = await db
        .from("customers").select("id").is("deleted_at", null).or(custOr).limit(300);
      const ids = ((cust as unknown as { id: string }[]) ?? []).map((c) => c.id);
      if (ids.length) clauses.push(`customer_id.in.(${ids.join(",")})`);
      query = query.or(clauses.join(","));
    }

    if (f.desde) query = query.gte("performed_at", f.desde);
    if (f.hasta) query = query.lte("performed_at", f.hasta);

    // Seguimiento pendiente. "Al corriente" = ni el semanal ni el mensual vencidos
    // sin enviar; se expresa como la negación de las dos condiciones anteriores.
    const d7 = cutoffDate(WEEK_DAYS);
    const d30 = cutoffDate(MONTH_DAYS);
    if (f.seg === "semanal") {
      query = query.is("week_email_sent_at", null).lte("performed_at", d7);
    } else if (f.seg === "mensual") {
      query = query.is("month_email_sent_at", null).lte("performed_at", d30);
    } else if (f.seg === "corriente") {
      query = query.or(
        `and(or(week_email_sent_at.not.is.null,performed_at.gt.${d7}),` +
          `or(month_email_sent_at.not.is.null,performed_at.gt.${d30}))`,
      );
    }

    const { data } = await query;
    return (data as unknown as Row[]) ?? [];
  } catch {
    return [];
  }
}

function customer(c: Row["customers"]) {
  return (Array.isArray(c) ? c[0] : c) ?? null;
}

export default async function PiercingsPage({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  const f = await searchParams;
  const rows = await loadPiercings(f);
  const inputCls = "rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold";
  const hasFilters = Boolean(f.q || f.desde || f.hasta || f.seg);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="mb-1 text-3xl text-ink">Perforaciones</h1>
          <p className="text-sm text-muted">{rows.length} perforaciones</p>
        </div>
        <Link
          href="/admin/perforaciones/nueva"
          className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark"
        >
          <Plus className="h-4 w-4" /> Nueva perforación
        </Link>
      </div>

      {/* Buscador + filtros */}
      <form className="mb-8 flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <label className="mb-1 block text-xs uppercase tracking-wider text-muted">Buscar</label>
          <input
            type="search"
            name="q"
            defaultValue={f.q ?? ""}
            placeholder="Folio, nombre o teléfono"
            className={`${inputCls} w-full`}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-muted">Desde</label>
          <input type="date" name="desde" defaultValue={f.desde ?? ""} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-muted">Hasta</label>
          <input type="date" name="hasta" defaultValue={f.hasta ?? ""} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-muted">Seguimiento</label>
          <select name="seg" defaultValue={f.seg ?? ""} className={inputCls}>
            <option value="">Todos</option>
            <option value="semanal">Semanal pendiente</option>
            <option value="mensual">Mensual pendiente</option>
            <option value="corriente">Al corriente</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-full bg-ink px-6 py-2 text-sm uppercase tracking-widest text-cream hover:bg-gold-dark"
        >
          Filtrar
        </button>
        {hasFilters && (
          <Link href="/admin/perforaciones" className="px-2 py-2 text-sm text-muted hover:text-ink">
            Limpiar
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink/15 bg-white p-16 text-center">
          <p className="font-serif text-xl text-ink">
            {hasFilters ? "Sin resultados" : "Aún no hay perforaciones"}
          </p>
          <p className="mt-2 text-sm text-muted">
            {hasFilters
              ? "Prueba con otro término o limpia los filtros."
              : "Registra la primera perforación para llevar su seguimiento."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-6 py-4 font-medium">Folio</th>
                <th className="px-6 py-4 font-medium">Fecha</th>
                <th className="px-6 py-4 font-medium">Cliente</th>
                <th className="px-6 py-4 font-medium">Teléfono</th>
                <th className="px-6 py-4 font-medium">Puntos</th>
                <th className="px-6 py-4 font-medium">Lote</th>
                <th className="px-6 py-4 font-medium">Seguimiento</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const c = customer(p.customers);
                const state = followupState(p);
                return (
                  <tr key={p.id} className="border-b border-ink/5 last:border-0 hover:bg-cream/50">
                    <td className="px-6 py-4">
                      <Link href={`/admin/perforaciones/${p.id}`} className="text-ink hover:text-gold">
                        {p.folio}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-muted">
                      {new Date(`${p.performed_at}T12:00:00Z`).toLocaleDateString("es-MX", {
                        day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
                      })}
                    </td>
                    <td className="px-6 py-4 text-ink">{c?.full_name ?? "—"}</td>
                    <td className="px-6 py-4 text-muted">{c?.phone ?? "—"}</td>
                    <td className="px-6 py-4 text-muted">{spotsSummary(sanitizeSpots(p.spots))}</td>
                    <td className="px-6 py-4 text-muted">{p.batch_number ?? "—"}</td>
                    <td className="px-6 py-4">
                      <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs ${FOLLOWUP_STYLE[state]}`}>
                        {FOLLOWUP_LABEL[state]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
