import Image from "next/image";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; error?: string }>;
}) {
  const { error } = await searchParams;
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

        <form action={login} className="space-y-4">
          <RedirectField searchParams={searchParams} />
          <input
            name="email"
            type="email"
            required
            placeholder="Correo"
            className="w-full rounded-lg border border-ink/15 bg-white px-4 py-3 text-sm outline-none focus:border-gold"
          />
          <input
            name="password"
            type="password"
            required
            placeholder="Contraseña"
            className="w-full rounded-lg border border-ink/15 bg-white px-4 py-3 text-sm outline-none focus:border-gold"
          />
          <button
            type="submit"
            className="w-full rounded-full bg-ink py-3 text-sm uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark"
          >
            Entrar
          </button>
        </form>
      </div>
    </main>
  );
}

async function RedirectField({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;
  return <input type="hidden" name="redirect" value={redirect ?? "/admin"} />;
}
