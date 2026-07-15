import Link from "next/link";
import { Truck, Users, ShieldCheck, ImageIcon, Mail, ChevronRight } from "lucide-react";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ajustes — Turkana Admin" };

type Card = { href: string; title: string; desc: string; icon: typeof Truck; adminOnly: boolean };

const CARDS: Card[] = [
  { href: "/admin/ajustes/negocio", title: "Negocio", desc: "Envíos, límite de caja y alertas por correo.", icon: Truck, adminOnly: true },
  { href: "/admin/ajustes/contenido", title: "Contenido de inicio", desc: "Carrusel principal (hero) y banners promocionales.", icon: ImageIcon, adminOnly: true },
  { href: "/admin/ajustes/usuarios", title: "Usuarios", desc: "Personal, altas y roles del sistema.", icon: Users, adminOnly: true },
  { href: "/admin/ajustes/permisos", title: "Permisos", desc: "Qué puede hacer cada rol.", icon: ShieldCheck, adminOnly: true },
  { href: "/admin/ajustes/correo", title: "Correo", desc: "Prueba el envío de correos (Resend).", icon: Mail, adminOnly: false },
];

export default async function SettingsPage() {
  const staff = await requireStaff();
  const isAdmin = ["super_admin", "admin"].includes(staff.role ?? "");
  const cards = CARDS.filter((c) => isAdmin || !c.adminOnly);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl text-ink">Ajustes</h1>
        <p className="mt-1 text-sm text-muted">Configuración del sistema, contenido y personal.</p>
      </div>

      {!isAdmin && (
        <p className="rounded-2xl border border-ink/10 bg-white p-4 text-sm text-muted shadow-sm">
          La configuración del negocio, usuarios, permisos y contenido está disponible solo para administradores.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ href, title, desc, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-start gap-4 rounded-2xl border border-ink/10 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-gold hover:shadow-md"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
              <Icon className="h-5 w-5" strokeWidth={1.5} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <h2 className="text-base text-ink">{title}</h2>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-gold" />
              </div>
              <p className="mt-1 text-sm text-muted">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
