"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Trash2, Mail, Check } from "lucide-react";
import { createCoupon, deleteCoupon, toggleCoupon, sendCouponToMembers } from "@/app/admin/rewards/actions";
import { VariantSearch } from "@/components/pos/variant-search";
import { formatMXN, cn } from "@/lib/utils";

type Coupon = {
  id: string; code: string; type: "order" | "product";
  discount_kind: "percent" | "amount"; discount_value: number; active: boolean;
  product_id: string | null; products: { name: string } | { name: string }[] | null;
};
type Member = { id: string; full_name: string; email: string | null };
type Prod = { variantId: string; sku: string; name: string; priceCents: number };

function discountText(c: { discount_kind: string; discount_value: number }) {
  return c.discount_kind === "percent" ? `${c.discount_value}%` : formatMXN(c.discount_value);
}
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

export function RewardsManager({ coupons, members, products }: { coupons: Coupon[]; members: Member[]; products: Prod[] }) {
  const router = useRouter();
  const [type, setType] = useState<"order" | "product">("order");
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [productId, setProductId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ k: "ok" | "err"; t: string } | null>(null);
  const [sending, setSending] = useState<string | null>(null);

  const field = "w-full rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-gold";

  const create = async () => {
    setBusy(true); setMsg(null);
    const res = await createCoupon({ type, discountKind: kind, discountValue: Number(value), productId: productId || undefined, code: code || undefined });
    setBusy(false);
    if (!res.ok) { setMsg({ k: "err", t: res.error ?? "Error" }); return; }
    setValue(""); setProductId(""); setCode("");
    setMsg({ k: "ok", t: "Cupón creado" });
    router.refresh();
  };

  const send = async (id: string) => {
    setSending(id); setMsg(null);
    const res = await sendCouponToMembers(id);
    setSending(null);
    setMsg(res.ok ? { k: "ok", t: `Enviado a ${res.sent} miembro(s)${res.failed ? ` · ${res.failed} fallaron` : ""}` } : { k: "err", t: res.error ?? "Error" });
  };

  return (
    <div className="space-y-8">
      {/* Crear cupón */}
      <section className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg text-ink">Nuevo cupón</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Aplica a</label>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-cream p-1">
              <button type="button" onClick={() => setType("order")} className={cn("rounded-md py-2 text-sm", type === "order" ? "bg-white text-ink shadow-sm" : "text-muted")}>Total de compra</button>
              <button type="button" onClick={() => setType("product")} className={cn("rounded-md py-2 text-sm", type === "product" ? "bg-white text-ink shadow-sm" : "text-muted")}>Producto</button>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Tipo de descuento</label>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-cream p-1">
              <button type="button" onClick={() => setKind("percent")} className={cn("rounded-md py-2 text-sm", kind === "percent" ? "bg-white text-ink shadow-sm" : "text-muted")}>Porcentaje %</button>
              <button type="button" onClick={() => setKind("amount")} className={cn("rounded-md py-2 text-sm", kind === "amount" ? "bg-white text-ink shadow-sm" : "text-muted")}>Dinero $</button>
            </div>
          </div>
          {type === "product" && (
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Producto (busca por nombre o SKU)</label>
              <VariantSearch variants={products} value={productId} onChange={setProductId} placeholder="Ej. anillo 123456…" />
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted">{kind === "percent" ? "Porcentaje" : "Monto (pesos)"}</label>
            <input className={field} type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === "percent" ? "30" : "200"} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Código (opcional)</label>
            <input className={field} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Se genera automático si lo dejas vacío" />
          </div>
        </div>
        {msg && <p className={cn("mt-4 rounded-lg px-4 py-2.5 text-sm", msg.k === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>{msg.t}</p>}
        <button onClick={create} disabled={busy} className="mt-4 flex items-center gap-2 rounded-full bg-ink px-6 py-2.5 text-sm uppercase tracking-widest text-cream hover:bg-gold-dark disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Crear cupón
        </button>
      </section>

      {/* Lista de cupones */}
      <section className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
        <h2 className="border-b border-ink/10 px-6 py-4 text-lg text-ink">Cupones</h2>
        {coupons.length === 0 ? <p className="p-6 text-sm text-muted">Aún no hay cupones.</p> : (
          <div className="divide-y divide-ink/5">
            {coupons.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 px-6 py-4">
                <span className="font-mono text-sm tracking-wider text-ink">{c.code}</span>
                <span className="rounded-full bg-cream px-3 py-1 text-xs text-muted">{c.type === "order" ? "Total de compra" : one(c.products)?.name ?? "Producto"}</span>
                <span className="text-sm text-gold">{discountText(c)}</span>
                {!c.active && <span className="text-xs text-red-500">inactivo</span>}
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={() => send(c.id)} disabled={sending !== null} className="flex items-center gap-1.5 rounded-full border border-ink/15 px-4 py-2 text-xs text-ink hover:border-gold disabled:opacity-40">
                    {sending === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Enviar a miembros
                  </button>
                  <button onClick={async () => { await toggleCoupon(c.id, !c.active); router.refresh(); }} className="rounded-full border border-ink/15 px-3 py-2 text-xs text-muted hover:border-gold">{c.active ? "Ocultar" : "Activar"}</button>
                  <button onClick={async () => { if (confirm("¿Eliminar cupón?")) { await deleteCoupon(c.id); router.refresh(); } }} className="text-muted hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Miembros */}
      <section className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
        <h2 className="border-b border-ink/10 px-6 py-4 text-lg text-ink">Miembros registrados <span className="text-sm text-muted">({members.length})</span></h2>
        {members.length === 0 ? <p className="p-6 text-sm text-muted">Aún no hay miembros registrados.</p> : (
          <table className="w-full text-left text-sm">
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-ink/5 last:border-0">
                  <td className="px-6 py-3 text-ink">{m.full_name}</td>
                  <td className="px-6 py-3 text-muted">{m.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="flex items-center gap-2 border-t border-ink/10 px-6 py-3 text-xs text-muted">
          <Check className="h-3.5 w-3.5 text-gold" /> Al enviar un cupón, llega a todos los miembros de esta lista.
        </p>
      </section>
    </div>
  );
}
