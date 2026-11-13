"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

// Carrusel editorial con cambio automático (cross-fade, sin flechas).
//
// La foto activa deriva despacio hacia adentro mientras está en pantalla
// (`turkana-drift`, 20s). Es el único movimiento de la primera pantalla y es
// deliberadamente lento: una foto fija se lee como un render; una que respira,
// como una portada. Al cambiar de imagen la clase se quita y se vuelve a poner,
// y con eso la animación arranca de cero sola.
export function HeroCarousel({ images, interval = 6500 }: { images: string[]; interval?: number }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;
    const t = setInterval(() => setActive((p) => (p + 1) % images.length), interval);
    return () => clearInterval(t);
  }, [images.length, interval]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {images.map((src, i) => (
        <div
          key={src}
          className={`absolute inset-0 transition-opacity duration-[1200ms] ease-in-out ${
            i === active ? "opacity-100" : "opacity-0"
          }`}
        >
          <Image
            src={src}
            alt="Turkana Jewelry"
            fill
            priority={i === 0}
            loading={i === 0 ? undefined : "eager"}
            quality={90}
            sizes="(max-width: 768px) 100vw, 60vw"
            className={`object-cover ${i === active ? "turkana-drift" : ""}`}
          />
        </div>
      ))}

      {/* Velo mínimo abajo: sin él los indicadores se pierden en las fotos claras. */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/20 to-transparent" />

      {/* Indicadores como rayas, no como puntos. Detalle chico, pero los puntos
          son la opción por defecto de todo carrusel y se notan como tal. */}
      <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-2.5">
        {images.map((_, i) => (
          <span
            key={i}
            className={`h-px transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              i === active ? "w-10 bg-white" : "w-4 bg-white/45"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
