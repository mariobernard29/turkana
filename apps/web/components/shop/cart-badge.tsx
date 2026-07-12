"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { cartCount } from "@/lib/cart";

export function CartBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const sync = () => setCount(cartCount());
    sync();
    window.addEventListener("turkana-cart", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("turkana-cart", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return (
    <Link href="/carrito" aria-label="Bolsa" className="relative transition-colors hover:text-ink">
      <ShoppingBag className="h-5 w-5" strokeWidth={1.5} />
      {count > 0 && (
        <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-medium leading-none text-cream tabular-nums">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
