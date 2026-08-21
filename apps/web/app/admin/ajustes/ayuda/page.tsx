import Link from "next/link";
import {
  Activity, BookOpen, CheckCircle2, CreditCard, Database, Mail,
  Phone, Printer, Timer, TriangleAlert, XCircle,
} from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadOpenSessions, type OpenSession } from "@/lib/cash-report";
import { formatStore } from "@/lib/dates";
import { SUPPORT } from "@/lib/business";
import { LiveRefresh } from "@/components/live-refresh";
import { HelpDevice } from "@/components/admin/help-device";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ayuda y estado del sistema — Turkana Admin" };

// Cuánto puede callarse el agente de impresión antes de darlo por caído.
// Late cada 30 s (ver app/pos/print-actions.ts).
const LATIDO_MS = 90_000;

type Nivel = "ok" | "aviso" | "falla";
type Chequeo = {
  nombre: string;
  nivel: Nivel;
  detalle: string;
  icono: typeof Database;
  accion?: { texto: string; href: string };
};

const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await fn();
  } catch {
    return fallback;
  }
};

async function revisar(): Promise<Chequeo[]> {
  const db = createAdminClient();
  const out: Chequeo[] = [];

  // ── Base de datos ──────────────────────────────────────────────────────────
  const t0 = Date.now();
  const bd = await safe(async () => {
    const { error } = await db.from("app_settings").select("key").limit(1);
    return !error;
  }, false);
  const ms = Date.now() - t0;
  out.push({
    nombre: "Base de datos",
    icono: Database,
    nivel: bd ? (ms > 1500 ? "aviso" : "ok") : "falla",
    detalle: bd
      ? `Conectada · respondió en ${ms} ms${ms > 1500 ? " (va lenta)" : ""}`
      : "No responde. Las ventas no se pueden guardar.",
  });

  // ── Agente de impresión ────────────────────────────────────────────────────
  const impresoras = await safe(async () => {
    const { data } = await db
      .from("printers").select("name, host, port, last_seen_at").eq("is_active", true);
    return (data ?? []) as unknown as
      { name: string; host: string; port: number; last_seen_at: string | null }[];
  }, []);

  if (impresoras.length === 0) {
    out.push({
      nombre: "Impresora de tickets",
      icono: Printer,
      nivel: "aviso",
      detalle: "No hay ninguna impresora dada de alta.",
      accion: { texto: "Configurar", href: "/admin/ajustes/impresoras" },
    });
  }
  for (const p of impresoras) {
    const viva = p.last_seen_at && Date.now() - new Date(p.last_seen_at).getTime() < LATIDO_MS;
    out.push({
      nombre: `Impresora · ${p.name}`,
      icono: Printer,
      nivel: viva ? "ok" : "aviso",
      detalle: viva
        ? `Encendida y respondiendo en ${p.host}:${p.port}`
        : `El agente no responde${p.last_seen_at ? ` desde ${formatStore(p.last_seen_at)}` : ""}. Los tickets salen por el diálogo del navegador; se puede cobrar y cerrar turno igual.`,
      accion: viva ? undefined : { texto: "Ver impresoras", href: "/admin/ajustes/impresoras" },
    });
  }

  // ── Cola de impresión ──────────────────────────────────────────────────────
  const enCola = await safe(async () => {
    const { count } = await db
      .from("print_jobs").select("id", { count: "exact", head: true })
      .in("status", ["pending", "printing", "error"]);
    return count ?? 0;
  }, 0);
  out.push({
    nombre: "Cola de impresión",
    icono: Activity,
    nivel: enCola === 0 ? "ok" : "aviso",
    detalle: enCola === 0
      ? "Sin tickets pendientes."
      : `${enCola} ticket(s) sin salir. Nunca impide cobrar ni cerrar el turno.`,
    accion: enCola === 0 ? undefined : { texto: "Ver la cola", href: "/admin/ajustes/impresoras" },
  });

  // ── Turnos abiertos ────────────────────────────────────────────────────────
  const maxHoras = await safe(async () => {
    const { data } = await db
      .from("app_settings").select("value").eq("key", "session_max_hours").maybeSingle();
    return parseInt((data as { value?: string } | null)?.value ?? "", 10) || 12;
  }, 12);
  const abiertos = await safe(() => loadOpenSessions(db), [] as OpenSession[]);
  const masViejo = abiertos.reduce((max, s) => {
    const h = Math.floor((Date.now() - new Date(s.openedAt).getTime()) / 3_600_000);
    return h > max ? h : max;
  }, 0);
  out.push({
    nombre: "Turnos de caja",
    icono: Timer,
    nivel: masViejo >= maxHoras ? "aviso" : "ok",
    detalle: abiertos.length === 0
      ? "Ningún turno abierto."
      : `${abiertos.length} turno(s) abierto(s); el más antiguo lleva ${masViejo} h.` +
        (masViejo >= maxHoras ? " Conviene hacer el corte." : ""),
    accion: abiertos.length ? { texto: "Ver cortes", href: "/admin/reportes/cortes" } : undefined,
  });

  // ── Servicios externos ─────────────────────────────────────────────────────
  const correoOk = Boolean(process.env.RESEND_API_KEY?.startsWith("re_"));
  out.push({
    nombre: "Correos",
    icono: Mail,
    nivel: correoOk ? "ok" : "aviso",
    detalle: correoOk
      ? `Configurado · se envían desde ${process.env.EMAIL_FROM ?? "el remitente por omisión"}`
      : "Sin configurar: no saldrán los correos de corte de caja ni los avisos.",
    accion: { texto: "Probar envío", href: "/admin/ajustes/correo" },
  });

  const pagosOk = Boolean(process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  out.push({
    nombre: "Pagos en línea",
    icono: CreditCard,
    nivel: pagosOk ? "ok" : "aviso",
    detalle: pagosOk
      ? "Configurado. Sólo afecta a la tienda en línea, no al cobro en mostrador."
      : "Sin configurar. La tienda en línea no puede cobrar; el POS sí funciona.",
  });

  return out;
}

const ESTILO: Record<Nivel, { punto: string; texto: string; Icono: typeof CheckCircle2 }> = {
  ok: { punto: "bg-green-500", texto: "text-green-700", Icono: CheckCircle2 },
  aviso: { punto: "bg-amber-500", texto: "text-amber-700", Icono: TriangleAlert },
  falla: { punto: "bg-red-500", texto: "text-red-700", Icono: XCircle },
};

type Problema = { titulo: string; pasos: string[] };

// Los problemas que de verdad han pasado en la tienda, en el orden en que se
// preguntan. Escrito para quien está en el mostrador, no para un técnico.
const PROBLEMAS: Problema[] = [
  {
    titulo: "No sale el ticket de una venta",
    pasos: [
      "Arriba en el POS aparecerá «Ticket por navegador» en color ámbar: quiere decir que la impresora no está respondiendo.",
      "Revisa que la impresora esté encendida, con papel y conectada a la red.",
      "En la computadora del mostrador, abre el acceso «Agente de impresión Turkana» del escritorio y déjalo abierto.",
      "Mientras tanto puedes seguir cobrando: el ticket sale por la ventana de imprimir del navegador.",
      "Si un ticket quedó atorado, bórralo desde Ajustes → Impresoras con el bote de basura.",
    ],
  },
  {
    titulo: "No me deja cerrar el turno",
    pasos: [
      "La impresora NUNCA impide cerrar un turno, aunque la pastilla de arriba esté en ámbar o en rojo.",
      "Entra al menú del POS → Corte de caja, captura lo contado y presiona «Cerrar caja».",
      "Si aparece un mensaje en rojo, léelo y avísale a soporte con ese texto tal cual.",
      "Si la ventana se queda girando, recarga con Ctrl + Shift + R y vuelve a intentar: el corte no se duplica.",
    ],
  },
  {
    titulo: "La pantalla se queda cargando al abrir la caja",
    pasos: [
      "El turno probablemente ya quedó abierto: la pantalla se recarga sola a los pocos segundos.",
      "Si no se recarga, presiona Ctrl + Shift + R (en la tableta, cierra y abre la app).",
      "Si al volver ya aparece la pantalla de venta con tu fondo, todo está bien: no lo vuelvas a abrir.",
      "Si insiste, usa «Vaciar la copia y recargar» aquí abajo en «Este equipo».",
    ],
  },
  {
    titulo: "Cambié un precio y el POS sigue con el viejo",
    pasos: [
      "El catálogo se actualiza solo en uno o dos segundos; no hace falta recargar.",
      "Si tenías piezas en el ticket, ésas conservan a propósito el precio con el que se agregaron: sale un aviso azul.",
      "Para cobrar con el precio nuevo, quita la pieza y vuelve a agregarla.",
      "Si después de un minuto sigue sin verse, usa «Vaciar la copia y recargar» en «Este equipo».",
    ],
  },
  {
    titulo: "Los números de ventas no me cuadran",
    pasos: [
      "«Ventas hoy» del panel cuenta el día completo en hora de Los Mochis, de todas las cajas y también la tienda en línea.",
      "El corte de caja cuenta sólo ese turno, así que si hubo dos turnos no va a coincidir con el día.",
      "El correo del corte trae un renglón «Venta total del día» justamente para poder comparar.",
      "Una venta cancelada deja de sumar en el panel, pero el corte del turno donde se cobró no se toca.",
    ],
  },
  {
    titulo: "El sistema muestra información que ya no es cierta",
    pasos: [
      "Casi siempre es una copia vieja guardada en ese equipo.",
      "Usa «Vaciar la copia y recargar» aquí abajo, en «Este equipo».",
      "Si pasa en varios equipos a la vez, revisa arriba si la base de datos está respondiendo.",
    ],
  },
  {
    titulo: "Se quedó un turno abierto de un día anterior",
    pasos: [
      "Entra al POS con esa caja y haz el corte normalmente: el dinero se registra en ese turno.",
      "Si el corte ya no corresponde a la realidad, hazlo igual y anota la diferencia en el conteo.",
      "El panel avisa cuando un turno pasa de 12 horas abierto; ese umbral se cambia en Ajustes → Negocio.",
    ],
  },
];

async function cajas(): Promise<{ id: string; name: string }[]> {
  const db = createAdminClient();
  return safe(async () => {
    const { data } = await db.from("cash_registers").select("id, name").eq("is_active", true);
    return (data ?? []) as unknown as { id: string; name: string }[];
  }, []);
}

export default async function AyudaPage() {
  await requireStaff();
  const [chequeos, registros] = await Promise.all([revisar(), cajas()]);
  const hayFalla = chequeos.some((c) => c.nivel === "falla");
  const hayAviso = chequeos.some((c) => c.nivel === "aviso");

  return (
    <div className="space-y-8">
      <LiveRefresh tables={["print_jobs", "cash_sessions"]} intervalMs={30_000} />

      <div>
        <h1 className="text-3xl text-ink">Ayuda</h1>
        <p className="mt-1 text-sm text-muted">
          Estado del sistema, soluciones a lo que falla más seguido y a quién llamar.
        </p>
      </div>

      {/* ── Resumen ── */}
      <section
        className={`rounded-2xl border p-6 ${
          hayFalla ? "border-red-200 bg-red-50" : hayAviso ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"
        }`}
      >
        <p className={`text-lg ${hayFalla ? "text-red-800" : hayAviso ? "text-amber-900" : "text-green-800"}`}>
          {hayFalla
            ? "Hay algo que impide trabajar"
            : hayAviso
              ? "El sistema funciona, con avisos"
              : "Todo funcionando"}
        </p>
        <p className={`mt-1 text-sm ${hayFalla ? "text-red-700" : hayAviso ? "text-amber-800" : "text-green-700"}`}>
          {hayFalla
            ? "Revisa abajo lo marcado en rojo y llama a soporte si no se resuelve."
            : hayAviso
              ? "Se puede cobrar y cerrar turno con normalidad. Los avisos son cosas que conviene atender."
              : "Todos los servicios responden. Esta página se actualiza sola."}
        </p>
      </section>

      {/* ── Chequeos ── */}
      <section className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
        <div className="border-b border-ink/10 px-6 py-4">
          <h2 className="text-lg text-ink">Estado de los servicios</h2>
          <p className="mt-1 text-xs text-muted">Se revisa solo cada 30 segundos.</p>
        </div>
        <ul>
          {chequeos.map((c) => {
            const s = ESTILO[c.nivel];
            return (
              <li key={c.nombre} className="flex flex-wrap items-start gap-3 border-b border-ink/5 px-6 py-4 last:border-0">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.punto}`} />
                <c.icono className="mt-0.5 h-4 w-4 shrink-0 text-muted" strokeWidth={1.5} />
                <div className="min-w-[200px] flex-1">
                  <p className="text-sm text-ink">{c.nombre}</p>
                  <p className={`mt-0.5 text-sm ${c.nivel === "ok" ? "text-muted" : s.texto}`}>{c.detalle}</p>
                </div>
                {c.accion && (
                  <Link
                    href={c.accion.href}
                    className="rounded-full border border-ink/15 px-3 py-1.5 text-xs text-ink transition-colors hover:border-gold"
                  >
                    {c.accion.texto}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <HelpDevice cajas={registros} />

      {/* ── Problemas comunes ── */}
      <section className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
        <div className="border-b border-ink/10 px-6 py-4">
          <h2 className="text-lg text-ink">Si algo falla</h2>
          <p className="mt-1 text-xs text-muted">Toca un problema para ver los pasos.</p>
        </div>
        {PROBLEMAS.map((p) => (
          <details key={p.titulo} className="group border-b border-ink/5 last:border-0">
            <summary className="cursor-pointer list-none px-6 py-4 text-sm text-ink transition-colors hover:bg-cream/50">
              <span className="mr-2 text-muted transition-transform group-open:hidden">+</span>
              <span className="mr-2 hidden text-muted group-open:inline">−</span>
              {p.titulo}
            </summary>
            <ol className="list-decimal space-y-2 px-6 pb-5 pl-14 text-sm text-muted">
              {p.pasos.map((paso) => <li key={paso}>{paso}</li>)}
            </ol>
          </details>
        ))}
      </section>

      {/* ── Manual y soporte ── */}
      <section className="grid gap-4 sm:grid-cols-2">
        <a
          href={SUPPORT.manualUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-start gap-4 rounded-2xl border border-ink/10 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-gold hover:shadow-md"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
            <BookOpen className="h-5 w-5" strokeWidth={1.5} />
          </span>
          <div className="min-w-0">
            <h2 className="text-base text-ink">Manual de uso</h2>
            <p className="mt-1 text-sm text-muted">
              Cómo cobrar, apartar, dar crédito, hacer el corte y administrar el catálogo.
            </p>
            <p className="mt-1 truncate text-xs text-gold-dark">{SUPPORT.manualUrl}</p>
          </div>
        </a>

        <a
          href={`tel:${SUPPORT.phone}`}
          className="group flex items-start gap-4 rounded-2xl border border-ink/10 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-gold hover:shadow-md"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
            <Phone className="h-5 w-5" strokeWidth={1.5} />
          </span>
          <div className="min-w-0">
            <h2 className="text-base text-ink">Soporte técnico</h2>
            <p className="mt-1 font-medium tabular-nums text-ink">{SUPPORT.phoneDisplay}</p>
            <p className="mt-1 text-sm text-muted">
              Ten a la mano qué estabas haciendo y el texto exacto del error.
            </p>
          </div>
        </a>
      </section>
    </div>
  );
}
