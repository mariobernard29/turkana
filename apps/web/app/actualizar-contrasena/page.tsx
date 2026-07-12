"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Loader2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const field = "w-full rounded-lg border border-ink/15 bg-white px-4 py-3 text-sm outline-none focus:border-gold";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres"); return; }
    if (password !== confirm) { setError("Las contraseñas no coinciden"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes("session") || m.includes("jwt") || m.includes("token"))
        setError("Tu enlace expiró o no es válido. Solicita uno nuevo desde el inicio de sesión.");
      else setError(error.message);
      return;
    }
    setDone(true);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center">
          <Image src="/turkana-logo.png" alt="Turkana Jewelry" width={220} height={62} priority className="mx-auto h-12 w-auto" />
        </Link>
        <div className="rounded-3xl border border-ink/10 bg-white p-8">
          {done ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600"><Check className="h-7 w-7" /></div>
              <h1 className="text-2xl text-ink">Contraseña actualizada</h1>
              <p className="mt-3 text-sm text-muted">Ya puedes iniciar sesión con tu nueva contraseña.</p>
              <div className="mt-6 flex flex-col gap-2">
                <Link href="/login" className="rounded-full bg-ink py-3 text-sm uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark">Acceso staff</Link>
                <Link href="/rewards/acceso" className="text-sm text-gold hover:text-gold-dark">Ir a Turkana Rewards</Link>
              </div>
            </div>
          ) : (
            <>
              <h1 className="mb-1 text-center text-2xl text-ink">Nueva contraseña</h1>
              <p className="mb-6 text-center text-sm text-muted">Elige una contraseña para tu cuenta.</p>
              <form onSubmit={submit} className="space-y-3">
                <input className={field} type="password" placeholder="Nueva contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                <input className={field} type="password" placeholder="Repite la contraseña" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} />
                {error && <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}
                <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3.5 text-sm uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark disabled:opacity-50">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Guardar contraseña
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
