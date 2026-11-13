"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search, User } from "lucide-react";
import { AnnouncementBar } from "@/components/shop/announcement-bar";
import { CartBadge } from "@/components/shop/cart-badge";

// Encabezado que se encoge al bajar.
//
// Antes era una barra de alto fijo. Ahora, pasados los primeros 40px, el logo se
// achica y el aire se reduce: la primera pantalla se ve amplia y el resto del
// recorrido gana sitio para las piezas, que es lo que se vino a ver. El cambio
// es de medio segundo y nadie lo registra como "animación" — sólo se siente que
// la página responde.
export function ShopHeader() {
  const [compacto, setCompacto] = useState(false);

  useEffect(() => {
    const onScroll = () => setCompacto(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const enlace = "turkana-underline transition-colors hover:text-ink";

  return (
    <header
      className={`sticky top-0 z-40 border-b bg-cream/85 backdrop-blur transition-colors duration-500 ${
        compacto ? "border-ink/10" : "border-transparent"
      }`}
    >
      <AnnouncementBar />
      <div
        className={`mx-auto flex max-w-6xl items-center justify-between px-4 transition-[padding] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] sm:px-6 ${
          compacto ? "py-2.5 sm:py-3" : "py-4 sm:py-5"
        }`}
      >
        <nav className="hidden gap-8 text-xs uppercase tracking-[0.2em] text-muted md:flex">
          <Link href="/tienda" className={enlace}>Tienda</Link>
          <Link href="/rewards" className={enlace}>Rewards</Link>
        </nav>

        <Link href="/" className="md:absolute md:left-1/2 md:-translate-x-1/2">
          <Image
            src="/turkana-logo.png"
            alt="Turkana Jewelry"
            width={170}
            height={49}
            priority
            className={`w-auto transition-[height] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              compacto ? "h-7 sm:h-8" : "h-9 sm:h-11"
            }`}
          />
        </Link>

        <div className="flex items-center gap-4 text-xs uppercase tracking-[0.2em] text-muted">
          <Link href="/buscar" aria-label="Buscar" className="transition-colors hover:text-gold">
            <Search className="h-5 w-5" strokeWidth={1.5} />
          </Link>
          <Link href="/rewards" className={`${enlace} md:hidden`}>Rewards</Link>
          <Link href="/rewards/cuenta" aria-label="Mi cuenta" className="transition-colors hover:text-gold">
            <User className="h-5 w-5" strokeWidth={1.5} />
          </Link>
          <CartBadge />
        </div>
      </div>
    </header>
  );
}
