// Refresca la sesión de Supabase en cada request (mantiene cookies al día).
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANTE: getUser() valida la sesión y refresca el token si hace falta.
  const { data: { user } } = await supabase.auth.getUser();

  // Proteger rutas de admin y POS (staff): requieren sesión → /login.
  const path = request.nextUrl.pathname;
  if ((path.startsWith("/admin") || path.startsWith("/pos")) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", path);
    return NextResponse.redirect(url);
  }

  // Proteger el panel de cliente Rewards → /rewards/acceso.
  if (path.startsWith("/rewards") && !path.startsWith("/rewards/acceso") && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/rewards/acceso";
    return NextResponse.redirect(url);
  }

  return response;
}
