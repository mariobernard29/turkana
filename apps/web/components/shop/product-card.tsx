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

// Tarjeta de pieza.
//
// Antes la tarjeta entera se levantaba y soltaba una sombra grande al pasar el
// cursor: se ve en cualquier plantilla y le quita peso a la foto, que es lo
// único que vende aquí. Ahora el marco se queda quieto y lo que pasa es adentro
// —la imagen se acerca despacio y una línea sube desde el borde inferior—, así
// la cuadrícula no "brinca" cuando el cursor la cruza.
//
// El texto va alineado a la izquierda, no centrado: una columna de nombres
// centrados debajo de cuadros iguales es justo lo que hace que un catálogo se
// vea generado en vez de compuesto.
export function ProductCard({ product }: { product: CatalogProduct }) {
  return (
    <Link href={`/producto/${product.slug}`} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-sand">
        {product.image ? (
          <Image
            src={productImageUrl(product.image)}
            alt={product.name}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            className="object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.06]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs uppercase tracking-widest text-muted">
            Turkana
          </div>
        )}

        {/* Filo interior: le da borde a la foto sin encajonarla en una caja con sombra. */}
        <span aria-hidden className="pointer-events-none absolute inset-0 rounded-sm ring-1 ring-inset ring-ink/5" />

        {/* "Ver pieza": sube desde el borde al pasar el cursor. En celular no
            aparece (no hay hover) y tampoco hace falta: ahí se toca y ya. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 hidden translate-y-full bg-cream/95 py-2.5 text-center text-[0.65rem] uppercase tracking-[0.25em] text-ink backdrop-blur-sm transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-y-0 md:block"
        >
          Ver pieza
        </span>
      </div>

      <div className="mt-3.5">
        {/* El renglón del material se pinta siempre, vacío si la pieza no lo
            tiene: si no, en una fila donde unas lo traen y otras no, los nombres
            quedan a distinta altura y la cuadrícula se ve despareja. */}
        <p className="text-[0.62rem] uppercase tracking-[0.22em] text-gold">
          {product.material || " "}
        </p>
        <h3 className="mt-1 text-base leading-snug text-ink">{product.name}</h3>
        <p className="mt-1 text-sm text-muted">
          {product.multiplePrices && <span className="text-xs">Desde </span>}
          {formatMXN(product.minPriceCents)}
        </p>
      </div>
    </Link>
  );
}
