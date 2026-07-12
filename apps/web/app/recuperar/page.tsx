"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Loader2, Check } from "lucide-react";
import { requestPasswordReset } from "@/app/auth/actions";

export default function RecuperarPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const field = "w-full rounded-lg border border-ink/15 bg-white px-4 py-3 text-sm outline-none focus:border-gold";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await requestPasswordReset(email);
    setBusy(false);
    if (!res.ok) { setError(res.error ?? "No se pudo enviar el correo"); return; }
    setSent(true);
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Image src="/turkana-logo.png" alt="Turkana Jewelry" width={220} height={62} priority className="mx-auto h-12 w-auto" />
        <p className="mb-10 mt-3 text-center text-xs uppercase tracking-[0.3em] text-gold">Recuperar acceso</p>

        {sent ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600"><Check className="h-7 w-7" /></div>
            <h1 className="text-2xl text-ink">Revisa tu correo</h1>
            <p className="mt-3 text-sm text-muted">Si <strong>{email}</strong> tiene una cuenta, te enviamos un enlace para restablecer tu contraseña.</p>
            <Link href="/login" className="mt-6 inline-block text-sm text-gold hover:text-gold-dark">Volver al inicio de sesión</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-center text-sm text-muted">Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.</p>
            <input className={field} type="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} required />
            {error && <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3 text-sm uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar enlace
            </button>
            <Link href="/login" className="block text-center text-sm text-muted hover:text-ink">Volver al inicio de sesión</Link>
          </form>
        )}
      </div>
    </main>
  );
}
