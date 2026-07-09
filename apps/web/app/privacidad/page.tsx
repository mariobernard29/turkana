import { ShopHeader } from "@/components/shop/header";
import { ShopFooter } from "@/components/shop/footer";

export const metadata = { title: "Aviso de Privacidad — Turkana Jewelry" };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen">
      <ShopHeader />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-4xl text-ink">Aviso de Privacidad</h1>
        <p className="mt-3 text-sm text-muted">Última actualización: {new Date().getFullYear()}</p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-ink/80">
          <section>
            <h2 className="mb-2 text-xl text-ink">Responsable</h2>
            <p>
              Turkana Jewelry, con domicilio en Blvrd Canuto Ibarra Guerrero 1700,
              El Dorado, 81278 Los Mochis, Sinaloa (Plaza Alcazar Business Park),
              es responsable del tratamiento de tus datos personales conforme a la
              Ley Federal de Protección de Datos Personales en Posesión de los
              Particulares.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl text-ink">Datos que recabamos</h2>
            <p>
              Nombre, apellidos, correo electrónico, teléfono y domicilio de envío.
              Para pagos en línea, los datos de tu tarjeta son procesados directamente
              por nuestro proveedor de pagos (Stripe); <strong>Turkana no almacena
              números de tarjeta ni datos sensibles de pago</strong>.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl text-ink">Finalidades</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Procesar y enviar tus pedidos.</li>
              <li>Gestionar el programa de lealtad Turkana Rewards.</li>
              <li>Brindar atención al cliente y seguimiento de compras.</li>
              <li>Enviarte comunicaciones sobre tu pedido.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-xl text-ink">Derechos ARCO</h2>
            <p>
              Puedes ejercer tus derechos de Acceso, Rectificación, Cancelación u
              Oposición, así como revocar tu consentimiento, escribiéndonos a
              <a href="mailto:contacto@turkanajewerly.com" className="text-gold"> contacto@turkanajewerly.com</a>.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl text-ink">Seguridad</h2>
            <p>
              Implementamos medidas de seguridad administrativas, técnicas y físicas
              para proteger tus datos. Los pagos cumplen el estándar PCI a través de
              Stripe.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl text-ink">Cambios</h2>
            <p>
              Cualquier modificación a este aviso será publicada en esta página.
            </p>
          </section>
        </div>
      </main>
      <ShopFooter />
    </div>
  );
}
