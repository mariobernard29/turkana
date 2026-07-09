import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { LayawaysManager, type LayawayRow } from "@/components/admin/layaways-manager";

export const dynamic = "force-dynamic";

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

async function load(): Promise<LayawayRow[]> {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("layaways")
      .select("id, total_cents, paid_cents, due_date, status, customers(full_name), product_variants(sku, products(name))")
      .order("created_at", { ascending: false });
    type Raw = {
      id: string; total_cents: number; paid_cents: number; due_date: string | null; status: string;
      customers: { full_name: string } | { full_name: string }[] | null;
      product_variants: { sku: string; products: { name: string } | { name: string }[] | null } | { sku: string; products: { name: string } | { name: string }[] | null }[] | null;
    };
    return ((data as unknown as Raw[]) ?? []).map((l) => {
      const v = one(l.product_variants);
      const p = v ? one(v.products) : null;
      return { id: l.id, customer: one(l.customers)?.full_name ?? "—", item: p?.name ?? v?.sku ?? "Apartado", total: l.total_cents, paid: l.paid_cents, dueDate: l.due_date, status: l.status };
    });
  } catch { return []; }
}

export default async function ApartadosPage() {
  const rows = await load();
  const active = rows.filter((r) => r.status === "active").length;
  return (
    <div>
      <Link href="/admin/clientes" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft className="h-4 w-4" /> Clientes
      </Link>
      <h1 className="mb-1 text-3xl text-ink">Apartados</h1>
      <p className="mb-6 text-sm text-muted">{active} activos · {rows.length} en total</p>
      <LayawaysManager rows={rows} />
    </div>
  );
}
