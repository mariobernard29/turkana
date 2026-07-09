"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Loader2, ArrowRightLeft } from "lucide-react";
import { applyMovement, transferStock } from "@/app/admin/inventario/actions";
import { cn } from "@/lib/utils";

export type InvRow = {
  variantId: string;
  sku: string;
  productName: string;
  attributesText: string;
  stockTienda: number;
  stockEcommerce: number;
};

type Op = "entrada" | "salida" | "ajuste" | "traspaso";
const OP_LABEL: Record<Op, string> = {
  entrada: "Entrada", salida: "Salida", ajuste: "Ajuste", traspaso: "Traspaso",
};

export function InventoryManager({ rows }: { rows: InvRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<InvRow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.productName.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por producto o SKU…"
            className="w-full rounded-lg border border-ink/15 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-gold"
          />
        </div>
        <span className="text-sm text-muted">{filtered.length} variantes</span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ink/10 text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-6 py-4 font-medium">Producto</th>
              <th className="px-6 py-4 font-medium">SKU</th>
              <th className="px-6 py-4 text-center font-medium">Tienda</th>
              <th className="px-6 py-4 text-center font-medium">E-commerce</th>
              <th className="px-6 py-4 text-center font-medium">Total</th>
              <th className="px-6 py-4 text-right font-medium">Acción</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.variantId} className="border-b border-ink/5 last:border-0 hover:bg-cream/50">
                <td className="px-6 py-4">
                  <p className="text-ink">{r.productName}</p>
                  {r.attributesText && <p className="text-xs text-muted">{r.attributesText}</p>}
                </td>
                <td className="px-6 py-4 text-muted">{r.sku}</td>
                <td className={cn("px-6 py-4 text-center", r.stockTienda === 0 && "text-red-500")}>{r.stockTienda}</td>
                <td className={cn("px-6 py-4 text-center", r.stockEcommerce === 0 && "text-red-500")}>{r.stockEcommerce}</td>
                <td className="px-6 py-4 text-center text-ink">{r.stockTienda + r.stockEcommerce}</td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => setActive(r)}
                    className="rounded-full border border-ink/15 px-4 py-1.5 text-xs uppercase tracking-wider text-ink transition-colors hover:border-gold"
                  >
                    Mover
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-16 text-center text-muted">Sin resultados</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {active && (
        <MovementModal
          row={active}
          onClose={() => setActive(null)}
          onDone={() => { setActive(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function MovementModal({
  row,
  onClose,
  onDone,
}: {
  row: InvRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [op, setOp] = useState<Op>("entrada");
  const [locationKey, setLocationKey] = useState<"tienda" | "ecommerce">("tienda");
  const [fromKey, setFromKey] = useState<"tienda" | "ecommerce">("tienda");
  const [toKey, setToKey] = useState<"tienda" | "ecommerce">("ecommerce");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const qty = Number(quantity);
    const res =
      op === "traspaso"
        ? await transferStock({ variantId: row.variantId, fromKey, toKey, quantity: qty, notes })
        : await applyMovement({ variantId: row.variantId, type: op, locationKey, quantity: qty, notes });
    setBusy(false);
    if (!res.ok) { setError(res.error ?? "Error"); return; }
    onDone();
  };

  const field = "w-full rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-gold";
  const label = "mb-1.5 block text-xs uppercase tracking-wider text-muted";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg text-ink">{row.productName}</h3>
            <p className="text-xs text-muted">{row.sku} · Tienda {row.stockTienda} · E-commerce {row.stockEcommerce}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink"><X className="h-5 w-5" /></button>
        </div>

        {/* Selector de operación */}
        <div className="mb-4 grid grid-cols-4 gap-1 rounded-lg bg-cream p-1">
          {(Object.keys(OP_LABEL) as Op[]).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOp(o)}
              className={cn(
                "rounded-md py-2 text-xs transition-colors",
                op === o ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink",
              )}
            >
              {OP_LABEL[o]}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          {op === "traspaso" ? (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className={label}>De</label>
                <select className={field} value={fromKey} onChange={(e) => setFromKey(e.target.value as "tienda" | "ecommerce")}>
                  <option value="tienda">Tienda</option>
                  <option value="ecommerce">E-commerce</option>
                </select>
              </div>
              <ArrowRightLeft className="mb-3 h-4 w-4 shrink-0 text-muted" />
              <div className="flex-1">
                <label className={label}>A</label>
                <select className={field} value={toKey} onChange={(e) => setToKey(e.target.value as "tienda" | "ecommerce")}>
                  <option value="ecommerce">E-commerce</option>
                  <option value="tienda">Tienda</option>
                </select>
              </div>
            </div>
          ) : (
            <div>
              <label className={label}>Almacén</label>
              <select className={field} value={locationKey} onChange={(e) => setLocationKey(e.target.value as "tienda" | "ecommerce")}>
                <option value="tienda">Tienda</option>
                <option value="ecommerce">E-commerce</option>
              </select>
            </div>
          )}

          <div>
            <label className={label}>
              {op === "ajuste" ? "Cantidad final (absoluta)" : "Cantidad"}
            </label>
            <input
              type="number"
              min={op === "ajuste" ? 0 : 1}
              className={field}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </div>

          <div>
            <label className={label}>Notas (opcional)</label>
            <input className={field} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error && <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3 text-sm uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Aplicar {OP_LABEL[op]}
          </button>
        </form>
      </div>
    </div>
  );
}
