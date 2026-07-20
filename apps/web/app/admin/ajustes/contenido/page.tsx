import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { getHomeContent, updateHeroImages, getFeaturedCollectionContent } from "../content-actions";
import { ImageListManager } from "@/components/admin/image-list-manager";
import { CollectionManager } from "@/components/admin/collection-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contenido — Turkana Admin" };

export default async function ContentSettingsPage() {
  const staff = await requireStaff();
  const isAdmin = ["super_admin", "admin"].includes(staff.role ?? "");

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <BackLink />
        <p className="rounded-2xl border border-ink/10 bg-white p-6 text-sm text-muted shadow-sm">
          La edición de contenido está disponible solo para administradores.
        </p>
      </div>
    );
  }

  const [{ heroPaths }, featuredCollection] = await Promise.all([
    getHomeContent(),
    getFeaturedCollectionContent(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <BackLink />
        <h1 className="mt-2 text-3xl text-ink">Contenido de inicio</h1>
        <p className="mt-1 text-sm text-muted">Administra el carrusel principal (hero) y la colección destacada de la página de inicio.</p>
      </div>

      <ImageListManager
        title="Carrusel principal (hero)"
        help="Imágenes grandes del inicio. Tamaño recomendado 1600 × 1200 px (4:3), JPG, menos de 400 KB. Deja el sujeto al centro (se recorta según la pantalla). Si no subes ninguna, se usan las imágenes por defecto."
        folder="hero"
        initialPaths={heroPaths}
        save={updateHeroImages}
      />

      <CollectionManager initial={featuredCollection} />
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/admin/ajustes" className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink">
      <ArrowLeft className="h-4 w-4" /> Ajustes
    </Link>
  );
}
