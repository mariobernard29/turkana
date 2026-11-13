"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Search, Eye, EyeOff, ImageOff } from "lucide-react";
import { formatMXN } from "@/lib/utils";
import { setProductOnline } from "@/app/admin/productos/actions";

type VariantRow = { price_cents: number };
export type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  status: string;
  hidden_online: boolean;
  categories: { name: string } | null;
  product_variants: VariantRow[];
  product_images: { id: string }[];
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

// Botón de publicar / quitar de la tienda en línea. La tienda se llena a mano:
// todo nace oculto y desde aquí se elige, pieza por pieza, qué sale a la web.
function OnlineToggle({ product }: { product: ProductRow }) {
  const [hidden, setHidden] = useState(product.hidden_online);
  const [pending, start] = useTransition();
  const sinFoto = (product.product_images ?? []).length === 0;

  function toggle() {
    const visible = hidden; // si está oculta, el clic la publica
    start(async () => {
      const res = await setProductOnline(product.id, visible);
      if (!res.ok) {
        alert(res.error ?? "No se pudo cambiar");
        return;
      }
      setHidden(!visible);
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={
        hidden
          ? sinFoto
            ? "Para publicarla necesita al menos una foto"
            : "Publicar en la tienda en línea"
          : "Quitar de la tienda en línea"
      }
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50 ${
        hidden
          ? "border-ink/15 text-muted hover:border-gold hover:text-ink"
          : "border-green-600/30 bg-green-50 text-green-700 hover:border-green-600"
      }`}
    >
      {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      {hidden ? "Oculta" : "En la tienda"}
      {hidden && sinFoto && <ImageOff className="h-3.5 w-3.5 text-amber-600" />}
    </button>
  );
}

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
                <th className="px-6 py-4 font-medium">Tienda en línea</th>
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
                  <td className="px-6 py-4">
                    <OnlineToggle product={p} />
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
