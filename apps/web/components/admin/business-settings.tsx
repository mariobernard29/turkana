"use client";

import { useState } from "react";
import { Loader2, Check, Save } from "lucide-react";
import { updateBusinessSettings, type BusinessSettings } from "@/app/admin/ajustes/actions";
import { cn } from "@/lib/utils";

const toPesos = (cents: number) => (cents / 100).toString();
const toCents = (pesos: string) => Math.round(parseFloat(pesos || "0") * 100);

export function BusinessSettingsForm({ initial }: { initial: BusinessSettings }) {
  const [free, setFree] = useState(toPesos(initial.freeThresholdCents));
  const [standard, setStandard] = useState(toPesos(initial.standardCents));
  const [express, setExpress] = useState(toPesos(initial.expressCents));
  const [cashDrop, setCashDrop] = useState(toPesos(initial.cashDropCents));
  const [adminEmail, setAdminEmail] = useState(initial.adminEmail);
  const [lowStock, setLowStock] = useState(String(initial.lowStockThreshold));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ k: "ok" | "err"; t: string } | null>(null);

  const save = async () => {
    setBusy(true); setMsg(null);
    const res = await updateBusinessSettings({
      freeThresholdCents: toCents(free), standardCents: toCents(standard),
      expressCents: toCents(express), cashDropCents: toCents(cashDrop),
      adminEmail: adminEmail.trim(), lowStockThreshold: parseInt(lowStock, 10) || 5,
    });
    setBusy(false);
    setMsg(res.ok ? { k: "ok", t: "Parámetros guardados" } : { k: "err", t: res.error ?? "Error" });
  };

  const Field = ({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (v: string) => void }) => (
    <div>
      <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted">{label}</label>
      <div className="flex items-center rounded-lg border border-ink/15 bg-white px-3 focus-within:border-gold">
        <span className="text-sm text-muted">$</span>
        <input type="number" step="0.01" min="0" value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-transparent px-2 py-2.5 text-sm outline-none" />
      </div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );

  return (
    <section className="max-w-2xl rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
      <h2 className="text-lg text-ink">Parámetros del negocio</h2>
      <p className="mt-1 text-sm text-muted">Costos de envío y límite de efectivo en caja. Aplican de inmediato en la tienda en línea.</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Envío gratis desde" hint="Compras iguales o mayores no pagan envío" value={free} onChange={setFree} />
        <Field label="Envío estándar" hint="4 a 7 días" value={standard} onChange={setStandard} />
        <Field label="Envío express" hint="2 a 4 días" value={express} onChange={setExpress} />
        <Field label="Límite de efectivo en caja" hint="Aviso de resguardo al superarlo" value={cashDrop} onChange={setCashDrop} />
      </div>

      <div className="mt-8 border-t border-ink/10 pt-6">
        <h3 className="text-sm font-medium text-ink">Alertas por correo</h3>
        <p className="mt-1 text-sm text-muted">Correo que recibirá avisos de ventas en línea, cortes de caja e inventario bajo.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Correo de administración</label>
            <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@turkanajewerly.com"
              className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-gold" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Alerta de inventario bajo (piezas)</label>
            <input type="number" min="1" step="1" value={lowStock} onChange={(e) => setLowStock(e.target.value)}
              className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-gold" />
            <p className="mt-1 text-xs text-muted">Avisa cuando un producto llegue a esta cantidad o menos (tienda física o en línea).</p>
          </div>
        </div>
      </div>

      {msg && (
        <p className={cn("mt-4 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm", msg.k === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>
          {msg.k === "ok" && <Check className="h-4 w-4 shrink-0" />}{msg.t}
        </p>
      )}

      <button onClick={save} disabled={busy} className="mt-5 flex items-center gap-2 rounded-full bg-ink px-6 py-2.5 text-sm uppercase tracking-widest text-cream hover:bg-gold-dark disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar cambios
      </button>
    </section>
  );
}
