"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Upload, Trash2, ChevronUp, ChevronDown, Loader2, Check } from "lucide-react";
import { brandImageUrl } from "@/lib/utils";
import { uploadImage, removeImages } from "@/lib/upload";

type SaveResult = { ok: boolean; error?: string };

// Manager reutilizable de una lista ordenada de imágenes (bucket brand).
export function ImageListManager({
  title,
  help,
  folder,
  initialPaths,
  save,
}: {
  title: string;
  help: string;
  folder: string;
  initialPaths: string[];
  save: (paths: string[]) => Promise<SaveResult>;
}) {
  const [paths, setPaths] = useState<string[]>(initialPaths);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = JSON.stringify(paths) !== JSON.stringify(initialPaths);

  const handleFiles = async (files: FileList | File[]) => {
    setUploading(true);
    setError(null);
    setSaved(false);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const path = await uploadImage(folder, file);
        setPaths((p) => [...p, path]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error subiendo la imagen");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (i: number) => {
    const path = paths[i];
    setPaths((p) => p.filter((_, idx) => idx !== i));
    setSaved(false);
    await removeImages([path]).catch(() => {});
  };

  const move = (i: number, dir: -1 | 1) => {
    setPaths((p) => {
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      const next = [...p];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setSaved(false);
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    const res = await save(paths);
    setSaving(false);
    if (!res.ok) { setError(res.error ?? "No se pudo guardar"); return; }
    setSaved(true);
  };

  return (
    <section className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
      <h2 className="text-lg text-ink">{title}</h2>
      <p className="mt-1 text-sm text-muted">{help}</p>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink/15 bg-cream/40 py-8 text-center transition-colors hover:border-gold"
      >
        {uploading ? <Loader2 className="h-6 w-6 animate-spin text-gold" /> : <Upload className="h-6 w-6 text-gold" strokeWidth={1.5} />}
        <p className="text-sm text-muted">{uploading ? "Subiendo…" : "Arrastra imágenes o haz clic para subir"}</p>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
      </div>

      {paths.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {paths.map((path, i) => (
            <div key={path} className="group relative overflow-hidden rounded-xl border border-ink/10 bg-sand">
              <div className="relative aspect-[3/2]">
                <Image src={brandImageUrl(path)} alt="" fill sizes="200px" className="object-cover" />
              </div>
              <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-1 bg-gradient-to-b from-black/40 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="flex gap-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir" className="rounded bg-white/90 p-1 text-ink disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === paths.length - 1} aria-label="Bajar" className="rounded bg-white/90 p-1 text-ink disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
                </div>
                <button type="button" onClick={() => remove(i)} aria-label="Quitar" className="rounded bg-white/90 p-1 text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              {i === 0 && <span className="absolute bottom-1 left-1 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-cream">Primera</span>}
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
