import Link from "next/link";
import { LogOut } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { PosBootstrap } from "@/components/pos/pos-bootstrap";

export const metadata = { title: "Turkana POS" };

export default async function PosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await requireStaff("/pos");

  return (
    <div className="flex h-screen flex-col bg-[#e6e2da]">
      <header className="flex items-center justify-between bg-ink px-5 py-3 text-cream">
        <div className="flex flex-col leading-none">
          <span className="font-serif text-xl tracking-wide text-white">TURKANA</span>
          <span className="mt-0.5 text-[10px] uppercase tracking-[0.3em] text-gold">POS</span>
        </div>
        <div className="flex items-center gap-4">
          <PosBootstrap />
          <span className="text-sm text-cream/70">{staff.fullName}</span>
          <Link href="/admin" className="text-xs uppercase tracking-wider text-cream/50 transition-colors hover:text-cream">
            Admin
          </Link>
          <form action={logout}>
            <button type="submit" className="flex items-center gap-1.5 text-sm text-cream/60 transition-colors hover:text-cream">
              <LogOut className="h-4 w-4" strokeWidth={1.5} /> Salir
            </button>
          </form>
        </div>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
