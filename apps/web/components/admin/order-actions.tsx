"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Check, Truck, PartyPopper } from "lucide-react";
import { updateOrderStatus, sendOrderEmail, sendShippingGuide, sendDeliveredThankYou } from "@/app/admin/pedidos/actions";
import { CARRIERS, type EmailTemplate } from "@/lib/email";
import { cn } from "@/lib/utils";

const STATUS_ACTIONS: { status: "preparing" | "shipped" | "delivered" | "completed" | "cancelled"; label: string }[] = [
  { status: "preparing", label: "Preparando" },
  { status: "shipped", label: "Enviado" },
  { status: "delivered", label: "Entregado" },
  { status: "completed", label: "Completado" },
  { status: "cancelled", label: "Cancelar" },
];

const EMAIL_ACTIONS: { template: EmailTemplate; label: string }[] = [
  { template: "payment_confirmed", label: "Pago confirmado" },
  { template: "order_prepared", label: "Pedido preparado" },
];

export function OrderActions({
  orderId,
  status,
  hasEmail,
}: {
  orderId: string;
  status: string;
  hasEmail: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [carrier, setCarrier] = useState("dhl");
  const [tracking, setTracking] = useState("");

  const changeStatus = (s: typeof STATUS_ACTIONS[number]["status"]) => {
    setMsg(null);
    startTransition(async () => {
      const res = await updateOrderStatus(orderId, s);
      if (res.ok) {
        setMsg({ kind: "ok", text: "Estado actualizado" });
        router.refresh();
      } else {
        setMsg({ kind: "err", text: res.error ?? "Error" });
      }
    });
  };

  const sendMail = async (template: EmailTemplate) => {
    setMsg(null);
    setSending(template);
    const res = await sendOrderEmail(orderId, template);
    setSending(null);
    setMsg(res.ok
      ? { kind: "ok", text: "Correo enviado al cliente" }
      : { kind: "err", text: res.error ?? "No se pudo enviar" });
  };

  const sendGuide = async () => {
    setMsg(null);
    setSending("guide");
    const res = await sendShippingGuide(orderId, carrier, tracking);
    setSending(null);
    if (res.ok) { setMsg({ kind: "ok", text: "Guía enviada al cliente · pedido marcado como enviado" }); setTracking(""); router.refresh(); }
    else setMsg({ kind: "err", text: res.error ?? "No se pudo enviar" });
  };

  const sendDelivered = async () => {
    setMsg(null);
    setSending("delivered");
    const res = await sendDeliveredThankYou(orderId);
    setSending(null);
    if (res.ok) { setMsg({ kind: "ok", text: "Agradecimiento enviado · pedido marcado como entregado" }); router.refresh(); }
    else setMsg({ kind: "err", text: res.error ?? "No se pudo enviar" });
  };

  return (
    <div className="space-y-6">
      {/* Estado */}
      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-muted">Cambiar estado</p>
        <div className="flex flex-wrap gap-2">
          {STATUS_ACTIONS.map((a) => (
            <button
              key={a.status}
              onClick={() => changeStatus(a.status)}
              disabled={pending || status === a.status}
              className={cn(
                "rounded-full border px-4 py-2 text-sm transition-colors disabled:opacity-40",
                a.status === "cancelled"
                  ? "border-red-200 text-red-600 hover:bg-red-50"
                  : "border-ink/15 text-ink hover:border-gold",
                status === a.status && "bg-ink text-cream",
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Correos manuales */}
      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-muted">Enviar correo al cliente</p>
        {!hasEmail && (
          <p className="mb-2 text-xs text-amber-700">El cliente no tiene correo registrado.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {EMAIL_ACTIONS.map((a) => (
            <button
              key={a.template}
              onClick={() => sendMail(a.template)}
              disabled={!hasEmail || sending !== null}
              className="flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 text-sm text-ink transition-colors hover:border-gold disabled:opacity-40"
            >
              {sending === a.template ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Guía de envío */}
      <div className="rounded-xl border border-ink/10 bg-cream/40 p-4">
        <p className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-muted"><Truck className="h-4 w-4 text-gold" /> Guía de envío</p>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Paquetería</label>
            <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold">
              {Object.entries(CARRIERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">Número de guía</label>
            <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Ej. 1234567890" className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold" />
          </div>
          <button onClick={sendGuide} disabled={!hasEmail || sending !== null || !tracking.trim()} className="flex items-center gap-2 rounded-full bg-ink px-5 py-2 text-sm uppercase tracking-widest text-cream hover:bg-gold-dark disabled:opacity-40">
            {sending === "guide" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />} Enviar guía
          </button>
        </div>
      </div>

      {/* Entregado */}
      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-muted">Al recibir el pedido</p>
        <button onClick={sendDelivered} disabled={!hasEmail || sending !== null} className="flex items-center gap-2 rounded-full border border-gold/40 bg-gold/5 px-4 py-2 text-sm text-gold-dark transition-colors hover:bg-gold/10 disabled:opacity-40">
          {sending === "delivered" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PartyPopper className="h-3.5 w-3.5" />} Pedido entregado — enviar agradecimiento
        </button>
      </div>

      {msg && (
        <p className={cn(
          "flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm",
          msg.kind === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700",
        )}>
          {msg.kind === "ok" && <Check className="h-4 w-4" />}
          {msg.text}
        </p>
      )}
    </div>
  );
}
