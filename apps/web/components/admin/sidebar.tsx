"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Gem,
  Package,
  ShoppingBag,
  Users,
  Ticket,
  Wallet,
  BarChart3,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/productos", label: "Productos", icon: Gem },
  { href: "/admin/inventario", label: "Inventario", icon: Package },
  { href: "/admin/pedidos", label: "Pedidos", icon: ShoppingBag },
  { href: "/admin/clientes", label: "Clientes", icon: Users },
  { href: "/admin/rewards", label: "Rewards", icon: Ticket },
  { href: "/pos", label: "Punto de venta", icon: Wallet },
  { href: "/admin/reportes", label: "Reportes", icon: BarChart3 },
  { href: "/admin/ajustes", label: "Ajustes", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col bg-ink px-4 py-8 text-cream md:flex">
      <div className="mb-10 px-3">
        <p className="font-serif text-2xl leading-none text-white">Turkana</p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-gold">Admin</p>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-gold/20 text-gold"
                  : "text-cream/60 hover:bg-white/5 hover:text-cream",
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.5} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
