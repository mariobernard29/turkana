"use client";

// Checador de asistencia: reloj en vivo + teclado numérico.
// Paso 1: código de la persona. Paso 2: PIN de 4 dígitos (se manda solo al
// completar el cuarto). El servidor decide si es entrada o salida.
// Nunca se muestra si llegó tarde o temprano: eso sólo va en los reportes.
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Delete, Loader2, LogIn, LogOut, WifiOff } from "lucide-react";
import { punch, type PunchResult } from "@/app/pos/attendance-actions";
import { getDeviceId } from "@/lib/offline/device";
import { STORE_TZ } from "@/lib/dates";
import { formatMinutes } from "@/lib/attendance";
import { useOnline } from "@/components/pos/use-online";
import { cn } from "@/lib/utils";

const RESULT_MS = 4500;

// Hora de la TIENDA, no la del equipo (por si el iPad trae otra zona).
const timeFmt = new Intl.DateTimeFormat("es-MX", { timeZone: STORE_TZ, hour: "2-digit", minute: "2-digit", hour12: false });
const secFmt = new Intl.DateTimeFormat("es-MX", { timeZone: STORE_TZ, second: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("es-MX", { timeZone: STORE_TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });

function useClock() {
  // null en el primer render: el servidor y el navegador no comparten reloj.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function AttendanceKiosk() {
  const now = useClock();
  const online = useOnline();
  const [step, setStep] = useState<"code" | "pin">("code");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<PunchResult, { ok: true }> | null>(null);

  const reset = () => { setStep("code"); setCode(""); setPin(""); setError(null); };

  // El aviso se va solo para dejar libre el checador a la siguiente persona.
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setResult(null), RESULT_MS);
    return () => clearTimeout(t);
  }, [result]);

  const submit = async (pinValue: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await punch({ code, pin: pinValue, deviceId: getDeviceId() });
      if (res.ok) { setResult(res); reset(); }
      else { setError(res.error); setPin(""); }
    } catch {
      setError("Sin conexión. Revisa el internet e inténtalo de nuevo.");
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  const press = (d: string) => {
    if (busy) return;
    setError(null);
    setResult(null);
    if (step === "code") {
      if (code.length < 6) setCode(code + d);
    } else if (pin.length < 4) {
      const nextPin = pin + d;
      setPin(nextPin);
      if (nextPin.length === 4) void submit(nextPin);
    }
  };

  const back = () => {
    if (busy) return;
    setError(null);
    if (step === "code") setCode(code.slice(0, -1));
    else if (pin) setPin(pin.slice(0, -1));
    else setStep("code");
  };

  const next = () => {
    if (step === "code" && code) { setStep("pin"); setError(null); }
  };

  // Teclado físico (la PC del mostrador).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") back();
      else if (e.key === "Enter") next();
      else if (e.key === "Escape") reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const keyCls =
    "flex h-16 items-center justify-center rounded-2xl bg-white text-2xl font-medium tabular-nums text-ink shadow-sm transition-colors active:bg-gold/20 disabled:opacity-40 sm:h-20 sm:text-3xl";

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto px-4 py-6">
      <div className="flex w-full max-w-4xl items-center justify-between">
        <Link href="/pos" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Volver a ventas
        </Link>
        <span className="text-xs uppercase tracking-[0.3em] text-gold">Asistencia</span>
      </div>

      <div className="mt-6 grid w-full max-w-4xl items-center gap-8 md:grid-cols-2">
        {/* Reloj */}
        <div className="text-center">
          <p className="font-sans text-7xl font-light tabular-nums text-ink sm:text-8xl">
            {now ? timeFmt.format(now) : "--:--"}
            <span className="ml-1 align-top text-3xl text-muted">{now ? secFmt.format(now).padStart(2, "0") : ""}</span>
          </p>
          <p className="mt-2 text-lg capitalize text-muted">{now ? dateFmt.format(now) : ""}</p>

          <div className="mx-auto mt-8 min-h-[7rem] max-w-sm">
            {result ? (
              <div className={cn("rounded-2xl p-5 text-white", result.kind === "in" ? "bg-green-600" : "bg-ink")}>
                <div className="flex items-center justify-center gap-2 text-xl">
                  {result.kind === "in" ? <LogIn className="h-6 w-6" /> : <LogOut className="h-6 w-6" />}
                  {result.kind === "in" ? `¡Hola, ${result.name}!` : `¡Hasta luego, ${result.name}!`}
                </div>
                <p className="mt-1 text-lg">
                  {result.kind === "in" ? "Entrada" : "Salida"} registrada · {timeFmt.format(new Date(result.at))}
                </p>
                {result.kind === "out" && result.workedMin != null && (
                  <p className="mt-1 text-sm text-white/80">Trabajaste {formatMinutes(result.workedMin)}</p>
                )}
              </div>
            ) : error ? (
              <p className="rounded-2xl bg-red-50 p-5 text-lg text-red-700">{error}</p>
            ) : !online ? (
              <p className="flex items-center justify-center gap-2 rounded-2xl bg-amber-50 p-5 text-amber-900">
                <WifiOff className="h-5 w-5" /> Sin conexión: la asistencia necesita internet.
              </p>
            ) : (
              <p className="p-5 text-muted">
                {step === "code"
                  ? "Escribe tu código de empleado y presiona Siguiente."
                  : "Ahora escribe tu PIN de 4 dígitos."}
              </p>
            )}
          </div>
        </div>

        {/* Teclado */}
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-4 rounded-2xl bg-white p-4 text-center shadow-sm">
            <p className="text-xs uppercase tracking-wider text-muted">
              {step === "code" ? "Código" : `Código ${code} · PIN`}
            </p>
            <div className="mt-1 flex h-10 items-center justify-center text-3xl tracking-[0.4em] tabular-nums text-ink">
              {step === "code" ? (
                code || <span className="text-ink/20">——</span>
              ) : (
                <span className="inline-flex gap-3">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className={cn("inline-block h-4 w-4 rounded-full border-2 border-ink", i < pin.length && "bg-ink")} />
                  ))}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button key={d} type="button" className={keyCls} onClick={() => press(d)} disabled={busy}>{d}</button>
            ))}
            <button type="button" className={cn(keyCls, "text-muted")} onClick={back} disabled={busy} aria-label="Borrar">
              <Delete className="h-7 w-7" />
            </button>
            <button type="button" className={keyCls} onClick={() => press("0")} disabled={busy}>0</button>
            {step === "code" ? (
              <button
                type="button"
                onClick={next}
                disabled={!code || busy}
                className={cn(keyCls, "bg-ink text-sm uppercase tracking-wider text-cream active:bg-gold-dark sm:text-sm")}
              >
                Siguiente
              </button>
            ) : (
              <div className={cn(keyCls, "bg-ink text-sm text-cream sm:text-sm")}>
                {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : "PIN"}
              </div>
            )}
          </div>
          {step === "pin" && !busy && (
            <button type="button" onClick={reset} className="mt-4 w-full text-sm text-muted hover:text-ink">
              Cancelar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
