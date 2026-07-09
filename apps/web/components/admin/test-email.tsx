"use client";

import { useState } from "react";
import { Loader2, Mail, Check } from "lucide-react";
import { sendTestEmail } from "@/app/admin/ajustes/actions";
import { cn } from "@/lib/utils";

export function TestEmail() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ k: "ok" | "err"; t: string } | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await sendTestEmail(email);
    setBusy(false);
    setMsg(res.ok
      ? { k: "ok", t: `Correo enviado a ${email} (desde ${res.from}). Revisa la bandeja y Spam.` }
      : { k: "err", t: res.error ?? "No se pudo enviar" });
  };

  return (
    <section className="max-w-xl rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
      <h2 className="text-lg text-ink">Probar el sistema de correos</h2>
      <p className="mt-1 text-sm text-muted">
        Envía un correo de prueba (vía Resend) para verificar que el envío de la app funciona.
      </p>
      <form onSubmit={send} className="mt-4 flex flex-wrap gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tucorreo@ejemplo.com"
          className="min-w-[220px] flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-gold"
        />
        <button
          type="submit"
          disabled={busy}
          className="flex items-center gap-2 rounded-full bg-ink px-6 py-2.5 text-sm uppercase tracking-widest text-cream hover:bg-gold-dark disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Enviar prueba
        </button>
      </form>
      {msg && (
        <p className={cn("mt-4 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm", msg.k === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>
          {msg.k === "ok" && <Check className="h-4 w-4 shrink-0" />}{msg.t}
        </p>
      )}
    </section>
  );
}
