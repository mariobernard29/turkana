"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";

export type BannerCarouselSlide = { url: string; link: string | null };

// Banner promocional full-width con auto-cambio (cross-fade). El texto viene
// dentro de la imagen; cada slide puede enlazar a una ruta/URL.
export function BannerCarousel({ slides, interval = 6000 }: { slides: BannerCarouselSlide[]; interval?: number }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const t = setInterval(() => setActive((p) => (p + 1) % slides.length), interval);
    return () => clearInterval(t);
  }, [slides.length, interval]);

  if (!slides.length) return null;

  return (
    <div className="relative aspect-[3/2] w-full overflow-hidden sm:aspect-[21/9] lg:aspect-[16/5]">
      {slides.map((s, i) => {
        const img = (
          <Image
            src={s.url}
            alt="Promoción Turkana"
            fill
            priority={i === 0}
            quality={90}
            sizes="100vw"
            className={`object-cover transition-opacity duration-1000 ease-in-out ${i === active ? "opacity-100" : "opacity-0"}`}
          />
        );
        return (
          <div key={s.url} className={`absolute inset-0 ${i === active ? "z-10" : "z-0"}`}>
            {s.link ? (
              <Link href={s.link} className="block h-full w-full" aria-label="Ver promoción">{img}</Link>
            ) : (
              img
            )}
          </div>
        );
      })}
      {slides.length > 1 && (
        <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Ir al banner ${i + 1}`}
              onClick={() => setActive(i)}
              className={`h-1.5 rounded-full transition-all duration-500 ${i === active ? "w-5 bg-white" : "w-1.5 bg-white/50"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
