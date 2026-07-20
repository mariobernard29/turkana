import Link from "next/link";
import Image from "next/image";
import { Ticket, Sparkles, Gift, UserPlus, Gem } from "lucide-react";
import { ShopHeader } from "@/components/shop/header";
import { ShopFooter } from "@/components/shop/footer";

export const metadata = { title: "Turkana Rewards — Únete al club" };

const BENEFITS = [
  { icon: Ticket, title: "Descuentos exclusivos", desc: "Cupones y promociones especiales reservados solo para miembros." },
  { icon: Sparkles, title: "Lo nuevo, primero", desc: "Entérate de nuestras nuevas piezas y colecciones antes que nadie." },
  { icon: Gift, title: "Sorpresas y recompensas", desc: "Beneficios, regalos y eventos pensados a tu medida todo el año." },
];

const STEPS = [
  { n: "01", t: "Crea tu cuenta", d: "Regístrate gratis con tu correo en menos de un minuto." },
  { n: "02", t: "Compra como siempre", d: "En tienda o en línea, tu cuenta acumula tus beneficios automáticamente." },
  { n: "03", t: "Disfruta tus recompensas", d: "Recibe cupones, acceso anticipado y sorpresas directo a tu correo." },
];

export default function RewardsMarketingPage() {
  return (
    <div className="min-h-screen">
      <ShopHeader />

      {/* Hero */}
      <section className="relative overflow-hidden bg-[#14110c] px-6 py-20 text-center text-cream md:py-28">
        <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-gold/15 blur-3xl" />
        <div className="relative mx-auto max-w-2xl">
          <Image
            src="/turkana-rewards.png"
            alt="Turkana Rewards"
            width={260}
            height={74}
            priority
            className="mx-auto h-12 w-auto"
          />
          <h1 className="mt-6 font-serif text-4xl leading-tight sm:text-5xl">El privilegio de brillar</h1>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-cream/70 sm:text-base">
            <span className="text-gold">Turkana Rewards</span> es gratis. Únete y vive la exclusividad:
            descuentos especiales solo para miembros, acceso anticipado a nuevas piezas y sorpresas
            diseñadas a tu medida.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/rewards/acceso"
              className="inline-flex items-center gap-2 rounded-full bg-gold px-10 py-3.5 text-sm uppercase tracking-widest text-ink transition-colors hover:bg-cream"
            >
              <UserPlus className="h-4 w-4" /> Crear cuenta / Iniciar sesión
            </Link>
            <a
              href="#beneficios"
              className="inline-block rounded-full border border-cream/30 px-10 py-3.5 text-sm uppercase tracking-widest text-cream transition-colors hover:border-gold hover:text-gold"
            >
              Ver beneficios
            </a>
          </div>
        </div>
      </section>

      {/* Beneficios */}
      <section id="beneficios" className="mx-auto max-w-4xl px-6 py-16 md:py-24">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-gold">Programa de lealtad</p>
          <h2 className="mt-2 font-serif text-3xl text-ink sm:text-4xl">Beneficios de ser miembro</h2>
          <span className="mx-auto mt-4 block h-px w-16 bg-gold/50" />
        </div>
        <div className="mt-14 grid gap-12 sm:grid-cols-3">
          {BENEFITS.map((b) => (
            <div key={b.title} className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-gold/40 bg-gold/5">
                <b.icon className="h-7 w-7 text-gold" strokeWidth={1.25} />
              </div>
              <h3 className="mt-6 font-serif text-xl text-ink">{b.title}</h3>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="border-y border-gold/20 px-6 py-16 md:py-20" style={{ background: "linear-gradient(90deg,#faf8f5 0%,#f4ecd9 50%,#faf8f5 100%)" }}>
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-gold">Así de fácil</p>
          <h2 className="mt-2 font-serif text-3xl text-ink sm:text-4xl">Cómo funciona</h2>
        </div>
        <div className="mx-auto mt-12 grid max-w-4xl gap-10 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="text-center">
              <span className="font-serif text-4xl text-gold/50">{s.n}</span>
              <h3 className="mt-3 text-lg text-ink">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="px-6 py-16 text-center md:py-24">
        <Gem className="mx-auto h-8 w-8 text-gold" strokeWidth={1.25} />
        <h2 className="mt-4 font-serif text-2xl text-ink sm:text-3xl">Únete a Turkana Rewards</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
          Es gratis y toma menos de un minuto. Crea tu cuenta o inicia sesión para empezar a disfrutar tus beneficios.
        </p>
        <Link
          href="/rewards/acceso"
          className="mt-8 inline-block rounded-full bg-ink px-10 py-3.5 text-sm uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark"
        >
          Crear cuenta / Iniciar sesión
        </Link>
      </section>

      <ShopFooter />
    </div>
  );
}
