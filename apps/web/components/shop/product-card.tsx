import Link from "next/link";
import Image from "next/image";
import { formatMXN, productImageUrl } from "@/lib/utils";

export type CatalogProduct = {
  slug: string;
  name: string;
  material: string | null;
  minPriceCents: number;
  multiplePrices: boolean;
  image: string | null;
};

export function ProductCard({ product }: { product: CatalogProduct }) {
  return (
    <Link href={`/producto/${product.slug}`} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-sand shadow-sm transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl">
        {product.image ? (
          <Image
            src={productImageUrl(product.image)}
            alt={product.name}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            className="object-cover transition-transform duration-700 group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs uppercase tracking-widest text-muted">
            Turkana
          </div>
        )}
      </div>
      <div className="mt-4 text-center">
        <h3 className="text-lg text-ink">{product.name}</h3>
        {product.material && (
          <p className="mt-0.5 text-xs uppercase tracking-wider text-gold">{product.material}</p>
        )}
        <p className="mt-2 text-sm text-muted">
          {product.multiplePrices && "Desde "}
          {formatMXN(product.minPriceCents)}
        </p>
      </div>
    </Link>
  );
}
