"use client";

import { useEffect, useRef, useState } from "react";

// Dispara una vez cuando el elemento entra a la pantalla. Lo comparten los tres
// componentes de abajo para no poner tres observadores distintos a hacer lo mismo.
function useEnterView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Sin movimiento: aparece y ya. Nada de esperar a un observador.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { setShown(true); io.disconnect(); }
      },
      { threshold: 0.12, rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return { ref, shown };
}

// Anima el contenido (fade + slide) cuando entra al viewport.
export function Reveal({
  children,
  className = "",
  delay = 0,
  from = "bottom",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  from?: "bottom" | "left" | "right";
}) {
  const { ref, shown } = useEnterView<HTMLDivElement>();
  const offset =
    from === "left" ? "translateX(-28px)" : from === "right" ? "translateX(28px)" : "translateY(28px)";

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : offset,
        transition: `opacity 0.7s ease ${delay}ms, transform 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// Titular que entra palabra por palabra. Es lo que hace que un encabezado se
// sienta compuesto y no pegado: el ojo lo lee mientras aparece, en vez de
// encontrárselo entero de golpe como el resto del bloque.
//
// Cada palabra va en un <span> con overflow oculto y la de adentro sube desde
// abajo, así el texto parece salir de debajo de su propia línea.
export function Words({
  text,
  className = "",
  delay = 0,
  stagger = 70,
  as: Tag = "span",
}: {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
  as?: "h1" | "h2" | "h3" | "span" | "p";
}) {
  const { ref, shown } = useEnterView<HTMLElement>();
  const words = text.split(" ");

  return (
    <Tag ref={ref as React.Ref<never>} className={className}>
      {words.map((w, i) => (
        <span key={`${w}-${i}`} className="inline-block overflow-hidden align-bottom">
          <span
            className="inline-block"
            style={{
              transform: shown ? "none" : "translateY(105%)",
              opacity: shown ? 1 : 0,
              transition: `transform 0.75s cubic-bezier(0.22,1,0.36,1) ${delay + i * stagger}ms, opacity 0.5s ease ${delay + i * stagger}ms`,
            }}
          >
            {w}
          </span>
          {i < words.length - 1 && " "}
        </span>
      ))}
    </Tag>
  );
}

// La regla de oro bajo los encabezados. Antes era un guion fijo idéntico en las
// cuatro secciones; ahora se dibuja sola al entrar, que es la diferencia entre
// un adorno repetido y un gesto.
export function Rule({ className = "", delay = 220, align = "center" }: { className?: string; delay?: number; align?: "center" | "left" }) {
  const { ref, shown } = useEnterView<HTMLSpanElement>();

  return (
    <span
      ref={ref}
      aria-hidden
      className={`block h-px w-16 bg-gold/60 ${align === "center" ? "mx-auto" : ""} ${className}`}
      style={{
        transform: shown ? "scaleX(1)" : "scaleX(0)",
        transformOrigin: align === "center" ? "center" : "left",
        transition: `transform 0.9s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
      }}
    />
  );
}
