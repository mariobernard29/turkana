import { ShopHeader } from "@/components/shop/header";
import { ShopFooter } from "@/components/shop/footer";

export const metadata = { title: "Términos y Condiciones — Turkana Jewelry" };

export default function TermsPage() {
  return (
    <div className="min-h-screen">
      <ShopHeader />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-4xl text-ink">Términos y Condiciones</h1>
        <p className="mt-3 text-sm text-muted">Última actualización: {new Date().getFullYear()}</p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-ink/80">
          <section>
            <h2 className="mb-2 text-xl text-ink">1. Aceptación</h2>
            <p>
              Al utilizar este sitio, realizar una compra o crear una cuenta de Turkana
              Rewards, aceptas estos Términos y Condiciones y nuestro Aviso de Privacidad.
              Si no estás de acuerdo, te pedimos no utilizar el sitio.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl text-ink">2. Compras y precios</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Todos los precios están en pesos mexicanos (MXN) e incluyen IVA.</li>
              <li>Las piezas están sujetas a disponibilidad de inventario.</li>
              <li>Nos reservamos el derecho de cancelar pedidos con información incorrecta o sospecha de fraude.</li>
              <li>Los pagos en línea se procesan de forma segura mediante Stripe; Turkana no almacena datos de tarjetas.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-xl text-ink">3. Envíos y devoluciones</h2>
            <p>
              Los tiempos y costos de envío, así como el monto para envío gratis, se muestran al
              finalizar la compra. Para cambios, acude a la sucursal o contáctanos; aplican
              condiciones según el estado de la pieza.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl text-ink">4. Programa Turkana Rewards</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>La membresía es gratuita, personal e intransferible. Al registrarte formas parte del programa de beneficios de Turkana.</li>
              <li>Como miembro puedes recibir cupones de descuento, promociones exclusivas, acceso anticipado a nuevas piezas e información de eventos, enviados a tu correo o publicados en nuestros canales.</li>
              <li>Cada cupón o promoción tiene la vigencia y las condiciones que se indiquen en el mismo; no son acumulables entre sí salvo que se especifique, y no tienen valor en efectivo ni son canjeables por dinero.</li>
              <li>Los beneficios están sujetos a disponibilidad y pueden variar. Turkana puede modificar o dar por terminado el programa, así como cualquier cupón o promoción, notificándolo en este sitio.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-xl text-ink">5. Uso indebido y cancelación de beneficios</h2>
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
              En caso de <strong>sospecha de uso indebido, fraude, manipulación o transferencia
              de beneficios</strong> entre cuentas o a terceros, Turkana Jewelry se reserva el
              derecho de <strong>cancelar los cupones y beneficios, suspender o cancelar la cuenta</strong>
              de Turkana Rewards, sin previo aviso y sin responsabilidad alguna.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl text-ink">6. Cuenta de cliente</h2>
            <p>
              Eres responsable de mantener la confidencialidad de tu contraseña y de la
              actividad realizada en tu cuenta. Notifícanos ante cualquier uso no autorizado.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl text-ink">7. Contacto</h2>
            <p>
              Dudas sobre estos términos: <a href="mailto:contacto@turkanajewerly.com" className="text-gold">contacto@turkanajewerly.com</a>.
              Sucursal: Plaza Alcazar Business Park, Los Mochis, Sinaloa.
            </p>
          </section>
        </div>
      </main>
      <ShopFooter />
    </div>
  );
}
