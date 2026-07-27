"use client";

// Consulta de apartados y cuentas de crédito, y cobro de abonos (con caja abierta).
// El apartado se crea desde el carrito ("Apartar") y el fiado desde el cobro
// ("Fiado"): aquí sólo se consulta, se abona y se entrega.
import { useEffect, useState, useCallback } from "react";
import { X, Loader2, Plus, Search, Trash2 } from "lucide-react";
import {
  getAccountsData, addLayawayPayment, convertLayaway,
  createCreditAccount, addCreditPayment, type AccountsData, type AbonoResult,
} from "@/app/pos/account-actions";
import { CustomerSearch } from "@/components/pos/customer-search";
import type { PosCustomer } from "@/app/pos/customer-actions";
import { printReceiptHTML } from "@/lib/print";
import type { ReceiptData } from "@/lib/escpos";
import { formatMXN, cn } from "@/lib/utils";
import { POS_METHODS } from "@/lib/payments";

type Method = "cash" | "debit" | "credit_card" | "amex" | "transfer";
type ActionResult = { ok: boolean; error?: string; comprobante?: ReceiptData };
type Run = (fn: () => Promise<ActionResult>, okMsg: string) => Promise<boolean>;

export function AccountsPanel({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"layaways" | "credits">("layaways");
  const [data, setData] = useState<AccountsData | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ k: "ok" | "err"; t: string } | null>(null);

  const reload = useCallback(async (term: string) => {
    setData(await getAccountsData(term));
  }, []);
  useEffect(() => {
    const t = setTimeout(() => { reload(q); }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [reload, q]);

  // Imprime el comprobante del abono en cuanto el servidor confirma.
  const run: Run = async (fn, okMsg) => {
    setBusy(true); setMsg(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { setMsg({ k: "err", t: res.error ?? "Error" }); return false; }
    if (res.comprobante) printReceiptHTML(res.comprobante);
    setMsg({ k: "ok", t: okMsg });
    await reload(q);
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

        <div className="border-b border-ink/10 px-6 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por cliente o folio (AP-000123)…"
              className="w-full rounded-lg border border-ink/15 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-gold"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {msg && (
            <p className={cn("mb-4 rounded-lg px-4 py-2.5 text-sm", msg.k === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>{msg.t}</p>
          )}
          {!data ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
          ) : tab === "layaways" ? (
            <Layaways data={data} busy={busy} sessionId={sessionId} run={run} />
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

// Fila de cobro de abono, con tope al saldo pendiente y atajo para liquidar.
function AbonoRow({
  saldo, busy, onConfirm, onCancel,
}: {
  saldo: number; busy: boolean;
  onConfirm: (amountCents: number, method: Method) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("cash");
  const cents = Math.min(saldo, Math.max(0, Math.round((Number(amount) || 0) * 100)));

  return (
    <>
      <input className={cn(field, "w-28")} type="number" step="0.01" min="0" inputMode="decimal"
        placeholder="Abono" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      <button type="button" onClick={() => setAmount((saldo / 100).toFixed(2))}
        className="rounded-full border border-ink/15 px-3 py-2 text-xs text-muted hover:text-ink">Liquidar</button>
      <select className={cn(field, "w-32")} value={method} onChange={(e) => setMethod(e.target.value as Method)}>
        {POS_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
      </select>
      <button disabled={busy || cents <= 0} onClick={() => onConfirm(cents, method)}
        className="rounded-full bg-ink px-4 py-2 text-xs uppercase tracking-wider text-cream disabled:opacity-40">
        Cobrar {formatMXN(cents)}
      </button>
      <button onClick={onCancel} className="text-xs text-muted">Cancelar</button>
    </>
  );
}

// ── Apartados ────────────────────────────────────────────────────────────────
function Layaways({
  data, busy, sessionId, run,
}: {
  data: AccountsData; busy: boolean; sessionId: string; run: Run;
}) {
  const [abonoId, setAbonoId] = useState<string | null>(null);

  return (
    <div>
      <p className="mb-4 rounded-lg bg-cream px-4 py-2.5 text-xs text-muted">
        Para crear un apartado, agrega las piezas al ticket y usa <strong className="text-ink">Apartar</strong>: así se reserva el inventario con los precios reales.
      </p>

      <div className="space-y-3">
        {data.layaways.length === 0 && <p className="py-8 text-center text-sm text-muted">Sin apartados activos</p>}
        {data.layaways.map((l) => {
          const saldo = l.total - l.paid;
          return (
            <div key={l.id} className="rounded-xl border border-ink/10 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-ink">
                    <span className="mr-2 rounded bg-cream px-1.5 py-0.5 text-xs tabular-nums text-muted">{l.folio}</span>
                    {l.customer}
                  </p>
                  <p className="text-xs text-muted">{l.items}{l.dueDate ? ` · vence ${l.dueDate}` : ""}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="tabular-nums text-ink">{formatMXN(l.paid)} / {formatMXN(l.total)}</p>
                  <p className={cn("text-xs", saldo > 0 ? "text-amber-700" : "text-green-700")}>{saldo > 0 ? `Saldo ${formatMXN(saldo)}` : "Liquidado"}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {abonoId === l.id ? (
                  <AbonoRow
                    saldo={saldo} busy={busy}
                    onCancel={() => setAbonoId(null)}
                    onConfirm={async (amountCents, method) => {
                      const ok = await run(
                        () => addLayawayPayment({ sessionId, layawayId: l.id, amountCents, method }) as Promise<AbonoResult>,
                        "Abono cobrado",
                      );
                      if (ok) setAbonoId(null);
                    }}
                  />
                ) : (
                  <>
                    <button disabled={saldo <= 0} onClick={() => setAbonoId(l.id)}
                      className="rounded-full border border-ink/15 px-4 py-2 text-xs text-ink hover:border-gold disabled:opacity-40">Abonar</button>
                    <button disabled={busy || saldo > 0}
                      onClick={() => run(() => convertLayaway({ sessionId, layawayId: l.id }), "Apartado entregado como venta")}
                      className="rounded-full border border-ink/15 px-4 py-2 text-xs text-ink hover:border-gold disabled:opacity-40">
                      Entregar (convertir a venta)
                    </button>
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
  data: AccountsData; busy: boolean; sessionId: string; run: Run;
}) {
  const [show, setShow] = useState(false);
  const [client, setClient] = useState<PosCustomer | null>(null);
  const [limit, setLimit] = useState("");
  const [abonoId, setAbonoId] = useState<string | null>(null);

  return (
    <div>
      <button onClick={() => setShow((s) => !s)} className="mb-3 flex items-center gap-2 text-sm text-gold hover:text-gold-dark">
        <Plus className="h-4 w-4" /> Nueva cuenta de crédito
      </button>
      <p className="mb-4 rounded-lg bg-cream px-4 py-2.5 text-xs text-muted">
        El fiado se registra al cobrar: adjunta el cliente y usa <strong className="text-ink">Fiado</strong>. Si no tiene cuenta, se abre sola con el límite por defecto.
      </p>

      {show && (
        <div className="mb-6 space-y-3 rounded-xl border border-ink/10 p-4">
          {client ? (
            <div className="flex items-center justify-between rounded-lg bg-gold/10 px-3 py-2 text-sm">
              <span className="text-ink">{client.name}</span>
              <button onClick={() => setClient(null)} className="text-muted hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
            </div>
          ) : (
            <CustomerSearch onSelect={setClient} />
          )}
          <input className={field} type="number" step="0.01" placeholder="Límite de crédito (pesos)"
            value={limit} onChange={(e) => setLimit(e.target.value)} />
          <button
            disabled={busy || !client || !limit}
            onClick={async () => {
              const ok = await run(() => createCreditAccount({ customerId: client!.id, limitPesos: Number(limit) }), "Cuenta creada");
              if (ok) { setShow(false); setClient(null); setLimit(""); }
            }}
            className="rounded-full bg-ink px-6 py-2.5 text-sm uppercase tracking-widest text-cream disabled:opacity-50"
          >
            Crear cuenta
          </button>
        </div>
      )}

      <div className="space-y-3">
        {data.credits.length === 0 && <p className="py-8 text-center text-sm text-muted">Sin cuentas de crédito</p>}
        {data.credits.map((c) => (
          <div key={c.id} className="rounded-xl border border-ink/10 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-ink">{c.customer}</p>
                <p className="text-xs text-muted">
                  Límite {formatMXN(c.limit)} · disponible {formatMXN(Math.max(0, c.limit - c.balance))}
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="tabular-nums text-ink">Debe {formatMXN(c.balance)}</p>
                {c.overdue && <p className="text-xs text-red-600">Vencido</p>}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {abonoId === c.id ? (
                <AbonoRow
                  saldo={c.balance} busy={busy}
                  onCancel={() => setAbonoId(null)}
                  onConfirm={async (amountCents, method) => {
                    const ok = await run(
                      () => addCreditPayment({ sessionId, accountId: c.id, amountCents, method }) as Promise<AbonoResult>,
                      "Abono cobrado",
                    );
                    if (ok) setAbonoId(null);
                  }}
                />
              ) : (
                <button disabled={c.balance <= 0} onClick={() => setAbonoId(c.id)}
                  className="rounded-full border border-ink/15 px-4 py-2 text-xs text-ink hover:border-gold disabled:opacity-40">Abonar</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
