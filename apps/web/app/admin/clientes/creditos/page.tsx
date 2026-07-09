import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { CreditsManager, type CreditRow } from "@/components/admin/credits-manager";

export const dynamic = "force-dynamic";

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

async function load(): Promise<CreditRow[]> {
  try {
    const db = createAdminClient();
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await db
      .from("credit_accounts")
      .select("id, limit_cents, balance_cents, status, customers(full_name), credit_transactions(type, due_date)")
      .order("created_at", { ascending: false });
    type Raw = {
      id: string; limit_cents: number; balance_cents: number; status: string;
      customers: { full_name: string } | { full_name: string }[] | null;
      credit_transactions: { type: string; due_date: string | null }[] | null;
    };
    return ((data as unknown as Raw[]) ?? []).map((a) => {
      const overdue = (a.credit_transactions ?? []).some((t) => t.type === "charge" && t.due_date && t.due_date < today) && a.balance_cents > 0;
      return { id: a.id, customer: one(a.customers)?.full_name ?? "—", limit: a.limit_cents, balance: a.balance_cents, status: a.status, overdue };
    });
  } catch { return []; }
}

export default async function CreditosPage() {
  const rows = await load();
  const withBalance = rows.filter((r) => r.balance > 0).length;
  return (
    <div>
      <Link href="/admin/clientes" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft className="h-4 w-4" /> Clientes
      </Link>
      <h1 className="mb-1 text-3xl text-ink">Créditos</h1>
      <p className="mb-6 text-sm text-muted">{withBalance} con saldo deudor · {rows.length} cuentas</p>
      <CreditsManager rows={rows} />
    </div>
  );
}
