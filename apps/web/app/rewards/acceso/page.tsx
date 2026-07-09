"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Loader2, Check } from "lucide-react";
import { loginRewards, registerRewards } from "./actions";
import { cn } from "@/lib/utils";

export default function RewardsAccessPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    if (tab === "login") {
      const res = await loginRewards(email, password);
      setBusy(false);
      if (!res.ok) { setError(res.error ?? "Error"); return; }
      router.push("/rewards");
      router.refresh();
    } else {
      const res = await registerRewards({ fullName, email, phone, password });
      setBusy(false);
      if (!res.ok) { setError(res.error ?? "Error"); return; }
      if (res.needsConfirm) { setConfirmSent(true); return; }
      router.push("/rewards");
      router.refresh();
    }
  };

  const field = "w-full rounded-lg border border-ink/15 bg-white px-4 py-3 text-sm outline-none focus:border-gold";

  if (confirmSent) {
    return (
      <Shell>
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600"><Check className="h-7 w-7" /></div>
          <h1 className="text-2xl text-ink">Revisa tu correo</h1>
          <p className="mt-3 text-sm text-muted">
            Te enviamos un enlace a <strong>{email}</strong> para confirmar tu cuenta.
            Al confirmarlo, entrarás a tu panel de Turkana Rewards.
          </p>
          <button onClick={() => { setConfirmSent(false); setTab("login"); }} className="mt-6 text-sm text-gold hover:text-gold-dark">Volver al inicio de sesión</button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-6 flex justify-center gap-1 rounded-lg bg-cream p-1">
        <button onClick={() => setTab("login")} className={cn("flex-1 rounded-md py-2 text-sm transition-colors", tab === "login" ? "bg-white text-ink shadow-sm" : "text-muted")}>Iniciar sesión</button>
        <button onClick={() => setTab("register")} className={cn("flex-1 rounded-md py-2 text-sm transition-colors", tab === "register" ? "bg-white text-ink shadow-sm" : "text-muted")}>Crear cuenta</button>
      </div>

      <form onSubmit={submit} className="space-y-3">
        {tab === "register" && (
          <>
            <input className={field} placeholder="Nombre completo" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            <input className={field} placeholder="Teléfono" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </>
        )}
        <input className={field} type="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className={field} type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />

        {error && <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}

        <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3.5 text-sm uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {tab === "login" ? "Entrar" : "Crear mi cuenta"}
        </button>

        {tab === "register" && (
          <p className="text-center text-[11px] leading-relaxed text-muted">
            Al crear tu cuenta aceptas los{" "}
            <Link href="/terminos" className="text-gold hover:underline">Términos y Condiciones</Link>{" "}
            y el{" "}
            <Link href="/privacidad" className="text-gold hover:underline">Aviso de Privacidad</Link>.
          </p>
        )}
      </form>

      <p className="mt-6 text-center text-xs text-muted">
        Descuentos exclusivos, acceso anticipado a nuevas piezas y sorpresas para miembros
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center">
          <Image src="/turkana-rewards.png" alt="Turkana Rewards" width={230} height={65} priority className="mx-auto h-12 w-auto" />
        </Link>
        <div className="rounded-3xl border border-ink/10 bg-white p-8">{children}</div>
      </div>
    </main>
  );
}
