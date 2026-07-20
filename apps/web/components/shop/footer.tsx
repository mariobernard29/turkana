import Link from "next/link";
import Image from "next/image";
import { Instagram, Facebook, Phone, Clock } from "lucide-react";

const MAPS_URL =
  "https://www.google.com/maps/search/?api=1&query=Plaza+Alcazar+Business+Park+Los+Mochis";
const INSTAGRAM = "https://instagram.com/turkana.mx";
const FACEBOOK = "https://facebook.com/turkana.mx";

export function ShopFooter() {
  return (
    <footer className="mt-20 border-t border-ink/10 bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Image src="/turkana-logo.png" alt="Turkana Jewelry" width={150} height={43} className="h-9 w-auto" />
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Únete al Club <span className="text-gold">Turkana Rewards</span> y disfruta descuentos
            exclusivos, acceso anticipado y sorpresas para miembros.
          </p>
          <Link
            href="/rewards"
            className="mt-4 inline-block rounded-full border border-ink/20 px-5 py-2 text-xs uppercase tracking-widest text-ink transition-colors hover:border-gold hover:bg-gold hover:text-cream"
          >
            Únete al club
          </Link>
        </div>

        <div>
          <h3 className="mb-4 text-xs uppercase tracking-[0.2em] text-gold">Tienda</h3>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link href="/tienda" className="hover:text-ink">Toda la colección</Link></li>
            <li><Link href="/tienda?categoria=anillos" className="hover:text-ink">Anillos</Link></li>
            <li><Link href="/tienda?categoria=collares" className="hover:text-ink">Collares</Link></li>
            <li><Link href="/tienda?categoria=pulseras" className="hover:text-ink">Pulseras</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="mb-4 text-xs uppercase tracking-[0.2em] text-gold">Atención</h3>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link href="/privacidad" className="hover:text-ink">Aviso de privacidad</Link></li>
            <li><Link href="/terminos" className="hover:text-ink">Términos y condiciones</Link></li>
            <li><span>Envío gratis desde $1,999</span></li>
            <li><span>Pagos seguros · Tarjeta y OXXO</span></li>
            <li><a href={MAPS_URL} target="_blank" rel="noopener noreferrer" className="hover:text-ink">Ubicación</a></li>
          </ul>
        </div>

        <div>
          <h3 className="mb-4 text-xs uppercase tracking-[0.2em] text-gold">Síguenos</h3>
          <p className="mb-3 text-sm text-muted">@turkana.mx</p>
          <div className="mb-4 flex gap-3">
            <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/15 text-ink transition-colors hover:border-gold hover:text-gold">
              <Instagram className="h-4 w-4" />
            </a>
            <a href={FACEBOOK} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/15 text-ink transition-colors hover:border-gold hover:text-gold">
              <Facebook className="h-4 w-4" />
            </a>
          </div>
          <a href="tel:+526682410761" className="flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink">
            <Phone className="h-4 w-4 text-gold" /> 668 241 0761
          </a>
          <div className="mt-4 flex items-start gap-2 text-sm text-muted">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <div>
              <p>Lun a Vie · 10:00 — 21:00</p>
              <p>Sáb y Dom · 11:00 — 20:00</p>
            </div>
          </div>
        </div>
      </div>

      {/* Formas de pago */}
      <div className="border-t border-ink/10 px-6 py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-3">
          {["visa", "mastercard", "amex", "applepay", "googlepay", "oxxo"].map((p) => (
            <Image key={p} src={`/payments/${p}.svg`} alt={p} width={38} height={24} className="h-6 w-auto object-contain" />
          ))}
        </div>
      </div>

      <div className="border-t border-ink/10 px-6 py-6 text-center text-xs text-muted">
        © {new Date().getFullYear()} Turkana Jewelry · Todos los derechos reservados · Precios con IVA incluido
      </div>
    </footer>
  );
}
