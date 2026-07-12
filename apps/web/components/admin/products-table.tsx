"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { formatMXN } from "@/lib/utils";

type VariantRow = { price_cents: number };
export type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  status: string;
  categories: { name: string } | null;
  product_variants: VariantRow[];
};

function priceRange(variants: VariantRow[]): string {
  if (!variants.length) return "—";
  const prices = variants.map((v) => v.price_cents);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatMXN(min) : `${formatMXN(min)} – ${formatMXN(max)}`;
}

const STATUS_STYLE: Record<string, string> = {
  active: "bg-green-50 text-green-700",
  draft: "bg-amber-50 text-amber-700",
  archived: "bg-gray-100 text-gray-500",
};

export function ProductsTable({ products }: { products: ProductRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.sku ?? "").toLowerCase().includes(q) ||
      (p.categories?.name ?? "").toLowerCase().includes(q),
    );
  }, [products, query]);

  return (
    <div>
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.5} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre, SKU o categoría…"
          className="w-full rounded-full border border-ink/10 bg-white py-3 pl-11 pr-4 text-sm outline-none focus:border-gold"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink/15 bg-white p-16 text-center">
          <p className="font-serif text-xl text-ink">Sin resultados</p>
          <p className="mt-2 text-sm text-muted">No hay productos que coincidan con “{query}”.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-6 py-4 font-medium">Producto</th>
                <th className="px-6 py-4 font-medium">SKU</th>
                <th className="px-6 py-4 font-medium">Categoría</th>
                <th className="px-6 py-4 font-medium">Variantes</th>
                <th className="px-6 py-4 font-medium">Precio</th>
                <th className="px-6 py-4 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-ink/5 last:border-0 hover:bg-cream/50">
                  <td className="px-6 py-4">
                    <Link href={`/admin/productos/${p.id}`} className="text-ink hover:text-gold">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-muted">{p.sku ?? "—"}</td>
                  <td className="px-6 py-4 text-muted">{p.categories?.name ?? "—"}</td>
                  <td className="px-6 py-4 text-muted">{p.product_variants.length}</td>
                  <td className="px-6 py-4 text-ink">{priceRange(p.product_variants)}</td>
                  <td className="px-6 py-4">
                    <span className={`rounded-full px-3 py-1 text-xs ${STATUS_STYLE[p.status] ?? ""}`}>
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
