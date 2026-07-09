import Link from "next/link";
import { Search, Bookmark, CreditCard } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Row = { id: string; full_name: string; email: string | null; phone: string | null };

async function loadCustomers(q?: string): Promise<Row[]> {
  try {
    const db = createAdminClient();
    let query = db
      .from("customers")
      .select("id, full_name, email, phone")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100);
    if (q && q.trim()) {
      const term = q.trim().replace(/[%,()]/g, "");
      query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
    }
    const { data } = await query;
    return (data as unknown as Row[]) ?? [];
  } catch {
    return [];
  }
}

async function counts(): Promise<{ layaways: number; credits: number }> {
  try {
    const db = createAdminClient();
    const [{ count: lay }, { count: cred }] = await Promise.all([
      db.from("layaways").select("id", { count: "exact", head: true }).eq("status", "active"),
      db.from("credit_accounts").select("id", { count: "exact", head: true }).gt("balance_cents", 0),
    ]);
    return { layaways: lay ?? 0, credits: cred ?? 0 };
  } catch {
    return { layaways: 0, credits: 0 };
  }
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const [customers, c] = await Promise.all([loadCustomers(q), counts()]);

  return (
    <div>
      <h1 className="mb-1 text-3xl text-ink">Clientes</h1>
      <p className="mb-6 text-sm text-muted">{customers.length} clientes registrados</p>

      {/* Accesos a apartados y créditos */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <Link href="/admin/clientes/apartados" className="flex items-center gap-4 rounded-2xl border border-ink/10 bg-white p-5 shadow-sm transition-colors hover:border-gold">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gold/10 text-gold"><Bookmark className="h-5 w-5" /></span>
          <div>
            <p className="text-ink">Apartados</p>
            <p className="text-sm text-muted">{c.layaways} activos · abonos y entregas</p>
          </div>
        </Link>
        <Link href="/admin/clientes/creditos" className="flex items-center gap-4 rounded-2xl border border-ink/10 bg-white p-5 shadow-sm transition-colors hover:border-gold">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gold/10 text-gold"><CreditCard className="h-5 w-5" /></span>
          <div>
            <p className="text-ink">Créditos</p>
            <p className="text-sm text-muted">{c.credits} con saldo · cargos y pagos</p>
          </div>
        </Link>
      </div>

      <form className="mb-6 max-w-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Buscar por nombre, email o teléfono…"
            className="w-full rounded-lg border border-ink/15 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-gold"
          />
        </div>
      </form>

      {customers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink/15 bg-white p-16 text-center">
          <p className="font-serif text-xl text-ink">Sin clientes</p>
          <p className="mt-2 text-sm text-muted">Aparecerán al registrar ventas o pedidos online.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-6 py-4 font-medium">Cliente</th>
                <th className="px-6 py-4 font-medium">Correo</th>
                <th className="px-6 py-4 font-medium">Teléfono</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-ink/5 last:border-0 hover:bg-cream/50">
                  <td className="px-6 py-4">
                    <Link href={`/admin/clientes/${c.id}`} className="text-ink hover:text-gold">{c.full_name}</Link>
                  </td>
                  <td className="px-6 py-4 text-muted">{c.email ?? "—"}</td>
                  <td className="px-6 py-4 text-muted">{c.phone ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
