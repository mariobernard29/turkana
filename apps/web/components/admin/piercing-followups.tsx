"use client";

import { useState } from "react";
import { formatStore } from "@/lib/dates";
import { useRouter } from "next/navigation";
import { Loader2, Mail, MessageCircle } from "lucide-react";
import { markFollowUpWhatsapp, sendFollowUpEmail } from "@/app/admin/perforaciones/actions";
import type { PiercingEmailData, PiercingEmailKind } from "@/lib/piercing-content";
import { piercingWhatsappText, whatsappLink } from "@/lib/piercing-whatsapp";

type Channel = "email" | "whatsapp";

type Props = {
  piercingId: string;
  hasEmail: boolean;
  phone: string | null;
  message: PiercingEmailData; // nombre, fecha y puntos: arman el texto de WhatsApp
  sentAt: Record<PiercingEmailKind, string | null>;
};

const BUTTONS: { kind: PiercingEmailKind; label: string; hint: string }[] = [
  { kind: "care", label: "Enviar instrucciones", hint: "Cuidados después de la perforación" },
  { kind: "week", label: "Seguimiento semanal", hint: "Para la primera semana" },
  { kind: "month", label: "Seguimiento mensual", hint: "Para el primer mes" },
];

const CHANNELS: { value: Channel; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
];

function fecha(iso: string) {
  return formatStore(iso, {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function PiercingFollowups({ piercingId, hasEmail, phone, message, sentAt }: Props) {
  const router = useRouter();
  const [channel, setChannel] = useState<Channel>("email");
  const [busy, setBusy] = useState<PiercingEmailKind | null>(null);
  const [msg, setMsg] = useState<{ k: "ok" | "err"; t: string } | null>(null);

  const canSend = channel === "email" ? hasEmail : Boolean(whatsappLink(phone, ""));

  async function send(kind: PiercingEmailKind) {
    setMsg(null);

    // WhatsApp no se manda desde el servidor: se abre el chat del cliente con el
    // mensaje ya escrito. La ventana tiene que abrirse en el mismo clic, antes de
    // cualquier await, o el navegador la bloquea por emergente.
    if (channel === "whatsapp") {
      const url = whatsappLink(phone, piercingWhatsappText(kind, message));
      if (!url) {
        setMsg({ k: "err", t: "El teléfono del cliente no sirve para WhatsApp" });
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
      setBusy(kind);
      const res = await markFollowUpWhatsapp(piercingId, kind);
      setBusy(null);
      setMsg(
        res.ok
          ? { k: "ok", t: "WhatsApp abierto. Envía el mensaje desde el chat." }
          : { k: "err", t: res.error ?? "No se pudo registrar el envío" },
      );
      if (res.ok) router.refresh();
      return;
    }

    setBusy(kind);
    const res = await sendFollowUpEmail(piercingId, kind);
    setBusy(null);
    setMsg(res.ok ? { k: "ok", t: "Correo enviado" } : { k: "err", t: res.error ?? "No se pudo enviar" });
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex rounded-full border border-ink/10 p-1">
        {CHANNELS.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => { setChannel(c.value); setMsg(null); }}
            disabled={busy !== null}
            className={`flex-1 rounded-full px-3 py-1.5 text-xs uppercase tracking-widest transition-colors disabled:cursor-not-allowed ${
              channel === c.value ? "bg-ink text-cream" : "text-muted hover:text-ink"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {!canSend && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {channel === "email"
            ? "Este cliente no tiene correo registrado. Agrégalo para poder enviarle los seguimientos."
            : "Este cliente no tiene teléfono registrado. Agrégalo para poder mandarle el seguimiento por WhatsApp."}
        </p>
      )}

      {BUTTONS.map(({ kind, label, hint }) => {
        const sent = sentAt[kind];
        return (
          <div key={kind}>
            <button
              type="button"
              onClick={() => send(kind)}
              disabled={!canSend || busy !== null}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-xs uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy === kind ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : channel === "email" ? (
                <Mail className="h-4 w-4" />
              ) : (
                <MessageCircle className="h-4 w-4" />
              )}
              {label}
            </button>
            <p className="mt-1.5 text-center text-xs text-muted">
              {sent ? `Enviado el ${fecha(sent)}` : hint}
            </p>
          </div>
        );
      })}

      {msg && (
        <p
          className={`rounded-lg px-3 py-2 text-center text-xs ${
            msg.k === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}
        >
          {msg.t}
        </p>
      )}
    </div>
  );
}
