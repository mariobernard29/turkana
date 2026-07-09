"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, ShoppingBag } from "lucide-react";
import { formatMXN, productImageUrl, cn } from "@/lib/utils";
import { addToCart } from "@/lib/cart";

export type DetailVariant = {
  id: string;
  sku: string;
  priceCents: number;
  compareAtCents: number | null;
  attributes: Record<string, string>;
  stock: number;
};

export type DetailProduct = {
  slug: string;
  name: string;
  shortDescription: string | null;
  longDescription: string | null;
  material: string | null;
  stone: string | null;
  weightGrams: number | null;
};

function variantLabel(v: DetailVariant) {
  if (v.attributes?.talla) return `Talla ${v.attributes.talla}`;
  const vals = Object.values(v.attributes ?? {});
  return vals.length ? vals.join(" · ") : v.sku;
}

export function ProductDetail({
  product,
  images,
  variants,
}: {
  product: DetailProduct;
  images: string[];
  variants: DetailVariant[];
}) {
  const firstInStock = Math.max(0, variants.findIndex((v) => v.stock > 0));
  const [variantIdx, setVariantIdx] = useState(firstInStock);
  const [imageIdx, setImageIdx] = useState(0);
  const [added, setAdded] = useState(false);

  const variant = variants[variantIdx];
  const inStock = variant && variant.stock > 0;

  const handleAdd = () => {
    if (!variant || !inStock) return;
    addToCart({
      variantId: variant.id,
      productSlug: product.slug,
      name: product.name,
      sku: variant.sku,
      priceCents: variant.priceCents,
      image: images[0] ?? null,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="grid gap-12 lg:grid-cols-2">
      {/* Galería */}
      <div>
        <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-sand">
          {images.length > 0 ? (
            <Image
              src={productImageUrl(images[imageIdx])}
              alt={product.name}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
              priority
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs uppercase tracking-widest text-muted">
              Turkana
            </div>
          )}
        </div>
        {images.length > 1 && (
          <div className="mt-4 flex gap-3">
            {images.map((img, i) => (
              <button
                key={img}
                onClick={() => setImageIdx(i)}
                className={cn(
                  "relative h-20 w-20 overflow-hidden rounded-lg border",
                  i === imageIdx ? "border-gold" : "border-ink/10",
                )}
              >
                <Image
                  src={productImageUrl(img)}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="lg:pt-6">
        {product.material && (
          <p className="text-xs uppercase tracking-[0.3em] text-gold">{product.material}</p>
        )}
        <h1 className="mt-3 text-4xl text-ink">{product.name}</h1>
        {product.shortDescription && (
          <p className="mt-4 text-base leading-relaxed text-muted">{product.shortDescription}</p>
        )}

        {/* Precio */}
        <div className="mt-6 flex items-baseline gap-3">
          <span className="font-serif text-3xl text-ink">
            {variant ? formatMXN(variant.priceCents) : "—"}
          </span>
          {variant?.compareAtCents && variant.compareAtCents > variant.priceCents && (
            <span className="text-lg text-muted line-through">
              {formatMXN(variant.compareAtCents)}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted">Precio con IVA incluido</p>

        {/* Selector de variantes */}
        {variants.length > 1 && (
          <div className="mt-8">
            <p className="mb-2 text-xs uppercase tracking-wider text-muted">Opciones</p>
            <div className="flex flex-wrap gap-2">
              {variants.map((v, i) => (
                <button
                  key={v.id}
                  onClick={() => setVariantIdx(i)}
                  disabled={v.stock <= 0}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm transition-colors",
                    i === variantIdx
                      ? "border-ink bg-ink text-cream"
                      : "border-ink/15 text-ink hover:border-gold",
                    v.stock <= 0 && "cursor-not-allowed text-muted line-through opacity-50",
                  )}
                >
                  {variantLabel(v)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stock */}
        <p className="mt-6 text-sm">
          {inStock ? (
            <span className="text-green-700">
              {variant.stock <= 3 ? `Solo ${variant.stock} disponibles` : "Disponible"}
            </span>
          ) : (
            <span className="text-red-600">Agotado</span>
          )}
        </p>

        {/* Agregar al carrito */}
        <button
          onClick={handleAdd}
          disabled={!inStock}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-4 text-sm uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:px-12"
        >
          {added ? (
            <><Check className="h-4 w-4" /> Agregado</>
          ) : (
            <><ShoppingBag className="h-4 w-4" /> Agregar al carrito</>
          )}
        </button>

        {/* Detalle */}
        {(product.longDescription || product.stone || product.weightGrams) && (
          <div className="mt-12 border-t border-ink/10 pt-8">
            {product.longDescription && (
              <p className="text-sm leading-relaxed text-muted">{product.longDescription}</p>
            )}
            <dl className="mt-6 space-y-2 text-sm">
              {product.material && (
                <div className="flex gap-2"><dt className="text-muted">Material:</dt><dd className="text-ink">{product.material}</dd></div>
              )}
              {product.stone && (
                <div className="flex gap-2"><dt className="text-muted">Piedra:</dt><dd className="text-ink">{product.stone}</dd></div>
              )}
              {product.weightGrams && (
                <div className="flex gap-2"><dt className="text-muted">Peso:</dt><dd className="text-ink">{product.weightGrams} g</dd></div>
              )}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
