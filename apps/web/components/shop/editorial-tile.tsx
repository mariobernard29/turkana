import Image from "next/image";

// Mosaico editorial ancho para intercalar entre productos en /tienda.
export function EditorialTile({ src }: { src: string }) {
  return (
    <div className="relative h-full overflow-hidden rounded-xl bg-sand shadow-sm">
      <div className="relative aspect-[16/10] h-full">
        <Image src={src} alt="Turkana Jewelry" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
      </div>
    </div>
  );
}
