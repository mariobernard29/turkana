import Link from "next/link";
import Image from "next/image";
import { MapPin, Instagram } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ShopHeader } from "@/components/shop/header";
import { ShopFooter } from "@/components/shop/footer";
import { ProductCard, type CatalogProduct } from "@/components/shop/product-card";
import { HeroCarousel } from "@/components/shop/hero-carousel";
import { FeaturedCollectionSection, type FeaturedCollection } from "@/components/shop/featured-collection-section";
import { PiercingSection } from "@/components/shop/piercing-section";
import { Reveal, Words, Rule } from "@/components/shop/reveal";
import { PromiseMarquee } from "@/components/shop/marquee";
import { getHeroImages } from "@/lib/site-content";
import { brandImageUrl } from "@/lib/utils";

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

async function loadFeaturedCollection(): Promise<{ collection: FeaturedCollection; products: CatalogProduct[] } | null> {
  try {
    const supabase = await createClient();
    const { data: collectionRow } = await supabase
      .from("collections")
      .select("slug, name, home_title, home_subtitle, home_image_url")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("position", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    type CollectionRow = { slug: string; name: string; home_title: string | null; home_subtitle: string | null; home_image_url: string | null };
    const row = collectionRow as unknown as CollectionRow | null;
    if (!row) return null;

    const { data } = await supabase
      .from("products")
      .select("name, slug, material, product_variants(price_cents, is_active), product_images(storage_path, position), collections!inner(slug)")
      .eq("status", "active")
      .eq("hidden_online", false)
      .is("deleted_at", null)
      .eq("collections.slug", row.slug)
      .order("created_at", { ascending: false })
      .limit(4);
    type R = { name: string; slug: string; material: string | null; product_variants: { price_cents: number; is_active: boolean }[]; product_images: { storage_path: string; position: number }[] };
    const products = ((data as unknown as R[]) ?? [])
      .map((p): CatalogProduct | null => {
        const prices = (p.product_variants ?? []).filter((v) => v.is_active).map((v) => v.price_cents);
        if (!prices.length) return null;
        const image = [...(p.product_images ?? [])].sort((a, b) => a.position - b.position)[0];
        return { slug: p.slug, name: p.name, material: p.material, minPriceCents: Math.min(...prices), multiplePrices: new Set(prices).size > 1, image: image?.storage_path ?? null };
      })
      .filter((p): p is CatalogProduct => p !== null);

    if (products.length === 0) return null;

    return {
      collection: {
        slug: row.slug,
        title: row.home_title || row.name,
        subtitle: row.home_subtitle,
        imageUrl: row.home_image_url ? brandImageUrl(row.home_image_url) : null,
      },
      products,
    };
  } catch {
    return null;
  }
}

export default async function Home() {
  const [featured, heroImages, featuredCollection] = await Promise.all([
    loadFeatured(),
    getHeroImages(),
    loadFeaturedCollection(),
  ]);

  return (
    <div className="min-h-screen overflow-x-hidden">
      <ShopHeader />

      {/* Hero editorial.
          El texto va alineado a la izquierda y no centrado en su mitad: centrar
          los dos lados parte la pantalla en bloques simétricos y es de lo que más
          delata una plantilla. Corrido a la izquierda, la foto queda como punto
          de peso y la portada se lee en diagonal. */}
      <section className="relative grid items-stretch md:grid-cols-[0.92fr_1.08fr]">
        <div className="turkana-grain relative order-2 flex flex-col justify-center bg-cream px-6 py-14 text-center md:order-1 md:py-28 md:pl-[max(1.5rem,calc((100vw-72rem)/2))] md:pr-12 md:text-left">
          <Reveal>
            <p className="text-[0.68rem] uppercase tracking-[0.34em] text-gold">Joyería · Los Mochis</p>
          </Reveal>
          <Words
            as="h1"
            text="Define tu estilo"
            delay={120}
            className="mt-4 max-w-md font-serif text-[2.6rem] leading-[1.05] text-ink sm:text-6xl md:text-[4.2rem]"
          />
          <Reveal delay={420}>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-ink/75 sm:text-base">
              Elegancia, sofisticación y feminidad refinada. Piezas atemporales, hechas para perdurar.
            </p>
          </Reveal>
          <Reveal delay={540}>
            <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row md:justify-start">
              <Link
                href="/tienda"
                className="turkana-fill whitespace-nowrap rounded-full bg-ink px-9 py-3.5 text-center text-xs uppercase tracking-[0.2em] text-cream"
              >
                Encuentra tu joya
              </Link>
              <Link
                href="/rewards"
                className="whitespace-nowrap rounded-full border border-ink/20 px-9 py-3.5 text-center text-xs uppercase tracking-[0.2em] text-ink transition-colors hover:border-gold hover:text-gold"
              >
                Turkana Rewards
              </Link>
            </div>
          </Reveal>
        </div>
        <div className="relative order-1 aspect-[16/11] md:order-2 md:aspect-auto md:min-h-[560px]">
          <HeroCarousel images={heroImages} />
        </div>
      </section>

      <PromiseMarquee />

      {/* Productos destacados. Sin nada publicado la sección entera no se pinta:
          antes salía un recado para el admin ("marca productos como destacados…")
          en la portada, a la vista del cliente. */}
      {featured.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          {/* Encabezado a la izquierda con la liga al ras del otro extremo: rompe
              la fila de títulos centrados idénticos que se repite al bajar. */}
          <div className="mb-12 flex items-end justify-between gap-6">
            <div>
              <Reveal>
                <p className="text-[0.68rem] uppercase tracking-[0.34em] text-gold">Selección</p>
              </Reveal>
              <Words as="h2" text="Productos destacados" delay={80} className="mt-2 font-serif text-3xl text-ink sm:text-[2.6rem]" />
              <Rule align="left" className="mt-5" />
            </div>
            <Reveal delay={200} from="right" className="hidden shrink-0 sm:block">
              <Link href="/tienda" className="turkana-underline text-xs uppercase tracking-[0.2em] text-muted transition-colors hover:text-ink">
                Ver todo
              </Link>
            </Reveal>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4">
            {featured.map((p, idx) => <Reveal key={p.slug} delay={idx * 80}><ProductCard product={p} /></Reveal>)}
          </div>
          <div className="mt-12 text-center sm:hidden">
            <Link href="/tienda" className="inline-block rounded-full border border-ink/20 px-8 py-3 text-xs uppercase tracking-[0.2em] text-ink transition-colors hover:border-gold hover:text-gold">Ver todo</Link>
          </div>
        </section>
      )}

      {/* Colección destacada (administrable desde el admin) */}
      {featuredCollection && (
        <FeaturedCollectionSection collection={featuredCollection.collection} products={featuredCollection.products} />
      )}

      {/* Perforaciones */}
      <PiercingSection />

      {/* Instagram */}
      <section className="px-6 py-16 text-center md:py-20">
        <Reveal>
          <p className="text-[0.68rem] uppercase tracking-[0.34em] text-gold">@turkana.mx</p>
        </Reveal>
        <Words as="h2" text="Síguenos en Instagram" delay={80} className="mt-2 font-serif text-2xl text-ink sm:text-3xl" />
        <div className="mx-auto mt-10 grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {["01", "02", "03", "04"].map((n, idx) => (
            <Reveal key={n} delay={idx * 80}>
              <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer" className="group relative block aspect-[4/5] overflow-hidden rounded-sm bg-sand">
                <Image src={`/instagram${n}.jpg`} alt="Turkana Jewelry en Instagram" fill sizes="(max-width: 640px) 50vw, 25vw" className="object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.06]" />
                <span className="absolute inset-0 flex items-center justify-center bg-ink/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  <Instagram className="h-8 w-8 text-white" strokeWidth={1.5} />
                </span>
              </a>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Nuestra sucursal + ubicación */}
      <section className="border-t border-ink/5 bg-white px-6 py-16 md:py-24">
        <div className="mx-auto max-w-4xl">
          <div className="mb-10 text-center">
            <Reveal>
              <p className="text-[0.68rem] uppercase tracking-[0.34em] text-gold">Visítanos</p>
            </Reveal>
            <Words as="h2" text="Nuestra sucursal" delay={80} className="mt-2 font-serif text-3xl text-ink sm:text-4xl" />
            <Reveal delay={260}>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
                Blvrd Canuto Ibarra Guerrero 1700, El Dorado · Plaza Alcazar Business Park, Los Mochis, Sinaloa.
              </p>
            </Reveal>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            {[
              { src: "/local-exterior.jpg", alt: "Fachada Turkana Jewelry" },
              { src: "/local-interior.jpg", alt: "Interior Turkana Jewelry" },
              { src: "/local-interior2.jpg", alt: "Interior Turkana Jewelry" },
            ].map((img, i) => (
              <Reveal key={img.src} delay={i * 110} className={i === 2 ? "col-span-2 sm:col-span-1" : ""}>
                <div className="relative aspect-[3/4] overflow-hidden rounded-sm bg-sand">
                  <Image src={img.src} alt={img.alt} fill quality={85} sizes="(max-width: 640px) 50vw, 300px" className="object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.04]" />
                </div>
              </Reveal>
            ))}
          </div>

          <div className="mt-10 text-center">
            <a href={MAPS_URL} target="_blank" rel="noopener noreferrer" className="turkana-fill inline-flex items-center gap-2 rounded-full bg-ink px-9 py-3.5 text-xs uppercase tracking-[0.2em] text-cream">
              <MapPin className="h-4 w-4" /> Cómo llegar
            </a>
          </div>
        </div>
      </section>

      <ShopFooter />
    </div>
  );
}
