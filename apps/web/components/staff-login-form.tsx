"use client";

// Inicio de sesión del mostrador: número de empleado + contraseña. Al completar
// los cuatro dígitos se muestra de quién es la cuenta, para cachar el dedazo
// antes de teclear la contraseña. El campo también acepta el correo de siempre.
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { login, lookupEmployee, type EmployeeHint } from "@/app/login/actions";

const CODE_RE = /^\d{4}$/;

export function StaffLoginForm({ redirectTo }: { redirectTo: string }) {
  const [identificador, setIdentificador] = useState("");
  const [hint, setHint] = useState<EmployeeHint | null>(null);
  const [buscando, setBuscando] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  // Descarta la respuesta de una búsqueda vieja si ya cambiaron el número.
  const pedido = useRef(0);

  useEffect(() => {
    const valor = identificador.trim();
    if (!CODE_RE.test(valor)) { setHint(null); setBuscando(false); return; }

    const id = ++pedido.current;
    setBuscando(true);
    const t = setTimeout(async () => {
      const res = await lookupEmployee(valor);
      if (pedido.current !== id) return;
      setHint(res);
      setBuscando(false);
      if (res.found) passwordRef.current?.focus();
    }, 250);
    return () => clearTimeout(t);
  }, [identificador]);

  const esCorreo = identificador.includes("@");
  const input = "w-full rounded-lg border border-ink/15 bg-white px-4 py-3 text-sm outline-none focus:border-gold";

  return (
    <form action={login} className="space-y-4">
      <input type="hidden" name="redirect" value={redirectTo} />

      <div>
        <input
          name="identificador"
          value={identificador}
          onChange={(e) => setIdentificador(e.target.value)}
          required
          autoFocus
          autoComplete="username"
          // Con sólo dígitos la tablet abre el teclado numérico; si escriben una
          // arroba pasa a texto para poder teclear el correo.
          inputMode={esCorreo ? "text" : "numeric"}
          placeholder="Número de empleado"
          className={input}
        />
        <p className="mt-2 min-h-5 px-1 text-xs">
          {buscando ? (
            <span className="inline-flex items-center gap-1.5 text-muted">
              <Loader2 className="h-3 w-3 animate-spin" /> Buscando…
            </span>
          ) : hint?.found ? (
            <span className="text-gold-dark">
              Hola, {hint.firstName} · {hint.emailHint}
            </span>
          ) : hint && !hint.found ? (
            <span className="text-red-600">Ese número no está asignado</span>
          ) : (
            <span className="text-muted">Cuatro dígitos. También puedes usar tu correo.</span>
          )}
        </p>
      </div>

      <input
        ref={passwordRef}
        name="password"
        type="password"
        required
        autoComplete="current-password"
        placeholder="Contraseña"
        className={input}
      />
      <button
        type="submit"
        className="w-full rounded-full bg-ink py-3 text-sm uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark"
      >
        Entrar
      </button>
    </form>
  );
}
