import Link from "next/link";
import Image from "next/image";
import { ProductCard, type CatalogProduct } from "@/components/shop/product-card";
import { Reveal } from "@/components/shop/reveal";

export type FeaturedCollection = {
  slug: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
};

export function FeaturedCollectionSection({
  collection,
  products,
}: {
  collection: FeaturedCollection;
  products: CatalogProduct[];
}) {
  const href = `/coleccion/${collection.slug}`;

  return (
    <section className="mx-auto max-w-6xl px-6 py-16 md:py-20">
      <Reveal className="mb-10 text-center">
        <Link href={href} className="group inline-block">
          <p className="text-xs uppercase tracking-[0.3em] text-gold">Colección destacada</p>
          <h2 className="mt-2 font-serif text-3xl text-ink transition-colors sm:text-4xl group-hover:text-gold-dark">
            {collection.title}
          </h2>
          {collection.subtitle && (
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">{collection.subtitle}</p>
          )}
        </Link>
        <span className="mx-auto mt-4 block h-px w-16 bg-gold/50" />
      </Reveal>

      <div className="grid gap-6 md:grid-cols-2">
        <Reveal>
          <Link href={href} className="group relative block aspect-[4/5] overflow-hidden rounded-2xl bg-sand">
            {collection.imageUrl ? (
              <Image
                src={collection.imageUrl}
                alt={collection.title}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover transition-transform duration-700 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs uppercase tracking-widest text-muted">
                Turkana
              </div>
            )}
          </Link>
        </Reveal>

        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6">
          {products.map((p, idx) => (
            <Reveal key={p.slug} delay={idx * 80}>
              <ProductCard product={p} />
            </Reveal>
          ))}
        </div>
      </div>

      <div className="mt-12 text-center">
        <Link
          href={href}
          className="inline-block rounded-full border border-ink/20 px-8 py-3 text-sm uppercase tracking-widest text-ink transition-colors hover:border-gold hover:bg-gold hover:text-cream"
        >
          Ver más
        </Link>
      </div>
    </section>
  );
}
