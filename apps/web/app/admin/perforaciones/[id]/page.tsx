import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { EarPicker } from "@/components/admin/ear-picker";
import { PiercingFollowups } from "@/components/admin/piercing-followups";
import {
  FOLLOWUP_LABEL,
  FOLLOWUP_STYLE,
  daysSince,
  followupState,
  sanitizeSpots,
  spotLabel,
} from "@/lib/piercings";

export const dynamic = "force-dynamic";

type Piercing = {
  id: string;
  folio: string;
  performed_at: string;
  batch_number: string | null;
  spots: string[];
  notes: string | null;
  care_email_sent_at: string | null;
  week_email_sent_at: string | null;
  month_email_sent_at: string | null;
  customers:
    | { id: string; full_name: string; email: string | null; phone: string | null }
    | { id: string; full_name: string; email: string | null; phone: string | null }[]
    | null;
};

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default async function PiercingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff();
  const { id } = await params;

  const db = createAdminClient();
  const { data } = await db
    .from("piercings")
    .select(
      "id, folio, performed_at, batch_number, spots, notes, care_email_sent_at, week_email_sent_at, month_email_sent_at, customers(id, full_name, email, phone)",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  const p = data as unknown as Piercing | null;
  if (!p) notFound();

  const customer = one(p.customers);
  const spots = sanitizeSpots(p.spots);
  const state = followupState(p);
  const dias = daysSince(p.performed_at);
  const fecha = new Date(`${p.performed_at}T12:00:00Z`).toLocaleDateString("es-MX", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });

  return (
    <div>
      <Link
        href="/admin/perforaciones"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" /> Perforaciones
      </Link>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl text-ink">{p.folio}</h1>
          <p className="mt-1 text-sm text-muted">
            {fecha} · hace {dias} {dias === 1 ? "día" : "días"}
          </p>
        </div>
        <span className={`rounded-full px-4 py-1.5 text-sm ${FOLLOWUP_STYLE[state]}`}>
          {FOLLOWUP_LABEL[state]}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
            <h2 className="mb-6 text-xs uppercase tracking-wider text-muted">Puntos perforados</h2>
            <EarPicker value={spots} readOnly />
            <ul className="mt-6 space-y-1 text-sm text-ink">
              {spots.map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-gold" />
                  {spotLabel(k)}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-ink/10 bg-white p-6 text-sm shadow-sm">
            <h2 className="mb-3 text-xs uppercase tracking-wider text-muted">Detalles</h2>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted">Fecha</span>
                <span className="text-ink">{fecha}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Lote del arete</span>
                <span className="text-ink">{p.batch_number ?? "—"}</span>
              </div>
            </div>
            {p.notes && (
              <p className="mt-4 whitespace-pre-wrap border-t border-ink/10 pt-4 text-muted">{p.notes}</p>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-ink/10 bg-white p-6 text-sm shadow-sm">
            <h2 className="mb-3 text-xs uppercase tracking-wider text-muted">Cliente</h2>
            <div className="space-y-1">
              {customer ? (
                <Link href={`/admin/clientes/${customer.id}`} className="text-ink hover:text-gold">
                  {customer.full_name}
                </Link>
              ) : (
                <p className="text-ink">—</p>
              )}
              <p className="text-muted">{customer?.phone ?? "Sin teléfono"}</p>
              <p className="text-muted">{customer?.email ?? "Sin correo"}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xs uppercase tracking-wider text-muted">Seguimiento</h2>
            <PiercingFollowups
              piercingId={p.id}
              hasEmail={Boolean(customer?.email)}
              phone={customer?.phone ?? null}
              message={{
                customerName: customer?.full_name ?? "",
                performedAt: p.performed_at,
                spots,
              }}
              sentAt={{
                care: p.care_email_sent_at,
                week: p.week_email_sent_at,
                month: p.month_email_sent_at,
              }}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
