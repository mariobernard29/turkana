"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Gift, ShieldCheck, Truck, Headset, Plus, Minus } from "lucide-react";
import { getCart, addToCart, setQty, type CartItem } from "@/lib/cart";
import { formatMXN, cn } from "@/lib/utils";
import { startCheckout, type CheckoutInput } from "@/app/checkout/actions";
import { GIFT_BAG } from "@/lib/business";
import { MX_STATES } from "@/lib/mx-states";

const TAX_RATE = 0.16;

export type ShippingProps = { freeThresholdCents: number; standardCents: number; expressCents: number };

const REDEEM_CAP_CENTS = 100000; // tope $1,000 por compra

export function CheckoutForm({
  customer,
  shipping: shippingCfg,
}: {
  customer: { name: string; email: string; balanceCents: number } | null;
  shipping: ShippingProps;
}) {
  const FREE_SHIPPING_CENTS = shippingCfg.freeThresholdCents;
  const SHIPPING = { standard: shippingCfg.standardCents, express: shippingCfg.expressCents };
  const [items, setItems] = useState<CartItem[]>([]);
  const [shippingMethod, setShippingMethod] = useState<"standard" | "express">("standard");
  const [useRewards, setUseRewards] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rates, setRates] = useState<"idle" | "loading" | "ready">("idle");

  const [form, setForm] = useState({
    firstName: customer?.name?.split(" ")[0] ?? "",
    lastName: customer?.name?.split(" ").slice(1).join(" ") ?? "",
    email: customer?.email ?? "",
    phone: "",
    street: "", extNumber: "", intNumber: "", postalCode: "",
    neighborhood: "", city: "", state: "", references: "",
    lat: null as number | null, lng: null as number | null,
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => setItems(getCart()), []);

  // Campos mínimos para poder cotizar el envío.
  const addressReady = Boolean(form.street && form.extNumber && form.postalCode && form.city && form.state);
  // Si cambia la dirección después de cotizar, hay que recalcular.
  useEffect(() => { setRates("idle"); }, [form.street, form.extNumber, form.postalCode, form.city, form.state]);

  const calcularEnvio = () => {
    if (!addressReady) return;
    setRates("loading");
    setTimeout(() => setRates("ready"), 1200);
  };

  // Los precios ya incluyen IVA. "goods" es el importe de productos con IVA.
  const goods = items.reduce((s, i) => s + i.priceCents * i.qty, 0);
  const qualifiesFree = goods >= FREE_SHIPPING_CENTS;
  const shipping = qualifiesFree ? 0 : SHIPPING[shippingMethod];
  const ivaIncluded = goods - Math.round(goods / (1 + TAX_RATE));
  const maxRedeem = customer ? Math.min(customer.balanceCents, REDEEM_CAP_CENTS, goods) : 0;
  const redeem = useRewards ? maxRedeem : 0;
  const total = goods + shipping - redeem;

  const giftBagQty = items.find((i) => i.variantId === GIFT_BAG.variantId)?.qty ?? 0;
  const addGiftBag = () => {
    addToCart({ variantId: GIFT_BAG.variantId, productSlug: GIFT_BAG.productSlug, name: GIFT_BAG.name, sku: GIFT_BAG.sku, priceCents: GIFT_BAG.priceCents, image: null });
    setItems(getCart());
  };
  const setGiftBagQty = (qty: number) => {
    setQty(GIFT_BAG.variantId, Math.max(0, qty));
    setItems(getCart());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const payload: CheckoutInput = {
      items: items.map((i) => ({ variantId: i.variantId, qty: i.qty })),
      customer: {
        firstName: form.firstName, lastName: form.lastName,
        email: form.email, phone: form.phone,
      },
      address: {
        street: form.street, extNumber: form.extNumber, intNumber: form.intNumber,
        postalCode: form.postalCode, neighborhood: form.neighborhood,
        city: form.city, state: form.state, references: form.references,
        lat: form.lat, lng: form.lng,
      },
      shippingMethod,
      redeemCents: redeem,
    };
    const res = await startCheckout(payload);
    if (!res.ok || !res.url) {
      setError(res.error ?? "No se pudo iniciar el pago");
      setLoading(false);
      return;
    }
    window.location.href = res.url;
  };

  if (items.length === 0) {
    return (
      <div className="py-24 text-center">
        <p className="text-muted">Tu bolsa está vacía.</p>
        <Link href="/tienda" className="mt-6 inline-block rounded-full bg-ink px-8 py-3 text-sm uppercase tracking-widest text-cream hover:bg-gold-dark">
          Ver la colección
        </Link>
      </div>
    );
  }

  const inputCls = "w-full rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-gold";
  const label = "mb-1.5 block text-xs uppercase tracking-wider text-muted";

  return (
    <form onSubmit={handleSubmit} className="grid gap-10 lg:grid-cols-3">
      <div className="space-y-8 lg:col-span-2">
        {/* Datos */}
        <section className="rounded-2xl border border-ink/10 bg-white p-6">
          <h2 className="mb-4 text-lg text-ink">Tus datos</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className={label}>Nombre</label><input className={inputCls} required value={form.firstName} onChange={(e) => set({ firstName: e.target.value })} /></div>
            <div><label className={label}>Apellidos</label><input className={inputCls} required value={form.lastName} onChange={(e) => set({ lastName: e.target.value })} /></div>
            <div><label className={label}>Email</label><input type="email" className={inputCls} required value={form.email} onChange={(e) => set({ email: e.target.value })} /></div>
            <div><label className={label}>Teléfono</label><input className={inputCls} required value={form.phone} onChange={(e) => set({ phone: e.target.value })} /></div>
          </div>
        </section>

        {/* Dirección */}
        <section className="rounded-2xl border border-ink/10 bg-white p-6">
          <h2 className="mb-4 text-lg text-ink">Dirección de envío</h2>
          <div className="space-y-4">
            <div>
              <label className={label}>Calle</label>
              <input
                className={inputCls}
                placeholder="Nombre de la calle"
                value={form.street}
                onChange={(e) => set({ street: e.target.value })}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div><label className={label}>Núm. exterior</label><input className={inputCls} required value={form.extNumber} onChange={(e) => set({ extNumber: e.target.value })} /></div>
              <div><label className={label}>Núm. interior</label><input className={inputCls} value={form.intNumber} onChange={(e) => set({ intNumber: e.target.value })} /></div>
              <div><label className={label}>Código postal</label><input className={inputCls} required value={form.postalCode} onChange={(e) => set({ postalCode: e.target.value })} /></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div><label className={label}>Colonia</label><input className={inputCls} value={form.neighborhood} onChange={(e) => set({ neighborhood: e.target.value })} /></div>
              <div><label className={label}>Ciudad</label><input className={inputCls} value={form.city} onChange={(e) => set({ city: e.target.value })} /></div>
              <div>
                <label className={label}>Estado</label>
                <select className={inputCls} required value={form.state} onChange={(e) => set({ state: e.target.value })}>
                  <option value="">Selecciona…</option>
                  {MX_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div><label className={label}>Referencias</label><input className={inputCls} value={form.references} onChange={(e) => set({ references: e.target.value })} /></div>
          </div>
        </section>

        {/* Envío */}
        <section className="rounded-2xl border border-ink/10 bg-white p-6">
          <h2 className="mb-4 text-lg text-ink">Método de envío</h2>

          {rates !== "ready" ? (
            <div className="text-center">
              {rates === "loading" ? (
                <div className="flex flex-col items-center gap-3 py-6 text-muted">
                  <Loader2 className="h-6 w-6 animate-spin text-gold" />
                  <p className="text-sm">Calculando tarifas de envío…</p>
                </div>
              ) : (
                <>
                  <p className="mb-4 text-sm text-muted">Captura tu dirección y calcula el envío para ver las opciones.</p>
                  <button
                    type="button"
                    onClick={calcularEnvio}
                    disabled={!addressReady}
                    className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-2.5 text-sm uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark disabled:opacity-40"
                  >
                    <Truck className="h-4 w-4" /> Calcular envío
                  </button>
                  {!addressReady && <p className="mt-2 text-xs text-muted">Completa calle, número, CP, ciudad y estado.</p>}
                </>
              )}
            </div>
          ) : qualifiesFree ? (
            <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
              ✓ Tu compra califica para <strong>envío gratis</strong>.
            </p>
          ) : (
            <div className="space-y-3">
              {(["standard", "express"] as const).map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setShippingMethod(m)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors",
                    shippingMethod === m ? "border-ink bg-cream" : "border-ink/15 hover:border-gold",
                  )}
                >
                  <span>
                    <span className="text-ink">{m === "standard" ? "Estándar" : "Express"}</span>
                    <span className="ml-2 text-muted">{m === "standard" ? "4 a 7 días" : "2 a 4 días"}</span>
                  </span>
                  <span className="text-ink">{formatMXN(SHIPPING[m])}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Garantías / confianza */}
        <section className="grid gap-5 rounded-2xl border border-ink/10 bg-white p-6 sm:grid-cols-3">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-gold" strokeWidth={1.5} />
            <div><p className="text-sm text-ink">Garantía de 30 días</p><p className="text-xs text-muted">Cambios y garantía en tus piezas</p></div>
          </div>
          <div className="flex items-start gap-3">
            <Truck className="mt-0.5 h-5 w-5 shrink-0 text-gold" strokeWidth={1.5} />
            <div><p className="text-sm text-ink">Envíos rápidos y seguros</p><p className="text-xs text-muted">Empaque protegido y rastreable</p></div>
          </div>
          <div className="flex items-start gap-3">
            <Headset className="mt-0.5 h-5 w-5 shrink-0 text-gold" strokeWidth={1.5} />
            <div>
              <p className="text-sm text-ink">Atención personalizada</p>
              <a href="https://wa.me/526682410761" target="_blank" rel="noopener noreferrer" className="text-xs text-gold hover:underline">WhatsApp 668 241 0761</a>
            </div>
          </div>
        </section>
      </div>

      {/* Resumen */}
      <div className="h-fit rounded-2xl border border-ink/10 bg-white p-6">
        <h2 className="mb-4 text-lg text-ink">Tu pedido</h2>
        <div className="space-y-3">
          {items.map((it) => (
            <div key={it.variantId} className="flex justify-between text-sm">
              <span className="text-muted">{it.name} × {it.qty}</span>
              <span className="text-ink">{formatMXN(it.priceCents * it.qty)}</span>
            </div>
          ))}
        </div>

        {/* Bolsa de regalo */}
        <div className={cn(
          "mt-4 rounded-xl border px-4 py-3 text-sm transition-colors",
          giftBagQty > 0 ? "border-gold bg-gold/10" : "border-ink/15",
        )}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-ink"><Gift className="h-4 w-4 text-gold" strokeWidth={1.5} /> Bolsa de regalo</span>
            {giftBagQty === 0 ? (
              <button
                type="button"
                onClick={addGiftBag}
                className="rounded-full border border-ink/15 px-3 py-1 text-xs text-ink transition-colors hover:border-gold hover:text-gold"
              >
                + {formatMXN(GIFT_BAG.priceCents)}
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setGiftBagQty(giftBagQty - 1)} aria-label="Quitar una bolsa" className="flex h-7 w-7 items-center justify-center rounded-full border border-ink/15 text-ink transition-colors hover:border-gold hover:text-gold">
                    <Minus className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                  <span className="w-5 text-center tabular-nums text-ink">{giftBagQty}</span>
                  <button type="button" onClick={() => setGiftBagQty(giftBagQty + 1)} aria-label="Agregar una bolsa" className="flex h-7 w-7 items-center justify-center rounded-full border border-ink/15 text-ink transition-colors hover:border-gold hover:text-gold">
                    <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                </div>
                <span className="w-16 text-right tabular-nums text-gold">{formatMXN(GIFT_BAG.priceCents * giftBagQty)}</span>
              </div>
            )}
          </div>
          <p className="mt-1.5 text-xs text-muted">¿Varios regalos? Agrega una bolsa por cada uno (+{formatMXN(GIFT_BAG.priceCents)} c/u).</p>
        </div>

        {/* Turkana Rewards */}
        {customer ? (
          maxRedeem > 0 ? (
            <button
              type="button"
              onClick={() => setUseRewards((v) => !v)}
              className={cn(
                "mt-4 flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                useRewards ? "border-gold bg-gold/10" : "border-ink/15",
              )}
            >
              <span className="text-ink">Usar saldo Rewards <span className="text-muted">({formatMXN(customer.balanceCents)} disponible)</span></span>
              <span className={useRewards ? "text-gold" : "text-muted"}>{useRewards ? `−${formatMXN(maxRedeem)}` : "Aplicar"}</span>
            </button>
          ) : (
            <p className="mt-4 text-xs text-muted">Tienes {formatMXN(customer.balanceCents)} en Rewards (se aplica desde $1 en productos).</p>
          )
        ) : (
          <a href="/rewards/acceso" className="mt-4 block rounded-xl border border-dashed border-gold/40 px-4 py-3 text-center text-sm text-gold hover:bg-gold/5">
            ¿Tienes Turkana Rewards? Inicia sesión para usar tu saldo
          </a>
        )}

        <div className="mt-4 space-y-2 border-t border-ink/10 pt-4 text-sm">
          <div className="flex justify-between text-muted"><span>Productos</span><span>{formatMXN(goods)}</span></div>
          <div className="flex justify-between text-muted"><span>Envío</span><span>{shipping === 0 ? "Gratis" : formatMXN(shipping)}</span></div>
          {redeem > 0 && <div className="flex justify-between text-gold"><span>Rewards</span><span>−{formatMXN(redeem)}</span></div>}
          <div className="flex items-baseline justify-between pt-2 text-base text-ink"><span>Total</span><span className="text-xl font-semibold tabular-nums">{formatMXN(total)}</span></div>
          <p className="text-right text-xs text-muted">IVA incluido: {formatMXN(ivaIncluded)}</p>
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={loading || rates !== "ready"}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3.5 text-sm uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Pagar {formatMXN(total)}
        </button>
        {rates !== "ready" && <p className="mt-2 text-center text-xs text-amber-700">Calcula el envío para continuar.</p>}
        <p className="mt-3 text-center text-xs text-muted">Pago seguro con Stripe · Tarjeta u OXXO</p>
      </div>
    </form>
  );
}
