import { ShopHeader } from "@/components/shop/header";
import { ShopFooter } from "@/components/shop/footer";
import { CheckoutForm } from "@/components/shop/checkout-form";
import { getCustomer } from "@/lib/customer";
import { getShippingSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Checkout — Turkana Jewelry" };

export default async function CheckoutPage() {
  const [customer, ship] = await Promise.all([getCustomer(), getShippingSettings()]);
  return (
    <div className="min-h-screen">
      <ShopHeader />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="mb-10 text-4xl text-ink">Finalizar compra</h1>
        <CheckoutForm
          customer={customer ? { name: customer.fullName, email: customer.email ?? "", balanceCents: customer.balanceCents } : null}
          shipping={ship}
        />
      </main>
      <ShopFooter />
    </div>
  );
}
