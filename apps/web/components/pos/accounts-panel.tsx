"use client";

import { useEffect, useState, useCallback } from "react";
import { X, Loader2, Plus } from "lucide-react";
import {
  getAccountsData, createLayaway, addLayawayPayment, convertLayaway,
  createCreditAccount, addCreditCharge, addCreditPayment, type AccountsData,
} from "@/app/pos/account-actions";
import type { PosVariant } from "@/components/pos/pos-sale";
import { VariantSearch } from "@/components/pos/variant-search";
import { formatMXN, cn } from "@/lib/utils";

type Method = "cash" | "card" | "transfer";

export function AccountsPanel({
  sessionId,
  variants = [],
  onClose,
}: {
  sessionId: string;
  variants?: PosVariant[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"layaways" | "credits">("layaways");
  const [data, setData] = useState<AccountsData | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ k: "ok" | "err"; t: string } | null>(null);

  const reload = useCallback(async () => {
    setData(await getAccountsData());
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    setBusy(true); setMsg(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { setMsg({ k: "err", t: res.error ?? "Error" }); return false; }
    setMsg({ k: "ok", t: okMsg });
    await reload();
    return true;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
          <div className="flex gap-1 rounded-lg bg-cream p-1">
            <Tab active={tab === "layaways"} onClick={() => setTab("layaways")}>Apartados</Tab>
            <Tab active={tab === "credits"} onClick={() => setTab("credits")}>Crédito</Tab>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink"><X className="h-5 w-5" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {msg && (
            <p className={cn("mb-4 rounded-lg px-4 py-2.5 text-sm", msg.k === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>{msg.t}</p>
          )}
          {!data ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
          ) : tab === "layaways" ? (
            <Layaways data={data} variants={variants} busy={busy} sessionId={sessionId} run={run} />
          ) : (
            <Credits data={data} busy={busy} sessionId={sessionId} run={run} />
          )}
        </div>
      </div>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn("rounded-md px-4 py-1.5 text-sm transition-colors", active ? "bg-white text-ink shadow-sm" : "text-muted")}>
      {children}
    </button>
  );
}

const field = "w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold";

// ── Apartados ────────────────────────────────────────────────────────────────
function Layaways({
  data, variants, busy, sessionId, run,
}: {
  data: AccountsData; variants: PosVariant[]; busy: boolean; sessionId: string;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, m: string) => Promise<boolean>;
}) {
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ name: "", email: "", phone: "", variantId: "", total: "", anticipo: "", method: "cash" as Method, dueDate: "" });
  const [abono, setAbono] = useState<{ id: string; amount: string; method: Method } | null>(null);

  return (
    <div>
      <button onClick={() => setShow((s) => !s)} className="mb-4 flex items-center gap-2 text-sm text-gold hover:text-gold-dark">
        <Plus className="h-4 w-4" /> Nuevo apartado
      </button>

      {show && (
        <div className="mb-6 space-y-3 rounded-xl border border-ink/10 p-4">
          <div className="grid grid-cols-2 gap-3">
            <input className={field} placeholder="Cliente" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <input className={field} placeholder="Teléfono" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            <input className={field} placeholder="Email (opcional)" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <VariantSearch variants={variants} value={f.variantId} onChange={(id) => setF({ ...f, variantId: id })} placeholder="Pieza por nombre o SKU (opcional)" />
            <input className={field} type="number" step="0.01" placeholder="Total" value={f.total} onChange={(e) => setF({ ...f, total: e.target.value })} />
            <input className={field} type="number" step="0.01" placeholder="Anticipo" value={f.anticipo} onChange={(e) => setF({ ...f, anticipo: e.target.value })} />
            <select className={field} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as Method })}>
              <option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option>
            </select>
            <input className={field} type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
          </div>
          <button
            disabled={busy}
            onClick={async () => {
              const ok = await run(() => createLayaway({
                sessionId, customer: { name: f.name, email: f.email || undefined, phone: f.phone || undefined },
                variantId: f.variantId || undefined, totalPesos: Number(f.total), anticipoPesos: Number(f.anticipo),
                method: f.method, dueDate: f.dueDate || undefined,
              }), "Apartado creado");
              if (ok) { setShow(false); setF({ name: "", email: "", phone: "", variantId: "", total: "", anticipo: "", method: "cash", dueDate: "" }); }
            }}
            className="rounded-full bg-ink px-6 py-2.5 text-sm uppercase tracking-widest text-cream disabled:opacity-50"
          >
            Crear apartado
          </button>
        </div>
      )}

      <div className="space-y-3">
        {data.layaways.length === 0 && <p className="py-8 text-center text-sm text-muted">Sin apartados activos</p>}
        {data.layaways.map((l) => {
          const saldo = l.total - l.paid;
          return (
            <div key={l.id} className="rounded-xl border border-ink/10 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-ink">{l.customer}</p>
                  <p className="text-xs text-muted">{l.item}{l.dueDate ? ` · vence ${l.dueDate}` : ""}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="text-ink">{formatMXN(l.paid)} / {formatMXN(l.total)}</p>
                  <p className={cn("text-xs", saldo > 0 ? "text-amber-700" : "text-green-700")}>{saldo > 0 ? `Saldo ${formatMXN(saldo)}` : "Liquidado"}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {abono?.id === l.id ? (
                  <>
                    <input className={cn(field, "w-28")} type="number" step="0.01" placeholder="Abono" value={abono.amount} onChange={(e) => setAbono({ ...abono, amount: e.target.value })} />
                    <select className={cn(field, "w-32")} value={abono.method} onChange={(e) => setAbono({ ...abono, method: e.target.value as Method })}>
                      <option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option>
                    </select>
                    <button disabled={busy} onClick={async () => { const ok = await run(() => addLayawayPayment({ sessionId, layawayId: l.id, amountPesos: Number(abono.amount), method: abono.method }), "Abono registrado"); if (ok) setAbono(null); }} className="rounded-full bg-ink px-4 py-2 text-xs uppercase tracking-wider text-cream">Confirmar</button>
                    <button onClick={() => setAbono(null)} className="text-xs text-muted">Cancelar</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setAbono({ id: l.id, amount: "", method: "cash" })} className="rounded-full border border-ink/15 px-4 py-2 text-xs text-ink hover:border-gold">Abonar</button>
                    <button disabled={busy || saldo > 0} onClick={() => run(() => convertLayaway({ sessionId, layawayId: l.id }), "Apartado convertido en venta")} className="rounded-full border border-ink/15 px-4 py-2 text-xs text-ink hover:border-gold disabled:opacity-40">Convertir a venta</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Crédito ──────────────────────────────────────────────────────────────────
function Credits({
  data, busy, sessionId, run,
}: {
  data: AccountsData; busy: boolean; sessionId: string;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, m: string) => Promise<boolean>;
}) {
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ name: "", email: "", phone: "", limit: "" });
  const [act, setAct] = useState<{ id: string; kind: "pay" | "charge"; amount: string; method: Method; dueDate: string } | null>(null);

  return (
    <div>
      <button onClick={() => setShow((s) => !s)} className="mb-4 flex items-center gap-2 text-sm text-gold hover:text-gold-dark">
        <Plus className="h-4 w-4" /> Nueva cuenta de crédito
      </button>

      {show && (
        <div className="mb-6 space-y-3 rounded-xl border border-ink/10 p-4">
          <div className="grid grid-cols-2 gap-3">
            <input className={field} placeholder="Cliente" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <input className={field} placeholder="Teléfono" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            <input className={field} placeholder="Email (opcional)" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <input className={field} type="number" step="0.01" placeholder="Límite de crédito" value={f.limit} onChange={(e) => setF({ ...f, limit: e.target.value })} />
          </div>
          <button disabled={busy} onClick={async () => { const ok = await run(() => createCreditAccount({ customer: { name: f.name, email: f.email || undefined, phone: f.phone || undefined }, limitPesos: Number(f.limit) }), "Cuenta creada"); if (ok) { setShow(false); setF({ name: "", email: "", phone: "", limit: "" }); } }} className="rounded-full bg-ink px-6 py-2.5 text-sm uppercase tracking-widest text-cream disabled:opacity-50">Crear cuenta</button>
        </div>
      )}

      <div className="space-y-3">
        {data.credits.length === 0 && <p className="py-8 text-center text-sm text-muted">Sin cuentas de crédito</p>}
        {data.credits.map((c) => (
          <div key={c.id} className="rounded-xl border border-ink/10 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-ink">{c.customer}</p>
                <p className="text-xs text-muted">Límite {formatMXN(c.limit)}</p>
              </div>
              <div className="text-right text-sm">
                <p className="text-ink">Saldo {formatMXN(c.balance)}</p>
                {c.overdue && <p className="text-xs text-red-600">Vencido</p>}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {act?.id === c.id ? (
                <>
                  <input className={cn(field, "w-28")} type="number" step="0.01" placeholder="Importe" value={act.amount} onChange={(e) => setAct({ ...act, amount: e.target.value })} />
                  {act.kind === "pay" && (
                    <select className={cn(field, "w-32")} value={act.method} onChange={(e) => setAct({ ...act, method: e.target.value as Method })}>
                      <option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option>
                    </select>
                  )}
                  {act.kind === "charge" && (
                    <input className={cn(field, "w-40")} type="date" value={act.dueDate} onChange={(e) => setAct({ ...act, dueDate: e.target.value })} />
                  )}
                  <button disabled={busy} onClick={async () => {
                    const ok = act.kind === "pay"
                      ? await run(() => addCreditPayment({ sessionId, accountId: c.id, amountPesos: Number(act.amount), method: act.method }), "Pago registrado")
                      : await run(() => addCreditCharge({ accountId: c.id, amountPesos: Number(act.amount), dueDate: act.dueDate || undefined }), "Cargo registrado");
                    if (ok) setAct(null);
                  }} className="rounded-full bg-ink px-4 py-2 text-xs uppercase tracking-wider text-cream">Confirmar</button>
                  <button onClick={() => setAct(null)} className="text-xs text-muted">Cancelar</button>
                </>
              ) : (
                <>
                  <button onClick={() => setAct({ id: c.id, kind: "charge", amount: "", method: "cash", dueDate: "" })} className="rounded-full border border-ink/15 px-4 py-2 text-xs text-ink hover:border-gold">Nuevo cargo</button>
                  <button disabled={c.balance <= 0} onClick={() => setAct({ id: c.id, kind: "pay", amount: "", method: "cash", dueDate: "" })} className="rounded-full border border-ink/15 px-4 py-2 text-xs text-ink hover:border-gold disabled:opacity-40">Abonar</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
