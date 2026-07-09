"use client";

import { useState, useMemo } from "react";
import { formatMXN } from "@/lib/utils";

type V = { variantId: string; sku: string; name: string; priceCents: number };

// Buscador de piezas por nombre o SKU (reemplaza al <select> en apartados/cambios).
export function VariantSearch({
  variants,
  value,
  onChange,
  placeholder,
}: {
  variants: V[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const selected = variants.find((v) => v.variantId === value);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = s ? variants.filter((v) => v.name.toLowerCase().includes(s) || v.sku.toLowerCase().includes(s)) : variants;
    return base.slice(0, 30);
  }, [variants, q]);

  const field = "w-full rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-gold";

  return (
    <div className="relative">
      <input
        className={field}
        placeholder={placeholder ?? "Buscar por nombre o SKU…"}
        value={open ? q : selected ? `${selected.name} · ${selected.sku}` : q}
        onFocus={() => { setOpen(true); setQ(""); }}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
      />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-ink/10 bg-white shadow-lg">
            {filtered.length === 0 && <p className="px-3 py-2 text-xs text-muted">Sin resultados</p>}
            {filtered.map((v) => (
              <button
                type="button"
                key={v.variantId}
                onClick={() => { onChange(v.variantId); setOpen(false); }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-cream"
              >
                <span className="text-ink">{v.name}</span>{" "}
                <span className="text-muted">· {v.sku} · {formatMXN(v.priceCents)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
