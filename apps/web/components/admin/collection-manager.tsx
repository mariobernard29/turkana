"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Upload, Trash2, Loader2, Check } from "lucide-react";
import { brandImageUrl } from "@/lib/utils";
import { uploadImage, removeImages } from "@/lib/upload";
import { updateFeaturedCollectionContent, type CollectionContent } from "@/app/admin/ajustes/content-actions";

export function CollectionManager({ initial }: { initial: CollectionContent | null }) {
  if (!initial) {
    return (
      <section className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg text-ink">Colección destacada</h2>
        <p className="mt-2 text-sm text-muted">
          Todavía no hay ninguna colección creada. Crea una fila en la tabla <code>collections</code> (por ejemplo
          “Cocktail Collection”) para poder administrarla aquí.
        </p>
      </section>
    );
  }
  return <CollectionManagerForm initial={initial} />;
}

function CollectionManagerForm({ initial }: { initial: CollectionContent }) {
  const [name, setName] = useState(initial.name);
  const [homeTitle, setHomeTitle] = useState(initial.home_title ?? "");
  const [homeSubtitle, setHomeSubtitle] = useState(initial.home_subtitle ?? "");
  const [homeImage, setHomeImage] = useState(initial.home_image_url);
  const [heroImage, setHeroImage] = useState(initial.hero_image_url);
  const [uploading, setUploading] = useState<"home" | "hero" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const homeFileRef = useRef<HTMLInputElement>(null);
  const heroFileRef = useRef<HTMLInputElement>(null);

  const dirty =
    name !== initial.name ||
    homeTitle !== (initial.home_title ?? "") ||
    homeSubtitle !== (initial.home_subtitle ?? "") ||
    homeImage !== initial.home_image_url ||
    heroImage !== initial.hero_image_url;

  const handleUpload = async (slot: "home" | "hero", file: File) => {
    setUploading(slot);
    setError(null);
    setSaved(false);
    try {
      const prevPath = slot === "home" ? homeImage : heroImage;
      const path = await uploadImage("collections", file);
      if (slot === "home") setHomeImage(path);
      else setHeroImage(path);
      if (prevPath) await removeImages([prevPath]).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error subiendo la imagen");
    } finally {
      setUploading(null);
    }
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    const res = await updateFeaturedCollectionContent({
      id: initial.id,
      name,
      home_title: homeTitle,
      home_subtitle: homeSubtitle,
      home_image_url: homeImage,
      hero_image_url: heroImage,
    });
    setSaving(false);
    if (!res.ok) { setError(res.error ?? "No se pudo guardar"); return; }
    setSaved(true);
  };

  const input = "w-full rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-gold";
  const label = "mb-1.5 block text-xs uppercase tracking-wider text-muted";

  return (
    <section className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
      <h2 className="text-lg text-ink">Colección destacada</h2>
      <p className="mt-1 text-sm text-muted">
        Aparece en la home entre “Productos destacados” y “Perforaciones”, y tiene su propia página en{" "}
        <code>/coleccion/{initial.slug}</code>. Los productos se asignan desde cada producto en “Productos”.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Nombre de la colección</label>
          <input className={input} value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} />
        </div>
        <div>
          <label className={label}>Título en la home</label>
          <input className={input} value={homeTitle} onChange={(e) => { setHomeTitle(e.target.value); setSaved(false); }} placeholder={name} />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Subtítulo en la home</label>
          <input className={input} value={homeSubtitle} onChange={(e) => { setHomeSubtitle(e.target.value); setSaved(false); }} />
        </div>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <ImageSlot
          title="Portada en la home"
          help="Imagen vertical, proporción 4:5 (como una foto de Instagram). Recomendado 1080 × 1350 px."
          path={homeImage}
          uploading={uploading === "home"}
          fileRef={homeFileRef}
          onPick={(f) => handleUpload("home", f)}
          onRemove={() => { if (homeImage) removeImages([homeImage]).catch(() => {}); setHomeImage(null); setSaved(false); }}
          aspect="aspect-[4/5]"
        />
        <ImageSlot
          title="Banner de la página de la colección"
          help="Imagen ancha, proporción 3:1. Recomendado 1920 × 640 px."
          path={heroImage}
          uploading={uploading === "hero"}
          fileRef={heroFileRef}
          onPick={(f) => handleUpload("hero", f)}
          onRemove={() => { if (heroImage) removeImages([heroImage]).catch(() => {}); setHeroImage(null); setSaved(false); }}
          aspect="aspect-[3/1]"
        />
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || uploading !== null || !dirty}
          className="flex items-center gap-2 rounded-full bg-ink px-6 py-2.5 text-sm uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark disabled:opacity-40"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar
        </button>
        {saved && !dirty && <span className="flex items-center gap-1 text-sm text-green-600"><Check className="h-4 w-4" /> Guardado</span>}
      </div>
    </section>
  );
}

function ImageSlot({
  title,
  help,
  path,
  uploading,
  fileRef,
  onPick,
  onRemove,
  aspect,
}: {
  title: string;
  help: string;
  path: string | null;
  uploading: boolean;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onPick: (file: File) => void;
  onRemove: () => void;
  aspect: string;
}) {
  return (
    <div>
      <p className="mb-1 text-sm text-ink">{title}</p>
      <p className="mb-3 text-xs text-muted">{help}</p>
      {path ? (
        <div className={`group relative ${aspect} overflow-hidden rounded-xl border border-ink/10 bg-sand`}>
          <Image src={brandImageUrl(path)} alt={title} fill sizes="400px" className="object-cover" />
          <button
            type="button"
            onClick={onRemove}
            className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 text-ink opacity-0 transition-opacity group-hover:opacity-100"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onPick(f); }}
          onClick={() => fileRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink/15 bg-cream/40 ${aspect} text-center transition-colors hover:border-gold`}
        >
          {uploading ? <Loader2 className="h-6 w-6 animate-spin text-gold" /> : <Upload className="h-6 w-6 text-gold" strokeWidth={1.5} />}
          <p className="px-4 text-xs text-muted">{uploading ? "Subiendo…" : "Arrastra una imagen o haz clic"}</p>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }}
      />
    </div>
  );
}
