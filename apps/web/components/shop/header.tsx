import Link from "next/link";
import Image from "next/image";
import { Search } from "lucide-react";
import { AnnouncementBar } from "@/components/shop/announcement-bar";
import { CartBadge } from "@/components/shop/cart-badge";

export function ShopHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-cream/80 backdrop-blur">
      <AnnouncementBar />
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 sm:py-5">
        <nav className="hidden gap-8 text-xs uppercase tracking-[0.2em] text-muted md:flex">
          <Link href="/tienda" className="transition-colors hover:text-ink">Tienda</Link>
          <Link href="/rewards" className="transition-colors hover:text-ink">Rewards</Link>
        </nav>
        <Link href="/" className="md:absolute md:left-1/2 md:-translate-x-1/2">
          <Image src="/turkana-logo.png" alt="Turkana Jewelry" width={170} height={49} priority className="h-9 w-auto sm:h-11" />
        </Link>
        <div className="flex items-center gap-4 text-xs uppercase tracking-[0.2em] text-muted">
          <Link href="/buscar" aria-label="Buscar" className="transition-colors hover:text-ink">
            <Search className="h-5 w-5" strokeWidth={1.5} />
          </Link>
          <Link href="/rewards" className="transition-colors hover:text-ink md:hidden">Rewards</Link>
          <CartBadge />
        </div>
      </div>
    </header>
  );
}
