import Link from "next/link";
import { Ticket, Sparkles, Gift } from "lucide-react";

const BENEFITS = [
  { icon: Ticket, title: "Descuentos exclusivos", desc: "Cupones y promociones especiales reservados solo para miembros." },
  { icon: Sparkles, title: "Lo nuevo, primero", desc: "Entérate de nuestras nuevas piezas y colecciones antes que nadie." },
  { icon: Gift, title: "Sorpresas y recompensas", desc: "Beneficios, regalos y eventos pensados a tu medida todo el año." },
];

export function RewardsSection() {
  return (
    <section id="rewards" className="relative overflow-hidden bg-[#14110c] px-6 py-20 text-cream md:py-28">
      {/* halo dorado sutil */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-gold/15 blur-3xl" />

      <div className="relative mx-auto max-w-3xl text-center">
        <p className="text-[11px] uppercase tracking-[0.35em] text-gold">Programa de lealtad</p>
        <h2 className="mt-4 font-serif text-3xl leading-tight sm:text-4xl md:text-5xl">
          El privilegio de brillar
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-cream/70 sm:text-base">
          <span className="text-gold">Turkana Rewards</span> es gratis. Únete y vive la exclusividad:
          descuentos especiales solo para miembros, acceso anticipado a nuevas piezas y sorpresas
          diseñadas a tu medida.
        </p>
      </div>

      <div className="relative mx-auto mt-16 grid max-w-4xl gap-12 sm:grid-cols-3">
        {BENEFITS.map((b) => (
          <div key={b.title} className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-gold/40 bg-gold/5">
              <b.icon className="h-7 w-7 text-gold" strokeWidth={1.25} />
            </div>
            <h3 className="mt-6 font-serif text-xl text-cream">{b.title}</h3>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-cream/60">{b.desc}</p>
          </div>
        ))}
      </div>

      <div className="relative mt-16 text-center">
        <Link
          href="/rewards/acceso"
          className="inline-block rounded-full bg-gold px-10 py-3.5 text-sm uppercase tracking-widest text-ink transition-colors hover:bg-cream"
        >
          Únete a Turkana Rewards
        </Link>
      </div>
    </section>
  );
}
