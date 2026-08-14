// Catálogo de puntos de la oreja y estado de seguimiento de una perforación.
// Fuente única para el listado, el formulario, el detalle y los correos.

export type Ear = "izq" | "der";
export type Level = "alta" | "medio" | "lobulo";

export type EarSpot = {
  key: string;
  ear: Ear;
  level: Level;
  label: string;   // etiqueta completa: "Izquierda · lóbulo"
  short: string;   // para resúmenes: "lóbulo izq."
};

export const LEVEL_LABEL: Record<Level, string> = {
  alta: "alta (hélix)",
  medio: "media",
  lobulo: "lóbulo",
};

export const EAR_LABEL: Record<Ear, string> = {
  izq: "Izquierda",
  der: "Derecha",
};

// Orden de arriba hacia abajo, igual que se dibujan en el selector.
export const EAR_SPOTS: EarSpot[] = (["izq", "der"] as Ear[]).flatMap((ear) =>
  (["alta", "medio", "lobulo"] as Level[]).map((level) => ({
    key: `${ear}_${level}`,
    ear,
    level,
    label: `${EAR_LABEL[ear]} · ${LEVEL_LABEL[level]}`,
    short: `${LEVEL_LABEL[level]} ${ear === "izq" ? "izq." : "der."}`,
  })),
);

export const SPOT_KEYS: string[] = EAR_SPOTS.map((s) => s.key);

export function spotsFor(ear: Ear): EarSpot[] {
  return EAR_SPOTS.filter((s) => s.ear === ear);
}

export function spotLabel(key: string): string {
  return EAR_SPOTS.find((s) => s.key === key)?.label ?? key;
}

// "lóbulo izq., lóbulo der." — respeta el orden del catálogo, no el de captura.
export function spotsSummary(spots: string[] | null | undefined): string {
  const set = new Set(spots ?? []);
  const hits = EAR_SPOTS.filter((s) => set.has(s.key));
  return hits.length ? hits.map((s) => s.short).join(", ") : "—";
}

// Filtra lo que venga de la BD contra el catálogo (la columna es text[] sin check).
export function sanitizeSpots(spots: unknown): string[] {
  if (!Array.isArray(spots)) return [];
  return SPOT_KEYS.filter((k) => spots.includes(k));
}

// ¿Hay cartílago? Cicatriza más lento que el lóbulo y los correos lo distinguen.
export function hasCartilage(spots: string[]): boolean {
  return spots.some((k) => k.endsWith("_alta") || k.endsWith("_medio"));
}

// ── Seguimiento ────────────────────────────────────────────────────────────
export const WEEK_DAYS = 7;
export const MONTH_DAYS = 30;

export type FollowupRow = {
  performed_at: string;
  week_email_sent_at: string | null;
  month_email_sent_at: string | null;
};

export type FollowupState = "semanal" | "mensual" | "al_corriente";

export function daysSince(performedAt: string): number {
  // performed_at es un DATE ("2026-08-10"): se compara a mediodía UTC para que el
  // desfase de zona horaria no reste ni sume un día.
  const then = new Date(`${performedAt.slice(0, 10)}T12:00:00Z`).getTime();
  return Math.floor((Date.now() - then) / 86_400_000);
}

// El mensual manda sobre el semanal: si ya pasó un mes, eso es lo urgente.
export function followupState(row: FollowupRow): FollowupState {
  const d = daysSince(row.performed_at);
  if (d >= MONTH_DAYS && !row.month_email_sent_at) return "mensual";
  if (d >= WEEK_DAYS && !row.week_email_sent_at) return "semanal";
  return "al_corriente";
}

export const FOLLOWUP_LABEL: Record<FollowupState, string> = {
  semanal: "Semanal pendiente",
  mensual: "Mensual pendiente",
  al_corriente: "Al corriente",
};

export const FOLLOWUP_STYLE: Record<FollowupState, string> = {
  semanal: "bg-amber-50 text-amber-700",
  mensual: "bg-red-50 text-red-700",
  al_corriente: "bg-green-50 text-green-700",
};

// Fecha límite (YYYY-MM-DD) para filtrar en la query: perforaciones con
// performed_at <= este valor ya cumplieron los días.
export function cutoffDate(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}
