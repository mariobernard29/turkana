import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Convención Next 16 (reemplaza a middleware.ts): refresca la sesión de Supabase.
export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Todas las rutas salvo estáticos e imágenes.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
