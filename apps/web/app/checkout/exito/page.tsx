import Link from "next/link";
import { ShopHeader } from "@/components/shop/header";
import { ShopFooter } from "@/components/shop/footer";
import { ClearCart } from "@/components/shop/clear-cart";

export const metadata = { title: "¡Gracias por tu compra! — Turkana Jewelry" };

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  return (
    <div className="min-h-screen">
      <ShopHeader />
      <ClearCart />
      <main className="mx-auto flex max-w-2xl flex-col items-center px-6 py-24 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-3xl text-green-600">
          ✓
        </div>
        <h1 className="text-4xl text-ink">¡Gracias por tu compra!</h1>
        <p className="mt-4 max-w-md text-muted">
          Recibimos tu pedido. Si pagaste con tarjeta, tu pago ya está confirmado.
          Si elegiste <strong>OXXO</strong>, revisa tu correo con el voucher para
          completar el pago en cualquier tienda.
        </p>
        {session_id && (
          <p className="mt-2 text-xs text-muted">Referencia: {session_id.slice(0, 24)}…</p>
        )}
        <Link
          href="/tienda"
          className="mt-10 rounded-full bg-ink px-8 py-3 text-sm uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark"
        >
          Seguir explorando
        </Link>
      </main>
      <ShopFooter />
    </div>
  );
}
