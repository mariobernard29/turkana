"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/asistencia", label: "Resumen" },
  { href: "/admin/asistencia/reportes", label: "Reportes" },
  { href: "/admin/asistencia/personal", label: "Personal y horarios" },
  { href: "/admin/asistencia/ajustes", label: "Ajustes" },
];

export function AttendanceTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-2">
      {TABS.map((t) => {
        const active = t.href === "/admin/asistencia" ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm transition-colors",
              active ? "bg-ink text-cream" : "bg-white text-muted shadow-sm hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
