import { requireStaff } from "@/lib/auth";
import { Sidebar } from "@/components/admin/sidebar";
import { LogoutButton } from "@/components/admin/logout-button";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Administrador",
  gerente: "Gerente",
  cajero: "Cajero",
  inventarios: "Inventarios",
  atencion: "Atención al Cliente",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await requireStaff();

  return (
    <div className="flex min-h-screen bg-[#e6e2da]">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-ink/10 bg-white px-6 py-4 shadow-sm">
          <div className="md:hidden">
            <span className="font-serif text-xl tracking-wide text-ink">TURKANA</span>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm text-ink">{staff.fullName}</p>
              <p className="text-[11px] uppercase tracking-wider text-gold">
                {staff.role ? ROLE_LABEL[staff.role] ?? staff.role : ""}
              </p>
            </div>
            <LogoutButton />
          </div>
        </header>
        <main className="flex-1 p-6 md:p-10">{children}</main>
      </div>
    </div>
  );
}
