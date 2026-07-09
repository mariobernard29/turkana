"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

// Carrusel editorial con cambio automático (cross-fade, sin flechas).
export function HeroCarousel({ images, interval = 5000 }: { images: string[]; interval?: number }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;
    const t = setInterval(() => setActive((p) => (p + 1) % images.length), interval);
    return () => clearInterval(t);
  }, [images.length, interval]);

  return (
    <div className="absolute inset-0">
      {images.map((src, i) => (
        <Image
          key={src}
          src={src}
          alt="Turkana Jewelry"
          fill
          priority={i === 0}
          loading={i === 0 ? undefined : "eager"}
          quality={90}
          sizes="(max-width: 768px) 100vw, 60vw"
          className={`object-cover transition-opacity duration-1000 ease-in-out ${i === active ? "opacity-100" : "opacity-0"}`}
        />
      ))}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
        {images.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all duration-500 ${i === active ? "w-5 bg-white" : "w-1.5 bg-white/50"}`}
          />
        ))}
      </div>
    </div>
  );
}
