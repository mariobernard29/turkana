"use client";

import { cn } from "@/lib/utils";
import { EAR_LABEL, EAR_SPOTS, LEVEL_LABEL, spotsSummary, type Ear, type Level } from "@/lib/piercings";

// Posición de cada punto sobre el dibujo, en % del recuadro de la oreja. El
// recuadro usa aspect-[8/11] para que coincida exacto con el viewBox 64×88: si
// las proporciones no empatan, el SVG se centra con márgenes y los puntos se
// despegan del trazo.
const POS: Record<Level, { x: number; y: number }> = {
  alta: { x: 71, y: 13 },
  medio: { x: 85, y: 47 },
  lobulo: { x: 48, y: 88 },
};

function pos(ear: Ear, level: Level) {
  const p = POS[level];
  return { left: `${ear === "izq" ? 100 - p.x : p.x}%`, top: `${p.y}%` };
}

// Silueta de oreja derecha: hélix (contorno con la muesca del trago), antihélix
// y concha. La izquierda es la misma trazada en espejo.
const OUTER =
  "M30 6 C47 4 56 17 55 34 C54 46 51 55 47 62 C44 68 45 76 39 81 C32 86 25 82 26 74 C27 68 24 66 22 63 C18 58 25 54 21 48 C17 38 10 31 12 21 C15 9 19 6 30 6 Z";
const ANTIHELIX = "M42 15 C31 18 26 29 28 41 C29 50 34 56 35 63";
const CONCHA = "M41 33 C33 35 31 46 37 52 C40 55 44 52 45 48";

function EarOutline({ mirrored }: { mirrored: boolean }) {
  return (
    <svg
      viewBox="0 0 64 88"
      className="absolute inset-0 h-full w-full text-ink/30"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <g transform={mirrored ? "scale(-1,1) translate(-64,0)" : undefined}>
        <path d={OUTER} />
        <path d={ANTIHELIX} className="text-ink/25" />
        <path d={CONCHA} className="text-ink/25" />
      </g>
    </svg>
  );
}

type Props = {
  value: string[];
  onChange?: (v: string[]) => void;
  readOnly?: boolean;
};

export function EarPicker({ value, onChange, readOnly = false }: Props) {
  const selected = new Set(value);

  const toggle = (key: string) => {
    if (readOnly || !onChange) return;
    onChange(selected.has(key) ? value.filter((k) => k !== key) : [...value, key]);
  };

  return (
    <div>
      <div className="flex justify-center gap-8">
        {(["izq", "der"] as Ear[]).map((ear) => (
          <div key={ear} className="flex flex-col items-center">
            <div className="relative h-40 aspect-[8/11]">
              <EarOutline mirrored={ear === "izq"} />
              {EAR_SPOTS.filter((s) => s.ear === ear).map((s) => {
                const on = selected.has(s.key);
                const at = pos(ear, s.level);
                const dot = cn(
                  "absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-colors",
                  on
                    ? "border-gold-dark bg-gold shadow-sm"
                    : readOnly
                      ? "border-ink/15 bg-white"
                      : "border-ink/30 bg-white hover:border-gold hover:bg-gold/20",
                );
                return readOnly ? (
                  <span key={s.key} className={dot} style={at} title={s.label} />
                ) : (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => toggle(s.key)}
                    aria-pressed={on}
                    aria-label={s.label}
                    title={s.label}
                    style={at}
                    className={cn(dot, "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-gold")}
                  />
                );
              })}
            </div>
            <p className="mt-2 text-xs uppercase tracking-wider text-muted">{EAR_LABEL[ear]}</p>
          </div>
        ))}
      </div>

      {!readOnly && (
        <p className="mt-4 text-center text-xs text-muted">
          Toca los puntos donde se colocó el arete: {LEVEL_LABEL.alta}, {LEVEL_LABEL.medio} o {LEVEL_LABEL.lobulo}.
        </p>
      )}
      <p className="mt-2 text-center text-sm text-ink">
        <span className="text-muted">Seleccionado: </span>
        {spotsSummary(value)}
      </p>
    </div>
  );
}
