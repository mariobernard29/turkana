"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { ProductCard, type CatalogProduct } from "@/components/shop/product-card";

export type SearchItem = CatalogProduct & { description: string };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function SearchClient({ products }: { products: SearchItem[] }) {
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    const s = norm(q.trim());
    if (s.length < 2) return [];
    return products
      .filter((p) => norm(p.name).includes(s) || norm(p.description).includes(s) || (p.material && norm(p.material).includes(s)))
      .slice(0, 24);
  }, [q, products]);

  const typing = q.trim().length >= 2;

  return (
    <div>
      <div className="relative mx-auto max-w-2xl">
        <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-gold" strokeWidth={1.5} />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Busca anillos, collares, materiales…"
          className="w-full rounded-full border border-ink/15 bg-white py-4 pl-14 pr-6 text-base text-ink shadow-sm outline-none transition-colors focus:border-gold"
        />
      </div>

      <div className="mt-12">
        {!typing ? (
          <p className="text-center text-sm text-muted">Escribe al menos dos letras para buscar en la colección.</p>
        ) : results.length === 0 ? (
          <p className="text-center text-sm text-muted">No encontramos piezas para “{q}”.</p>
        ) : (
          <>
            <p className="mb-8 text-center text-xs uppercase tracking-widest text-muted">
              {results.length} resultado{results.length !== 1 ? "s" : ""}
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-4">
              {results.map((p) => <ProductCard key={p.slug} product={p} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
