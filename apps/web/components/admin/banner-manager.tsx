"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Upload, Trash2, ChevronUp, ChevronDown, Loader2, Check } from "lucide-react";
import { brandImageUrl } from "@/lib/utils";
import { uploadImage, removeImages } from "@/lib/upload";
import { updateBannerSlides } from "@/app/admin/ajustes/content-actions";
import type { BannerSlide } from "@/lib/site-content";

// Manager de banners promocionales: imagen (texto incluido) + link opcional.
export function BannerManager({ initialSlides }: { initialSlides: BannerSlide[] }) {
  const [slides, setSlides] = useState<BannerSlide[]>(initialSlides.map((s) => ({ path: s.path, link: s.link ?? "" })));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = JSON.stringify(slides) !== JSON.stringify(initialSlides.map((s) => ({ path: s.path, link: s.link ?? "" })));

  const handleFiles = async (files: FileList | File[]) => {
    setUploading(true);
    setError(null);
    setSaved(false);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const path = await uploadImage("banners", file);
        setSlides((s) => [...s, { path, link: "" }]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error subiendo la imagen");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (i: number) => {
    const path = slides[i].path;
    setSlides((s) => s.filter((_, idx) => idx !== i));
    setSaved(false);
    await removeImages([path]).catch(() => {});
  };

  const move = (i: number, dir: -1 | 1) => {
    setSlides((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setSaved(false);
  };

  const setLink = (i: number, link: string) => {
    setSlides((s) => s.map((slide, idx) => (idx === i ? { ...slide, link } : slide)));
    setSaved(false);
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    const res = await updateBannerSlides(slides);
    setSaving(false);
    if (!res.ok) { setError(res.error ?? "No se pudo guardar"); return; }
    setSaved(true);
  };

  return (
    <section className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
      <h2 className="text-lg text-ink">Banners promocionales</h2>
      <p className="mt-1 text-sm text-muted">
        Aparecen como carrusel después de “Productos destacados”. El texto va dentro de la imagen.
        Tamaño recomendado <strong>1920 × 640 px</strong> (3:1), JPG/WebP, menos de 350 KB. Mantén el texto en el centro (zona segura).
      </p>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink/15 bg-cream/40 py-8 text-center transition-colors hover:border-gold"
      >
        {uploading ? <Loader2 className="h-6 w-6 animate-spin text-gold" /> : <Upload className="h-6 w-6 text-gold" strokeWidth={1.5} />}
        <p className="text-sm text-muted">{uploading ? "Subiendo…" : "Arrastra imágenes de banner o haz clic para subir"}</p>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
      </div>

      {slides.length > 0 && (
        <div className="mt-4 space-y-3">
          {slides.map((slide, i) => (
            <div key={slide.path} className="flex items-center gap-3 rounded-xl border border-ink/10 bg-cream/30 p-2">
              <div className="relative h-14 w-36 shrink-0 overflow-hidden rounded-lg bg-sand">
                <Image src={brandImageUrl(slide.path)} alt="" fill sizes="144px" className="object-cover" />
              </div>
              <input
                value={slide.link ?? ""}
                onChange={(e) => setLink(i, e.target.value)}
                placeholder="Link opcional (ej. /tienda?categoria=oro-blanco)"
                className="min-w-0 flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold"
              />
              <div className="flex shrink-0 gap-1">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir" className="rounded border border-ink/15 p-1.5 text-ink disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === slides.length - 1} aria-label="Bajar" className="rounded border border-ink/15 p-1.5 text-ink disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                <button type="button" onClick={() => remove(i)} aria-label="Quitar" className="rounded border border-ink/15 p-1.5 text-red-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || uploading || !dirty}
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
