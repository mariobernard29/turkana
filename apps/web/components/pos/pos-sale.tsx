"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search, Minus, Plus, Trash2, Loader2, AlertTriangle, Calculator, Gift, Menu, X } from "lucide-react";
import { chargeSale, type SaleResult } from "@/app/pos/actions";
import { getCajaInfo } from "@/app/pos/caja-actions";
import { lookupRewardsCustomer } from "@/app/pos/rewards-actions";
import { formatMXN, productImageUrl, cn } from "@/lib/utils";
import { POS_CARD_BUTTONS, type PaymentMethod } from "@/lib/payments";
import { PosClose } from "@/components/pos/pos-close";
import { TicketModal } from "@/components/pos/ticket-modal";
import { AccountsPanel } from "@/components/pos/accounts-panel";
import { ReturnsModal } from "@/components/pos/returns-modal";
import { CajaPanel } from "@/components/pos/caja-panel";
import { PaymentCalculator } from "@/components/pos/payment-calculator";
import { useOnline } from "@/components/pos/use-online";
import { cacheProducts, getCachedProducts, enqueueSale, type CachedProduct } from "@/lib/offline/db";

export type PosSize = { variantId: string; talla: string; priceCents: number; stock: number; lowThreshold: number };
export type PosProduct = {
  productId: string;
  name: string;
  sku: string;
  image: string | null;
  categoryId: string | null;
  sizes: PosSize[];
};
// Tipo plano para selectores de apartados/devoluciones.
export type PosVariant = { variantId: string; sku: string; name: string; priceCents: number };

type Line = { variantId: string; name: string; sku: string; priceCents: number; qty: number; stock: number };

const TAX_RATE = 0.16;
type Split = { method: PaymentMethod; amountCents: number };

export function PosSale({
  session,
  products,
  categories,
}: {
  session: { id: string };
  products: PosProduct[];
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const online = useOnline();
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [attached, setAttached] = useState<{ id: string; name: string; balanceCents: number } | null>(null);
  const [attachEmail, setAttachEmail] = useState("");
  const [attachErr, setAttachErr] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [discount, setDiscount] = useState<{ type: "percent" | "amount"; value: number; by: string; concept: string } | null>(null);
  const [activeCategory, setActiveCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<SaleResult["ticket"] | null>(null);
  const [showClose, setShowClose] = useState(false);
  const [serviceLines, setServiceLines] = useState<{ id: string; concept: string; description: string; amountCents: number }[]>([]);
  const [showService, setShowService] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);
  const [showReturns, setShowReturns] = useState(false);
  const [showCaja, setShowCaja] = useState(false);
  const [caja, setCaja] = useState<{ expectedCash: number; thresholdCents: number } | null>(null);

  const refreshCaja = useCallback(async () => {
    try { const i = await getCajaInfo(session.id); setCaja({ expectedCash: i.expectedCash, thresholdCents: i.thresholdCents }); } catch { /* offline */ }
  }, [session.id]);
  useEffect(() => { refreshCaja(); }, [refreshCaja]);

  const overCashLimit = caja && caja.thresholdCents > 0 && caja.expectedCash >= caja.thresholdCents;

  // Catálogo agrupado por producto: del servidor (online) o caché local (offline).
  const [localProducts, setLocalProducts] = useState<PosProduct[]>(products);
  const [localSold, setLocalSold] = useState<Record<string, number>>({});
  const [pickProduct, setPickProduct] = useState<PosProduct | null>(null);

  useEffect(() => {
    if (products.length) { setLocalProducts(products); cacheProducts(products as CachedProduct[]); }
  }, [products]);
  useEffect(() => {
    if (!products.length) getCachedProducts().then((c) => { if (c.length) setLocalProducts(c as PosProduct[]); });
  }, [products.length]);
  // Al volver la conexión, el servidor manda: limpia el stock optimista.
  useEffect(() => { if (online) setLocalSold({}); }, [online]);

  const sizeStock = (s: PosSize) => s.stock - (localSold[s.variantId] ?? 0);
  const productStock = (p: PosProduct) => p.sizes.reduce((n, s) => n + Math.max(0, sizeStock(s)), 0);
  const productMinPrice = (p: PosProduct) => Math.min(...p.sizes.map((s) => s.priceCents));
  const productMultiPrice = (p: PosProduct) => new Set(p.sizes.map((s) => s.priceCents)).size > 1;

  // Lista plana de variantes para apartados/devoluciones.
  const flatVariants: PosVariant[] = useMemo(
    () => localProducts.flatMap((p) => p.sizes.map((s) => ({
      variantId: s.variantId, sku: p.sku,
      name: p.name + (s.talla ? ` · Talla ${s.talla}` : ""), priceCents: s.priceCents,
    }))),
    [localProducts],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let base = localProducts.filter((p) => productStock(p) > 0);
    if (activeCategory) base = base.filter((p) => p.categoryId === activeCategory);
    if (q) base = base.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localProducts, query, localSold, activeCategory]);

  // Precios con IVA incluido. goods = bruto; total = con descuento aplicado.
  const goods =
    lines.reduce((s, l) => s + l.priceCents * l.qty, 0) +
    serviceLines.reduce((s, sv) => s + sv.amountCents, 0);
  const discountCents = discount
    ? Math.min(goods, discount.type === "percent" ? Math.round(goods * discount.value / 100) : Math.round(discount.value * 100))
    : 0;
  const total = goods - discountCents;
  const base = Math.round(total / (1 + TAX_RATE));
  const tax = total - base;
  const cobroDisabled = busy || (lines.length === 0 && serviceLines.length === 0);

  const addSize = (p: PosProduct, s: PosSize) => {
    const avail = sizeStock(s);
    if (avail <= 0) return;
    const label = p.name + (s.talla ? ` · Talla ${s.talla}` : "");
    setLines((ls) => {
      const ex = ls.find((l) => l.variantId === s.variantId);
      if (ex) {
        if (ex.qty >= avail) return ls;
        return ls.map((l) => (l.variantId === s.variantId ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...ls, { variantId: s.variantId, name: label, sku: p.sku, priceCents: s.priceCents, qty: 1, stock: avail }];
    });
  };
  const tapProduct = (p: PosProduct) => {
    const inStock = p.sizes.filter((s) => sizeStock(s) > 0);
    if (p.sizes.length === 1 && p.sizes[0].talla === "") return addSize(p, p.sizes[0]);
    if (inStock.length === 1 && inStock[0].talla === "") return addSize(p, inStock[0]);
    setPickProduct(p);
  };
  const setQty = (id: string, qty: number) =>
    setLines((ls) => ls.flatMap((l) => (l.variantId === id ? (qty <= 0 ? [] : [{ ...l, qty: Math.min(qty, l.stock) }]) : [l])));

  const finishTicket = (t: NonNullable<SaleResult["ticket"]>) => {
    setTicket(t);
    setLines([]);
    setServiceLines([]);
    setAttached(null);
    setAttachEmail("");
    setAttachErr(null);
    setDiscount(null);
  };

  const attach = async () => {
    setAttachErr(null);
    setAttaching(true);
    const res = await lookupRewardsCustomer(attachEmail);
    setAttaching(false);
    if (!res.found) { setAttachErr(res.error); return; }
    setAttached({ id: res.customerId, name: res.name, balanceCents: res.balanceCents });
    setAttachEmail("");
  };

  const charge = async (payments: Split[]) => {
    setShowCalc(false);
    setError(null);
    setBusy(true);
    const items = lines.map((l) => ({ variantId: l.variantId, qty: l.qty }));
    const services = serviceLines.map((sv) => ({ concept: sv.concept, description: sv.description || undefined, amountCents: sv.amountCents }));
    const discountPayload = discount ? { cents: discountCents, authorizedBy: discount.by, concept: discount.concept } : undefined;
    const localTicket = {
      orderNumber: "OFFLINE · pendiente de sincronizar",
      items: [
        ...lines.map((l) => ({ name: l.name, sku: l.sku, quantity: l.qty, total_cents: l.priceCents * l.qty })),
        ...serviceLines.map((sv) => ({ name: sv.concept, sku: "SERVICIO", quantity: 1, total_cents: sv.amountCents })),
      ],
      subtotal: base, tax, total, discountCents, payments: payments.map((p) => ({ method: p.method, amount_cents: p.amountCents })),
    };

    const saveOffline = async () => {
      await enqueueSale({
        clientOpId: crypto.randomUUID(), sessionId: session.id, items, services,
        payments, customerId: attached?.id, discount: discountPayload, createdAtIso: new Date().toISOString(),
      });
      setLocalSold((prev) => {
        const next = { ...prev };
        for (const l of lines) next[l.variantId] = (next[l.variantId] ?? 0) + l.qty;
        return next;
      });
      finishTicket(localTicket);
      setBusy(false);
    };

    if (!online) { await saveOffline(); return; }

    try {
      const res = await chargeSale({ sessionId: session.id, items, services, payments, customerId: attached?.id, discount: discountPayload });
      if (!res.ok) { setError(res.error ?? "Error al cobrar"); setBusy(false); return; }
      finishTicket(res.ticket ?? localTicket);
      setBusy(false);
      router.refresh();
      refreshCaja();
    } catch {
      // Se cayó la conexión durante el cobro → guardar offline.
      await saveOffline();
    }
  };

  return (
    <div className="grid h-full lg:grid-cols-[1fr_380px]">
      {/* Grid de productos */}
      <div className="flex min-h-0 flex-col p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar producto o SKU…"
              className="w-full rounded-xl border border-ink/15 bg-white py-3 pl-10 pr-3 text-sm shadow-sm outline-none focus:border-gold"
            />
          </div>
          <div className="relative">
            <button
              onClick={() => setShowMenu((v) => !v)}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm shadow-sm transition-colors",
                overCashLimit ? "border-amber-400 bg-amber-50 text-amber-700" : "border-ink/15 bg-white text-ink hover:border-gold",
              )}
            >
              <Menu className="h-4 w-4" /> Menú
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-ink/10 bg-white shadow-lg">
                  {[
                    { label: discount ? "Descuento (aplicado)" : "Descuento", fn: () => setShowDiscount(true) },
                    { label: "Servicio", fn: () => setShowService(true) },
                    { label: "Apartados y crédito", fn: () => setShowAccounts(true) },
                    { label: "Cambios", fn: () => setShowReturns(true) },
                    { label: overCashLimit ? "Caja · resguardo ⚠" : "Caja · resguardo / precorte", fn: () => setShowCaja(true) },
                    { label: "Corte de caja", fn: () => setShowClose(true) },
                  ].map((it) => (
                    <button
                      key={it.label}
                      onClick={() => { setShowMenu(false); it.fn(); }}
                      className="block w-full px-4 py-3 text-left text-sm text-ink transition-colors hover:bg-cream"
                    >
                      {it.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Categorías */}
        {categories.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              onClick={() => setActiveCategory("")}
              className={cn("rounded-full border px-4 py-2 text-sm transition-colors", !activeCategory ? "border-ink bg-ink text-cream" : "border-ink/15 bg-white text-ink hover:border-gold")}
            >
              Todos
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCategory(c.id)}
                className={cn("rounded-full border px-4 py-2 text-sm transition-colors", activeCategory === c.id ? "border-ink bg-ink text-cream" : "border-ink/15 bg-white text-ink hover:border-gold")}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {overCashLimit && (
          <button
            onClick={() => setShowCaja(true)}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-700"
          >
            <AlertTriangle className="h-4 w-4" /> Efectivo en caja {formatMXN(caja!.expectedCash)} supera el límite — hacer resguardo
          </button>
        )}

        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.map((p) => (
            <button
              key={p.productId}
              onClick={() => tapProduct(p)}
              className="flex flex-col overflow-hidden rounded-xl border border-ink/10 bg-white text-left shadow-sm transition-shadow hover:shadow-md active:opacity-90"
            >
              <div className="relative aspect-square w-full bg-sand">
                {p.image ? (
                  <Image src={productImageUrl(p.image)} alt={p.name} fill sizes="(max-width:640px) 33vw, 160px" className="object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <span className="font-serif text-[11px] tracking-[0.25em] text-muted">TURKANA</span>
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col px-2 py-1.5">
                <span className="line-clamp-1 text-xs leading-tight text-ink">{p.name}</span>
                <span className="mt-1 text-sm font-medium tabular-nums text-ink">
                  {productMultiPrice(p) ? "Desde " : ""}{formatMXN(productMinPrice(p))}
                </span>
                <span className="text-[10px] text-muted">
                  {p.sizes.length > 1 ? `${p.sizes.length} tallas · ` : ""}Stock: {productStock(p)}
                </span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full py-16 text-center text-muted">Sin productos con stock en tienda</p>
          )}
        </div>
      </div>

      {/* Ticket */}
      <div className="flex min-h-0 flex-col border-l border-ink/10 bg-white shadow-[-6px_0_18px_rgba(0,0,0,0.05)]">
        <div className="border-b border-ink/10 px-5 py-4">
          <h2 className="text-lg text-ink">Ticket</h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {lines.length === 0 && serviceLines.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">Toca un producto o agrega un servicio</p>
          ) : (
            <div className="space-y-3">
              {lines.map((l) => (
                <div key={l.variantId} className="flex items-center gap-2">
                  <div className="flex-1">
                    <p className="text-sm text-ink">{l.name}</p>
                    <p className="text-xs text-muted">{formatMXN(l.priceCents)} · {l.sku}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setQty(l.variantId, l.qty - 1)} className="rounded-full border border-ink/15 p-1.5"><Minus className="h-3 w-3" /></button>
                    <span className="w-5 text-center text-sm">{l.qty}</span>
                    <button onClick={() => setQty(l.variantId, l.qty + 1)} disabled={l.qty >= l.stock} className="rounded-full border border-ink/15 p-1.5 disabled:opacity-30"><Plus className="h-3 w-3" /></button>
                  </div>
                  <button onClick={() => setQty(l.variantId, 0)} className="text-muted hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              {serviceLines.map((sv) => (
                <div key={sv.id} className="flex items-center gap-2">
                  <div className="flex-1">
                    <p className="text-sm text-ink">{sv.concept}</p>
                    <p className="text-xs text-gold">Servicio</p>
                  </div>
                  <span className="text-sm text-ink">{formatMXN(sv.amountCents)}</span>
                  <button onClick={() => setServiceLines((s) => s.filter((x) => x.id !== sv.id))} className="text-muted hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cobro */}
        <div className="border-t border-ink/10 px-5 py-4">
          <div className="space-y-1 text-sm">
            {discountCents > 0 && (
              <>
                <div className="flex justify-between text-muted"><span>Subtotal</span><span className="tabular-nums">{formatMXN(goods)}</span></div>
                <div className="flex justify-between text-gold">
                  <span>Descuento{discount?.concept ? ` · ${discount.concept}` : ""}</span>
                  <span className="tabular-nums">−{formatMXN(discountCents)}</span>
                </div>
              </>
            )}
            <div className="flex items-baseline justify-between pt-1 text-ink"><span className="text-lg">Total</span><span className="text-3xl font-semibold tabular-nums">{formatMXN(total)}</span></div>
            <p className="text-right text-xs text-muted">IVA incluido (16%): {formatMXN(tax)}</p>
          </div>

          {/* Cliente Turkana Rewards */}
          {attached ? (
            <div className="mt-3 flex items-center justify-between rounded-xl bg-gold/10 px-3 py-2.5 text-sm">
              <div>
                <span className="text-ink">{attached.name}</span>
                <span className="ml-2 text-gold">Saldo {formatMXN(attached.balanceCents)}</span>
              </div>
              <button onClick={() => setAttached(null)} className="text-muted hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <input
                type="email" placeholder="Correo cliente Rewards"
                value={attachEmail} onChange={(e) => setAttachEmail(e.target.value)}
                className="w-full rounded-xl border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-gold"
              />
              <button onClick={attach} disabled={attaching || !attachEmail} className="flex items-center gap-1 whitespace-nowrap rounded-xl border border-ink/15 px-3 text-sm text-ink hover:border-gold disabled:opacity-40">
                {attaching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />} Rewards
              </button>
            </div>
          )}
          {attachErr && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{attachErr}</p>}

          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="mt-4 space-y-2">
            <button
              onClick={() => charge([{ method: "cash", amountCents: total }])}
              disabled={cobroDisabled}
              className="flex w-full flex-col items-center rounded-2xl bg-ink py-3 text-cream transition-colors hover:bg-gold-dark disabled:opacity-40"
            >
              <span className="text-[11px] uppercase tracking-widest">Efectivo</span>
              <span className="text-lg font-semibold tabular-nums">{formatMXN(total)}</span>
            </button>
            <div className="grid grid-cols-3 gap-2">
              {POS_CARD_BUTTONS.map((b) => (
                <button
                  key={b.key}
                  onClick={() => charge([{ method: b.key, amountCents: total }])}
                  disabled={cobroDisabled}
                  className="flex flex-col items-center rounded-2xl bg-ink py-3 text-cream transition-colors hover:bg-gold-dark disabled:opacity-40"
                >
                  <span className="text-[11px] uppercase tracking-widest">{b.label}</span>
                  <span className="text-sm font-semibold tabular-nums">{formatMXN(total)}</span>
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => setShowCalc(true)}
            disabled={cobroDisabled}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-ink/15 py-3 text-sm text-ink transition-colors hover:border-gold disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />} Pago dividido / calculadora
          </button>
        </div>
      </div>

      {ticket && <TicketModal ticket={ticket} onClose={() => setTicket(null)} />}
      {showClose && <PosClose sessionId={session.id} onClose={() => setShowClose(false)} />}
      {showService && (
        <ServiceModal
          onAdd={(s) => { setServiceLines((ls) => [...ls, { id: crypto.randomUUID(), ...s }]); setShowService(false); }}
          onClose={() => setShowService(false)}
        />
      )}
      {showAccounts && <AccountsPanel sessionId={session.id} variants={flatVariants} onClose={() => setShowAccounts(false)} />}
      {showReturns && <ReturnsModal sessionId={session.id} variants={flatVariants} onClose={() => setShowReturns(false)} />}
      {showCaja && <CajaPanel sessionId={session.id} onClose={() => { setShowCaja(false); refreshCaja(); }} />}
      {pickProduct && (
        <SizePicker
          product={pickProduct}
          sizeStock={sizeStock}
          onPick={(s) => { addSize(pickProduct, s); setPickProduct(null); }}
          onClose={() => setPickProduct(null)}
        />
      )}
      {showDiscount && (
        <DiscountModal
          current={discount}
          onApply={(d) => { setDiscount(d); setShowDiscount(false); }}
          onClear={() => { setDiscount(null); setShowDiscount(false); }}
          onClose={() => setShowDiscount(false)}
        />
      )}
      {showCalc && (
        <PaymentCalculator
          total={total}
          rewardsMax={attached && online ? Math.min(attached.balanceCents, 100000, total) : 0}
          onClose={() => setShowCalc(false)}
          onConfirm={(payments) => charge(payments)}
        />
      )}
    </div>
  );
}

function DiscountModal({
  current,
  onApply,
  onClear,
  onClose,
}: {
  current: { type: "percent" | "amount"; value: number; by: string; concept: string } | null;
  onApply: (d: { type: "percent" | "amount"; value: number; by: string; concept: string }) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<"percent" | "amount">(current?.type ?? "percent");
  const [value, setValue] = useState(current?.value ? String(current.value) : "");
  const [by, setBy] = useState(current?.by ?? "");
  const [concept, setConcept] = useState(current?.concept ?? "");
  const [err, setErr] = useState<string | null>(null);

  const field = "w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-sm outline-none focus:border-gold";

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const v = Number(value);
    if (!v || v <= 0) { setErr("Ingresa un valor válido"); return; }
    if (type === "percent" && v > 100) { setErr("El porcentaje no puede ser mayor a 100"); return; }
    if (!by.trim()) { setErr("Indica quién autoriza el descuento"); return; }
    onApply({ type, value: v, by: by.trim(), concept: concept.trim() });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <form onSubmit={apply} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-6">
        <h3 className="mb-4 text-lg text-ink">Aplicar descuento</h3>
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-cream p-1">
          <button type="button" onClick={() => setType("percent")} className={cn("rounded-md py-2 text-sm transition-colors", type === "percent" ? "bg-white text-ink shadow-sm" : "text-muted")}>Porcentaje %</button>
          <button type="button" onClick={() => setType("amount")} className={cn("rounded-md py-2 text-sm transition-colors", type === "amount" ? "bg-white text-ink shadow-sm" : "text-muted")}>Dinero $</button>
        </div>
        <div className="space-y-3">
          <input className={field} type="number" step="0.01" inputMode="decimal" placeholder={type === "percent" ? "Porcentaje (ej. 10)" : "Monto en pesos (ej. 200)"} value={value} onChange={(e) => setValue(e.target.value)} required />
          <input className={field} placeholder="Autorizado por (nombre)" value={by} onChange={(e) => setBy(e.target.value)} required />
          <input className={field} placeholder="Concepto (ej. cliente frecuente)" value={concept} onChange={(e) => setConcept(e.target.value)} />
        </div>
        {err && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        <div className="mt-5 flex gap-2">
          {current && <button type="button" onClick={onClear} className="rounded-full border border-red-300 px-4 py-3 text-sm text-red-600 hover:bg-red-50">Quitar</button>}
          <button type="button" onClick={onClose} className="flex-1 rounded-full border border-ink/15 py-3 text-sm text-ink">Cancelar</button>
          <button type="submit" className="flex-1 rounded-full bg-ink py-3 text-sm uppercase tracking-widest text-cream hover:bg-gold-dark">Aplicar</button>
        </div>
      </form>
    </div>
  );
}

function SizePicker({
  product,
  sizeStock,
  onPick,
  onClose,
}: {
  product: PosProduct;
  sizeStock: (s: PosSize) => number;
  onPick: (s: PosSize) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-lg text-ink">{product.name}</h3>
          <button onClick={onClose} className="text-muted hover:text-ink"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-4 text-xs text-muted">Selecciona la talla</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {product.sizes.map((s) => {
            const stock = sizeStock(s);
            const out = stock <= 0;
            const low = !out && stock <= s.lowThreshold;
            return (
              <button
                key={s.variantId}
                disabled={out}
                onClick={() => onPick(s)}
                className={cn(
                  "flex flex-col items-center rounded-xl border py-3 transition-colors",
                  out ? "cursor-not-allowed border-ink/10 bg-cream text-muted" : low ? "border-amber-300 bg-amber-50 hover:border-amber-400" : "border-ink/15 bg-white hover:border-gold",
                )}
              >
                <span className="text-base text-ink">{s.talla || "Único"}</span>
                <span className={cn("text-[10px]", out ? "text-red-500" : low ? "text-amber-700" : "text-muted")}>
                  {out ? "Agotada" : low ? `Quedan ${stock}` : `${stock} disp.`}
                </span>
                <span className="mt-0.5 text-[11px] tabular-nums text-muted">{formatMXN(s.priceCents)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ServiceModal({
  onAdd,
  onClose,
}: {
  onAdd: (s: { concept: string; description: string; amountCents: number }) => void;
  onClose: () => void;
}) {
  const [concept, setConcept] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const field = "w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-sm outline-none focus:border-gold";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const cents = Math.round((Number(amount) || 0) * 100);
    if (!concept.trim() || cents <= 0) return;
    onAdd({ concept: concept.trim(), description: description.trim(), amountCents: cents });
  };

  const SERVICES = ["Limpieza", "Reparación", "Ajuste de anillo", "Mantenimiento de reloj"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-6">
        <h3 className="mb-4 text-lg text-ink">Agregar servicio</h3>
        <div className="mb-3 flex flex-wrap gap-2">
          {SERVICES.map((s) => (
            <button type="button" key={s} onClick={() => setConcept(s)} className="rounded-full border border-ink/15 px-3 py-1.5 text-xs text-ink hover:border-gold">
              {s}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          <input className={field} placeholder="Concepto" value={concept} onChange={(e) => setConcept(e.target.value)} required />
          <input className={field} placeholder="Descripción (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <input className={field} type="number" step="0.01" inputMode="decimal" placeholder="Importe" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-full border border-ink/15 py-3 text-sm text-ink">Cancelar</button>
          <button type="submit" className="flex-1 rounded-full bg-ink py-3 text-sm uppercase tracking-widest text-cream hover:bg-gold-dark">Agregar</button>
        </div>
      </form>
    </div>
  );
}
