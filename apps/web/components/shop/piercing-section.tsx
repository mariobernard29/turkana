import Image from "next/image";
import { ShieldCheck, Sparkles, Instagram } from "lucide-react";

const WHATSAPP =
  "https://wa.me/526682410761?text=" +
  encodeURIComponent("¡Hola Turkana! ✨ Quiero agendar una cita para una perforación 💎👂 ¿Qué horarios tienen disponibles? 🗓️");

export function PiercingSection() {
  return (
    <section className="bg-cream px-6 py-16 md:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
        {/* Imagen */}
        <div className="relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-3xl bg-sand shadow-xl">
          <Image
            src="/perforaciones.jpg"
            alt="Perforaciones con aretes de acero quirúrgico"
            fill
            quality={90}
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />
        </div>

        {/* Texto */}
        <div>
          <p className="text-[11px] uppercase tracking-[0.35em] text-gold">Servicio en tienda</p>
          <h2 className="mt-3 font-serif text-3xl leading-tight text-ink sm:text-4xl md:text-5xl">
            Dale un glow up a tu estilo
          </h2>
          <p className="mt-5 text-sm leading-relaxed text-muted sm:text-base">
            Aretes de <span className="text-ink">acero quirúrgico</span> en cartuchos estériles que
            traen el arete en su interior y se aplican con una pistola especial. Un
            <span className="text-ink"> procedimiento seguro, rápido e higiénico</span>, realizado por
            profesionales.
          </p>

          <div className="mt-6 space-y-3">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-gold" strokeWidth={1.5} />
              <p className="text-sm text-muted">Acero quirúrgico hipoalergénico y cartuchos estériles de un solo uso.</p>
            </div>
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-gold" strokeWidth={1.5} />
              <p className="text-sm text-muted">Atendido por personal capacitado, en un ambiente limpio y seguro.</p>
            </div>
          </div>

          {/* Piercing party */}
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-gold/30 bg-gold/5 px-4 py-3">
            <Instagram className="mt-0.5 h-5 w-5 shrink-0 text-gold" strokeWidth={1.5} />
            <p className="text-sm text-ink">
              ¡Mantente al pendiente de nuestras redes! En cada <strong>Piercing Party</strong> las
              perforaciones van al <strong>2&times;1</strong>.
            </p>
          </div>

          <a
            href={WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-ink px-8 py-3.5 text-sm uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
              <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.717zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.017-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
            </svg>
            Agendar mi cita
          </a>
        </div>
      </div>
    </section>
  );
}
