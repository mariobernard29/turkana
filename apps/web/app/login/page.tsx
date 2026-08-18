import Image from "next/image";
import Link from "next/link";
import { StaffLoginForm } from "@/components/staff-login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; error?: string }>;
}) {
  const { error, redirect } = await searchParams;
  const errorMsg = error && error !== "{}" ? error : error === "{}"
    ? "No se pudo iniciar sesión. Verifica tus credenciales y que el Auth Hook esté configurado."
    : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Image src="/turkana-logo.png" alt="Turkana Jewelry" width={220} height={62} priority className="mx-auto h-12 w-auto" />
        <p className="mb-10 mt-3 text-center text-xs uppercase tracking-[0.3em] text-gold">
          Acceso staff
        </p>

        {errorMsg && (
          <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-center text-sm text-red-700">
            {errorMsg}
          </p>
        )}

        <StaffLoginForm redirectTo={redirect ?? "/admin"} />

        <Link href="/recuperar" className="mt-5 block text-center text-sm text-muted transition-colors hover:text-gold">
          ¿Olvidaste tu contraseña?
        </Link>
      </div>
    </main>
  );
}
