"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { sendFollowUpEmail } from "@/app/admin/perforaciones/actions";
import type { PiercingEmailKind } from "@/lib/piercing-email";

type Props = {
  piercingId: string;
  hasEmail: boolean;
  sentAt: Record<PiercingEmailKind, string | null>;
};

const BUTTONS: { kind: PiercingEmailKind; label: string; hint: string }[] = [
  { kind: "care", label: "Enviar instrucciones", hint: "Cuidados después de la perforación" },
  { kind: "week", label: "Seguimiento semanal", hint: "Para la primera semana" },
  { kind: "month", label: "Seguimiento mensual", hint: "Para el primer mes" },
];

function fecha(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function PiercingFollowups({ piercingId, hasEmail, sentAt }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<PiercingEmailKind | null>(null);
  const [msg, setMsg] = useState<{ k: "ok" | "err"; t: string } | null>(null);

  async function send(kind: PiercingEmailKind) {
    setBusy(kind);
    setMsg(null);
    const res = await sendFollowUpEmail(piercingId, kind);
    setBusy(null);
    setMsg(res.ok ? { k: "ok", t: "Correo enviado" } : { k: "err", t: res.error ?? "No se pudo enviar" });
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-3">
      {!hasEmail && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Este cliente no tiene correo registrado. Agrégalo para poder enviarle los seguimientos.
        </p>
      )}

      {BUTTONS.map(({ kind, label, hint }) => {
        const sent = sentAt[kind];
        return (
          <div key={kind}>
            <button
              type="button"
              onClick={() => send(kind)}
              disabled={!hasEmail || busy !== null}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-xs uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy === kind ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
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
