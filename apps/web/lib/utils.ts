import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Formatea centavos MXN a moneda.
export function formatMXN(cents: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(cents / 100);
}

// URL pública de una imagen en el bucket product-images.
export function productImageUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
}

// URL pública de una imagen en el bucket brand (hero, banners, marketing).
export function brandImageUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/brand/${path}`;
}

// IVA: los precios se guardan y muestran con IVA INCLUIDO. Esta función
// desglosa un total para mostrarlo en tickets/facturas (base + IVA).
export const IVA_RATE = 0.16;
export function ivaBreakdown(totalCents: number) {
  const base = Math.round(totalCents / (1 + IVA_RATE));
  return { base, iva: totalCents - base, total: totalCents };
}
