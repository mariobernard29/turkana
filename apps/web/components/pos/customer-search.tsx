"use client";

// Buscador de clientes del POS (nombre, teléfono o correo) con alta al vuelo.
// Mismo patrón que VariantSearch, pero consultando al servidor con debounce.
import { useEffect, useRef, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { searchCustomers, createPosCustomer, type PosCustomer } from "@/app/pos/customer-actions";
import { formatMXN } from "@/lib/utils";

const field = "w-full rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-gold";

export function CustomerSearch({
  onSelect,
  placeholder,
  autoFocus,
}: {
  onSelect: (c: PosCustomer) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<PosCustomer[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    const id = ++seq.current;
    setBusy(true);
    const t = setTimeout(async () => {
      const rows = await searchCustomers(term);
      if (id === seq.current) { setResults(rows); setBusy(false); }
    }, 250);
    return () => { clearTimeout(t); };
  }, [q]);

  const startCreate = () => {
    setCreating(true);
    // Si lo escrito son puros dígitos es un teléfono; si no, el nombre.
    const term = q.trim();
    const digits = term.replace(/\D/g, "");
    setForm({
      name: digits.length >= 5 ? "" : term,
      phone: digits.length >= 5 ? term : "",
      email: "",
    });
  };

  const create = async () => {
    setError(null); setBusy(true);
    const res = await createPosCustomer(form);
    setBusy(false);
    if (!res.ok || !res.customer) { setError(res.error ?? "Error"); return; }
    setCreating(false); setOpen(false); setQ("");
    onSelect(res.customer);
  };

  if (creating) {
    return (
      <div className="space-y-2 rounded-lg border border-gold/40 bg-cream/50 p-3">
        <p className="text-xs uppercase tracking-wider text-muted">Nuevo cliente</p>
        <input className={field} placeholder="Nombre completo *" value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        <input className={field} placeholder="Teléfono" inputMode="tel" value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input className={field} placeholder="Correo (opcional)" inputMode="email" value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })} />
        {error && <p className="text-xs text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={create} disabled={busy || !form.name.trim()}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-ink py-2.5 text-sm text-cream hover:bg-gold-dark disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Guardar cliente
          </button>
          <button type="button" onClick={() => { setCreating(false); setError(null); }}
            className="rounded-full border border-ink/15 px-4 py-2.5 text-sm text-muted hover:text-ink">
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        className={field}
        placeholder={placeholder ?? "Buscar cliente por nombre, teléfono o correo…"}
        value={q}
        autoFocus={autoFocus}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
      />
      {open && q.trim().length > 0 && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-ink/10 bg-white shadow-lg">
            {busy && <p className="px-3 py-2 text-xs text-muted">Buscando…</p>}
            {!busy && results.length === 0 && q.trim().length >= 2 && (
              <p className="px-3 py-2 text-xs text-muted">Sin resultados</p>
            )}
            {results.map((c) => (
              <button type="button" key={c.id}
                onClick={() => { onSelect(c); setOpen(false); setQ(""); }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-cream">
                <span className="text-ink">{c.name}</span>
                <span className="text-muted">
                  {c.phone ? ` · ${c.phone}` : ""}
                  {c.email ? ` · ${c.email}` : ""}
                </span>
                {(c.rewardsBalanceCents > 0 || c.credit) && (
                  <span className="block text-xs text-gold">
                    {c.rewardsBalanceCents > 0 ? `Rewards ${formatMXN(c.rewardsBalanceCents)}` : ""}
                    {c.rewardsBalanceCents > 0 && c.credit ? " · " : ""}
                    {c.credit ? `Crédito: debe ${formatMXN(c.credit.balanceCents)} de ${formatMXN(c.credit.limitCents)}` : ""}
                  </span>
                )}
              </button>
            ))}
            <button type="button" onClick={startCreate}
              className="flex w-full items-center gap-2 border-t border-ink/10 px-3 py-2.5 text-left text-sm text-ink hover:bg-cream">
              <UserPlus className="h-4 w-4 text-gold" /> Crear cliente «{q.trim()}»
            </button>
          </div>
        </>
      )}
    </div>
  );
}
