import Link from "next/link";
import Image from "next/image";
import { Truck, ShieldCheck, Gem, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ShopHeader } from "@/components/shop/header";
import { ShopFooter } from "@/components/shop/footer";
import { ProductCard, type CatalogProduct } from "@/components/shop/product-card";
import { HeroCarousel } from "@/components/shop/hero-carousel";
import { RewardsSection } from "@/components/shop/rewards-section";
import { PiercingSection } from "@/components/shop/piercing-section";
import { Reveal } from "@/components/shop/reveal";

export const dynamic = "force-dynamic";

const MAPS_URL = "https://www.google.com/maps/search/?api=1&query=Plaza+Alcazar+Business+Park+Los+Mochis";
const INSTAGRAM = "https://instagram.com/turkana.mx";

async function loadFeatured(): Promise<CatalogProduct[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("products")
      .select("name, slug, material, is_featured, product_variants(price_cents, is_active), product_images(storage_path, position)")
      .eq("status", "active")
      .eq("hidden_online", false)
      .is("deleted_at", null)
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(4);
    type R = { name: string; slug: string; material: string | null; product_variants: { price_cents: number; is_active: boolean }[]; product_images: { storage_path: string; position: number }[] };
    return ((data as unknown as R[]) ?? [])
      .map((p): CatalogProduct | null => {
        const prices = (p.product_variants ?? []).filter((v) => v.is_active).map((v) => v.price_cents);
        if (!prices.length) return null;
        const image = [...(p.product_images ?? [])].sort((a, b) => a.position - b.position)[0];
        return { slug: p.slug, name: p.name, material: p.material, minPriceCents: Math.min(...prices), multiplePrices: new Set(prices).size > 1, image: image?.storage_path ?? null };
      })
      .filter((p): p is CatalogProduct => p !== null);
  } catch {
    return [];
  }
}

export default async function Home() {
  const featured = await loadFeatured();

  return (
    <div className="min-h-screen overflow-x-hidden">
      <ShopHeader />

      {/* Hero editorial */}
      <section className="grid items-stretch md:grid-cols-2">
        <div className="order-2 flex flex-col items-center justify-center bg-cream px-6 py-14 text-center md:order-1 md:py-24">
          <p className="text-[11px] uppercase tracking-[0.35em] text-gold">Los Mochis · Sinaloa</p>
          <h1 className="mt-5 max-w-md font-serif text-4xl leading-tight text-ink sm:text-5xl md:text-6xl">
            Define tu estilo
          </h1>
          <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-ink/80 sm:text-base">
            Elegancia, sofisticación y feminidad refinada. Piezas atemporales, hechas para perdurar.
          </p>
          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:justify-center">
            <Link href="/tienda" className="rounded-full bg-ink px-8 py-3 text-sm uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark">Encuentra tu joya</Link>
            <Link href="/rewards" className="rounded-full border border-ink/20 px-8 py-3 text-sm uppercase tracking-widest text-ink transition-colors hover:border-gold hover:text-gold">Turkana Rewards</Link>
          </div>
        </div>
        <div className="relative order-1 aspect-[16/11] md:order-2 md:aspect-auto md:min-h-[520px]">
          <HeroCarousel images={["/hero1.jpg", "/hero2.jpg", "/hero3.jpg", "/hero4.jpg", "/hero5.jpg"]} />
        </div>
      </section>

      {/* Beneficios */}
      <section className="border-y border-gold/20 px-6 py-12" style={{ background: "linear-gradient(90deg,#faf8f5 0%,#f4ecd9 50%,#faf8f5 100%)" }}>
        <div className="mx-auto grid max-w-5xl gap-8 text-center sm:grid-cols-3">
          {[
            { i: Truck, t: "Envíos a todo México", d: "Gratis en compras seleccionadas" },
            { i: ShieldCheck, t: "Garantía Turkana", d: "Autenticidad en cada pieza" },
            { i: Gem, t: "Lujo accesible", d: "Tarjeta, OXXO y pagos seguros" },
          ].map((b) => (
            <div key={b.t} className="flex flex-col items-center transition-transform duration-300 hover:-translate-y-1">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/15 text-gold"><b.i className="h-5 w-5" strokeWidth={1.5} /></span>
              <h3 className="mt-3 text-lg text-ink">{b.t}</h3>
              <p className="mt-1 text-sm text-muted">{b.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Productos destacados */}
      <section className="mx-auto max-w-6xl px-6 py-16 md:py-20">
        <Reveal className="mb-10 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-gold">Selección</p>
          <h2 className="mt-2 font-serif text-3xl text-ink sm:text-4xl">Productos destacados</h2>
          <span className="mx-auto mt-4 block h-px w-16 bg-gold/50" />
        </Reveal>
        {featured.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4">
            {featured.map((p, idx) => <Reveal key={p.slug} delay={idx * 80}><ProductCard product={p} /></Reveal>)}
          </div>
        ) : (
          <p className="text-center text-muted">Marca productos como “destacados” en el admin para mostrarlos aquí.</p>
        )}
        <div className="mt-12 text-center">
          <Link href="/tienda" className="inline-block rounded-full border border-ink/20 px-8 py-3 text-sm uppercase tracking-widest text-ink transition-colors hover:border-gold hover:bg-gold hover:text-cream">Ver todo</Link>
        </div>
      </section>

      {/* Turkana Rewards */}
      <RewardsSection />

      {/* Perforaciones */}
      <PiercingSection />

      {/* Instagram */}
      <section className="px-6 py-16 text-center md:py-20">
        <Reveal>
          <p className="text-xs uppercase tracking-[0.3em] text-gold">@turkana.mx</p>
          <h2 className="mt-2 font-serif text-2xl text-ink sm:text-3xl">Síguenos en Instagram</h2>
        </Reveal>
        <div className="mx-auto mt-10 grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {["01", "02", "03", "04"].map((n, idx) => (
            <Reveal key={n} delay={idx * 80}>
              <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer" className="group relative block aspect-[4/5] overflow-hidden rounded-2xl bg-sand ring-0 ring-gold/40 transition-all duration-300 hover:ring-2">
                <Image src={`/instagram${n}.jpg`} alt="Turkana Jewelry en Instagram" fill sizes="(max-width: 640px) 50vw, 25vw" className="object-cover transition-transform duration-700 group-hover:scale-110" />
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Nuestra sucursal + ubicación */}
      <section className="border-t border-ink/5 bg-white px-6 py-16 md:py-24">
        <div className="mx-auto max-w-4xl">
          <div className="mb-10 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-gold">Visítanos</p>
            <h2 className="mt-2 text-3xl text-ink sm:text-4xl">Nuestra sucursal</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
              Blvrd Canuto Ibarra Guerrero 1700, El Dorado · Plaza Alcazar Business Park, Los Mochis, Sinaloa.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            {[
              { src: "/local-exterior.jpg", alt: "Fachada Turkana Jewelry" },
              { src: "/local-interior.jpg", alt: "Interior Turkana Jewelry" },
              { src: "/local-interior2.jpg", alt: "Interior Turkana Jewelry" },
            ].map((img, i) => (
              <div key={img.src} className={`relative aspect-[3/4] overflow-hidden rounded-2xl bg-sand ${i === 2 ? "col-span-2 sm:col-span-1" : ""}`}>
                <Image src={img.src} alt={img.alt} fill quality={85} sizes="(max-width: 640px) 50vw, 300px" className="object-cover" />
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <a href={MAPS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-ink px-8 py-3 text-sm uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark">
              <MapPin className="h-4 w-4" /> Cómo llegar
            </a>
          </div>
        </div>
      </section>

      <ShopFooter />
    </div>
  );
}
