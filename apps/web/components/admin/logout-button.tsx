"use client";

import { LogOut } from "lucide-react";
import { logout } from "@/app/login/actions";

export function LogoutButton() {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:text-ink"
        title="Cerrar sesión"
      >
        <LogOut className="h-4 w-4" strokeWidth={1.5} />
        Salir
      </button>
    </form>
  );
}
