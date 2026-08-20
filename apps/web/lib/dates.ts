// Qué es "hoy" para el negocio.
//
// El servidor de producción corre en UTC y Los Mochis está en UTC−7. Calcular el
// día con `new Date().setHours(0,0,0,0)` hacía que el día del negocio empezara a
// las 17:00 hora local: toda venta de la tarde se contaba en el día siguiente y
// el dashboard mostraba por la mañana la venta de anoche como "ventas de hoy".
//
// Aquí se decide una sola vez, con la zona de la tienda, en vez de con el reloj
// de la máquina que ejecute el código.
export const STORE_TZ = "America/Mazatlan"; // Sinaloa: UTC−7 todo el año

const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: STORE_TZ,
  hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});

type Parts = { y: number; m: number; d: number; hh: number; mm: number; ss: number };

function storeParts(at: Date): Parts {
  const p = Object.fromEntries(PARTS.formatToParts(at).map((x) => [x.type, x.value]));
  return {
    y: Number(p.year), m: Number(p.month), d: Number(p.day),
    hh: Number(p.hour), mm: Number(p.minute), ss: Number(p.second),
  };
}

// Minutos que la zona de la tienda va por delante de UTC (negativo: va detrás).
function tzOffsetMinutes(at: Date): number {
  const p = storeParts(at);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return Math.round((asUtc - at.getTime()) / 60000);
}

// Una hora de pared de la tienda convertida al instante real (UTC).
// Se itera dos veces por si el país volviera a mover el horario de verano: la
// primera pasada usa el desfase equivocado justo en el salto.
function zonedToUtc(y: number, m: number, d: number, hh = 0, mm = 0, ss = 0): Date {
  const naive = Date.UTC(y, m - 1, d, hh, mm, ss);
  let ts = naive - tzOffsetMinutes(new Date(naive)) * 60000;
  ts = naive - tzOffsetMinutes(new Date(ts)) * 60000;
  return new Date(ts);
}

/** Medianoche de hoy en la tienda, como instante real. */
export function startOfBusinessDay(at: Date = new Date()): Date {
  const p = storeParts(at);
  return zonedToUtc(p.y, p.m, p.d, 0, 0, 0);
}

/** El instante en que termina ese día de negocio (medianoche del siguiente). */
export function endOfBusinessDay(at: Date = new Date()): Date {
  const start = startOfBusinessDay(at);
  // +26 h y se vuelve a bajar al inicio del día: sobrevive a cualquier salto horario.
  return startOfBusinessDay(new Date(start.getTime() + 26 * 3600_000));
}

export type Range = "day" | "week" | "month" | "year";

/** Rango [desde, hasta) de un periodo, anclado al día de negocio. */
export function businessRange(range: Range, at: Date = new Date()): { from: Date; to: Date } {
  const from = startOfBusinessDay(at);
  const p = storeParts(at);
  if (range === "week") return { from: zonedToUtc(p.y, p.m, p.d - 7), to: endOfBusinessDay(at) };
  if (range === "month") return { from: zonedToUtc(p.y, p.m - 1, p.d), to: endOfBusinessDay(at) };
  if (range === "year") return { from: zonedToUtc(p.y - 1, p.m, p.d), to: endOfBusinessDay(at) };
  return { from, to: endOfBusinessDay(at) };
}

/**
 * Rango [desde, hasta) de un día "YYYY-MM-DD" de la tienda, en instantes reales.
 * Los filtros por fecha mandaban antes cadenas sin zona ("2026-08-20T00:00:00")
 * y Postgres las leía en UTC, corriendo el corte 7 horas.
 */
export function storeDayRange(dayKey: string): { from: Date; to: Date } {
  const [y, m, d] = dayKey.split("-").map(Number);
  const from = zonedToUtc(y, m, d);
  return { from, to: zonedToUtc(y, m, d + 1) };
}

/** "YYYY-MM-DD" del día de negocio: para comparar contra columnas `date`. */
export function businessDayKey(at: Date = new Date()): string {
  const p = storeParts(at);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

// Año de cuatro cifras: en un ticket o un corte, "20/08/26" se presta a
// confusión y el papel se archiva.
const DEFAULT_FORMAT: Intl.DateTimeFormatOptions = {
  day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit",
};

/** Fecha y hora en la zona de la tienda, no en la del servidor. */
export function formatStore(
  at: Date | string,
  opts: Intl.DateTimeFormatOptions = DEFAULT_FORMAT,
): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return d.toLocaleString("es-MX", { timeZone: STORE_TZ, ...opts });
}
