"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Minus, Plus, Trash2 } from "lucide-react";
import { ShopHeader } from "@/components/shop/header";
import { ShopFooter } from "@/components/shop/footer";
import {
  getCart,
  setQty,
  removeFromCart,
  cartSubtotalCents,
  type CartItem,
} from "@/lib/cart";
import { formatMXN, productImageUrl } from "@/lib/utils";

const FREE_SHIPPING_CENTS = 199900;

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);

  const refresh = () => setItems(getCart());

  useEffect(() => {
    refresh();
    window.addEventListener("turkana-cart", refresh);
    return () => window.removeEventListener("turkana-cart", refresh);
  }, []);

  const subtotal = cartSubtotalCents();
  const freeShipping = subtotal >= FREE_SHIPPING_CENTS;

  return (
    <div className="min-h-screen">
      <ShopHeader />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="mb-10 text-4xl text-ink">Tu bolsa</h1>

        {items.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-muted">Tu bolsa está vacía.</p>
            <Link
              href="/tienda"
              className="mt-6 inline-block rounded-full bg-ink px-8 py-3 text-sm uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark"
            >
              Ver la colección
            </Link>
          </div>
        ) : (
          <div className="grid gap-10 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              {items.map((it) => (
                <div key={it.variantId} className="flex gap-4 rounded-2xl border border-ink/10 bg-white p-4">
                  <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-lg bg-sand">
                    {it.image && (
                      <Image src={productImageUrl(it.image)} alt={it.name} fill sizes="80px" className="object-cover" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col">
                    <Link href={`/producto/${it.productSlug}`} className="text-ink hover:text-gold">
                      {it.name}
                    </Link>
                    <p className="text-xs text-muted">{it.sku}</p>
                    <div className="mt-auto flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setQty(it.variantId, it.qty - 1)} className="rounded-full border border-ink/15 p-1.5 hover:border-gold">
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-6 text-center text-sm">{it.qty}</span>
                        <button onClick={() => setQty(it.variantId, it.qty + 1)} className="rounded-full border border-ink/15 p-1.5 hover:border-gold">
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-ink">{formatMXN(it.priceCents * it.qty)}</span>
                        <button onClick={() => removeFromCart(it.variantId)} className="text-muted hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Resumen */}
            <div className="h-fit rounded-2xl border border-ink/10 bg-white p-6">
              <h2 className="mb-4 text-lg text-ink">Resumen</h2>
              <div className="flex justify-between text-sm text-muted">
                <span>Subtotal (IVA incluido)</span>
                <span className="text-ink">{formatMXN(subtotal)}</span>
              </div>
              <p className="mt-3 text-xs text-muted">
                {freeShipping
                  ? "✓ Tu compra califica para envío gratis"
                  : `Te faltan ${formatMXN(FREE_SHIPPING_CENTS - subtotal)} para envío gratis`}
              </p>
              <p className="mt-1 text-xs text-muted">El envío se calcula en el checkout.</p>
              <Link
                href="/checkout"
                className="mt-6 block w-full rounded-full bg-ink py-3 text-center text-sm uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark"
              >
                Finalizar compra
              </Link>
            </div>
          </div>
        )}
      </main>
      <ShopFooter />
    </div>
  );
}
