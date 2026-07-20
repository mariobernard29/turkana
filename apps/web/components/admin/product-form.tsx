"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, X, Plus, Trash2, Loader2, Star, Eye, EyeOff, Package, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { slugify } from "@/lib/slug";
import { productImageUrl, cn } from "@/lib/utils";
import {
  saveProduct,
  deleteProduct,
  deleteProductImage,
  type ProductInput,
} from "@/app/admin/productos/actions";

type Option = { id: string; name: string };

type VariantState = {
  id?: string;
  talla: string;
  price: string;
  compareAt: string;
};

type ImageState = { id?: string; storage_path: string };

export type ProductFormInitial = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  short_description: string | null;
  long_description: string | null;
  material: string | null;
  stone: string | null;
  weight_grams: number | null;
  category_id: string | null;
  collection_id: string | null;
  tags: string[];
  seo_title: string | null;
  seo_description: string | null;
  status: "draft" | "active" | "archived";
  is_featured: boolean;
  hidden_online?: boolean;
  track_inventory?: boolean;
  variants: {
    id: string;
    sku: string;
    price_cents: number;
    compare_at_cents: number | null;
    attributes: Record<string, string>;
  }[];
  images: { id: string; storage_path: string }[];
};

export function ProductForm({
  initial,
  categories,
  featuredCollection,
}: {
  initial?: ProductFormInitial;
  categories: Option[];
  featuredCollection?: Option | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(initial));
  const [sku, setSku] = useState(initial?.sku ?? "");
  const [shortDesc, setShortDesc] = useState(initial?.short_description ?? "");
  const [longDesc, setLongDesc] = useState(initial?.long_description ?? "");
  const [material, setMaterial] = useState(initial?.material ?? "");
  const [stone, setStone] = useState(initial?.stone ?? "");
  const [weight, setWeight] = useState(initial?.weight_grams?.toString() ?? "");
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? "");
  const [collectionId, setCollectionId] = useState(initial?.collection_id ?? "");
  const [tags, setTags] = useState(initial?.tags?.join(", ") ?? "");
  const [seoTitle, setSeoTitle] = useState(initial?.seo_title ?? "");
  const [seoDesc, setSeoDesc] = useState(initial?.seo_description ?? "");
  const [status, setStatus] = useState<"draft" | "active" | "archived">(
    initial?.status ?? "draft",
  );
  const [isFeatured, setIsFeatured] = useState(initial?.is_featured ?? false);
  const [hiddenOnline, setHiddenOnline] = useState(initial?.hidden_online ?? false);
  const [trackInventory, setTrackInventory] = useState(initial?.track_inventory ?? true);

  const [variants, setVariants] = useState<VariantState[]>(
    initial?.variants.map((v) => ({
      id: v.id,
      talla: v.attributes?.talla ?? "",
      price: (v.price_cents / 100).toString(),
      compareAt: v.compare_at_cents ? (v.compare_at_cents / 100).toString() : "",
    })) ?? [{ talla: "", price: "", compareAt: "" }],
  );
  const [removedVariantIds, setRemovedVariantIds] = useState<string[]>([]);
  const [images, setImages] = useState<ImageState[]>(
    initial?.images.map((i) => ({ id: i.id, storage_path: i.storage_path })) ?? [],
  );

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Variantes ──────────────────────────────────────────────
  const updateVariant = (i: number, patch: Partial<VariantState>) =>
    setVariants((vs) => vs.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  const addVariant = () =>
    setVariants((vs) => [...vs, { talla: "", price: "", compareAt: "" }]);
  const removeVariant = (i: number) =>
    setVariants((vs) => {
      const v = vs[i];
      if (v.id) setRemovedVariantIds((r) => [...r, v.id!]);
      return vs.filter((_, idx) => idx !== i);
    });

  // ── Imágenes (drag & drop) ─────────────────────────────────
  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      setUploading(true);
      setError(null);
      try {
        for (const file of Array.from(files)) {
          if (!file.type.startsWith("image/")) continue;
          const ext = file.name.split(".").pop() ?? "jpg";
          const path = `products/${crypto.randomUUID()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("product-images")
            .upload(path, file, { cacheControl: "3600", upsert: false });
          if (upErr) {
            setError(`Error subiendo ${file.name}: ${upErr.message}`);
            continue;
          }
          setImages((imgs) => [...imgs, { storage_path: path }]);
        }
      } finally {
        setUploading(false);
      }
    },
    [supabase],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
  };

  const removeImage = async (i: number) => {
    const img = images[i];
    setImages((imgs) => imgs.filter((_, idx) => idx !== i));
    if (img.id) {
      await deleteProductImage(img.id, img.storage_path);
    } else {
      await supabase.storage.from("product-images").remove([img.storage_path]);
    }
  };

  // ── Guardar ────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload: ProductInput = {
      id: initial?.id,
      name,
      slug,
      sku: sku || null,
      short_description: shortDesc || null,
      long_description: longDesc || null,
      material: material || null,
      stone: stone || null,
      weight_grams: weight ? Number(weight) : null,
      category_id: categoryId || null,
      collection_id: collectionId || null,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      seo_title: seoTitle || null,
      seo_description: seoDesc || null,
      status,
      is_featured: isFeatured,
      hidden_online: hiddenOnline,
      track_inventory: trackInventory,
      variants: variants.map((v) => ({
        id: v.id,
        sku: sku.trim(), // todas las tallas comparten el código del producto
        price: Number(v.price) || 0,
        compareAt: v.compareAt ? Number(v.compareAt) : null,
        attributes: (v.talla.trim() ? { talla: v.talla.trim() } : {}) as Record<string, string>,
      })),
      images: images.map((img, idx) => ({
        id: img.id,
        storage_path: img.storage_path,
        position: idx,
      })),
      removedVariantIds,
    };

    const res = await saveProduct(payload);
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? "No se pudo guardar");
      return;
    }
    router.push("/admin/productos");
    router.refresh();
  };

  const handleDelete = async () => {
    if (!initial) return;
    if (!confirm("¿Eliminar este producto? Se ocultará del catálogo y la tienda.")) return;
    setSaving(true);
    setError(null);
    const res = await deleteProduct(initial.id);
    setSaving(false);
    if (!res.ok) { setError(res.error ?? "No se pudo eliminar"); return; }
    router.push("/admin/productos");
    router.refresh();
  };

  const input =
    "w-full rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-gold";
  const label = "mb-1.5 block text-xs uppercase tracking-wider text-muted";

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-3">
      {/* Columna principal */}
      <div className="space-y-6 lg:col-span-2">
        <Card title="Información">
          <div>
            <label className={label}>Nombre</label>
            <input
              className={input}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Slug</label>
              <input
                className={input}
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugTouched(true);
                }}
                required
              />
            </div>
            <div>
              <label className={label}>Código / SKU</label>
              <input className={input} value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Ej. 123456" required />
            </div>
          </div>
          <div>
            <label className={label}>Descripción corta</label>
            <input className={input} value={shortDesc} onChange={(e) => setShortDesc(e.target.value)} />
          </div>
          <div>
            <label className={label}>Descripción larga</label>
            <textarea
              className={cn(input, "min-h-28")}
              value={longDesc}
              onChange={(e) => setLongDesc(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={label}>Material</label>
              <input className={input} value={material} onChange={(e) => setMaterial(e.target.value)} />
            </div>
            <div>
              <label className={label}>Piedra</label>
              <input className={input} value={stone} onChange={(e) => setStone(e.target.value)} />
            </div>
            <div>
              <label className={label}>Peso (g)</label>
              <input
                className={input}
                type="number"
                step="0.01"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </div>
          </div>
        </Card>

        {/* Tallas */}
        <Card
          title="Tallas"
          action={
            <button type="button" onClick={addVariant} className="flex items-center gap-1 text-sm text-gold hover:text-gold-dark">
              <Plus className="h-4 w-4" /> Agregar talla
            </button>
          }
        >
          <p className="-mt-2 mb-2 text-xs text-muted">
            Todas las tallas comparten el código del producto. El stock se administra en Inventario.
            Si el producto <strong>no maneja tallas</strong>, deja una sola fila con la talla vacía.
          </p>
          <div className="space-y-3">
            {variants.map((v, i) => (
              <div key={i} className="rounded-xl border border-ink/10 p-3">
                <div className="grid gap-2 sm:grid-cols-12">
                  <input
                    className={cn(input, "sm:col-span-4")}
                    placeholder="Talla (ej. 7)"
                    value={v.talla}
                    onChange={(e) => updateVariant(i, { talla: e.target.value })}
                  />
                  <input
                    className={cn(input, "sm:col-span-3")}
                    placeholder="Precio"
                    type="number"
                    step="0.01"
                    value={v.price}
                    onChange={(e) => updateVariant(i, { price: e.target.value })}
                    required
                  />
                  <input
                    className={cn(input, "sm:col-span-3")}
                    placeholder="Antes (opcional)"
                    type="number"
                    step="0.01"
                    value={v.compareAt}
                    onChange={(e) => updateVariant(i, { compareAt: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => removeVariant(i)}
                    className="flex items-center justify-center rounded-lg text-muted hover:text-red-600 sm:col-span-2"
                    title="Quitar talla"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Imágenes */}
        <Card title="Imágenes">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-ink/15 bg-cream/50 py-10 text-center transition-colors hover:border-gold"
          >
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin text-gold" />
            ) : (
              <UploadCloud className="h-7 w-7 text-muted" strokeWidth={1.5} />
            )}
            <p className="mt-2 text-sm text-muted">
              Arrastra imágenes aquí o haz clic para subir
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && uploadFiles(e.target.files)}
            />
          </div>

          {images.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {images.map((img, i) => (
                <div key={img.storage_path} className="group relative aspect-square overflow-hidden rounded-lg border border-ink/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={productImageUrl(img.storage_path)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-ink opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  {i === 0 && (
                    <span className="absolute bottom-1 left-1 rounded-full bg-ink/80 px-2 py-0.5 text-[10px] text-cream">
                      Principal
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Columna lateral */}
      <div className="space-y-6">
        <Card title="Publicación">
          <div>
            <label className={label}>Estado</label>
            <select className={input} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="draft">Borrador</option>
              <option value="active">Activo</option>
              <option value="archived">Archivado</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => setIsFeatured((f) => !f)}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-lg border py-2.5 text-sm transition-colors",
              isFeatured ? "border-gold bg-gold/10 text-gold-dark" : "border-ink/15 text-muted",
            )}
          >
            <Star className="h-4 w-4" fill={isFeatured ? "currentColor" : "none"} />
            {isFeatured ? "Destacado" : "Marcar como destacado"}
          </button>
          {featuredCollection && (
            <button
              type="button"
              onClick={() => setCollectionId((v) => (v ? "" : featuredCollection.id))}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-lg border py-2.5 text-sm transition-colors",
                collectionId === featuredCollection.id ? "border-gold bg-gold/10 text-gold-dark" : "border-ink/15 text-muted",
              )}
            >
              <Sparkles className="h-4 w-4" fill={collectionId === featuredCollection.id ? "currentColor" : "none"} />
              {collectionId === featuredCollection.id ? `En ${featuredCollection.name}` : `Agregar a ${featuredCollection.name}`}
            </button>
          )}
          <button
            type="button"
            onClick={() => setHiddenOnline((v) => !v)}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-lg border py-2.5 text-sm transition-colors",
              hiddenOnline ? "border-ink bg-ink/5 text-ink" : "border-ink/15 text-muted",
            )}
          >
            {hiddenOnline ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {hiddenOnline ? "Oculto en tienda web (solo POS)" : "Visible en tienda web"}
          </button>
          <button
            type="button"
            onClick={() => setTrackInventory((v) => !v)}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-lg border py-2.5 text-sm transition-colors",
              trackInventory ? "border-ink/15 text-muted" : "border-gold bg-gold/10 text-gold-dark",
            )}
          >
            <Package className="h-4 w-4" />
            {trackInventory ? "Con control de inventario" : "Sin control de inventario"}
          </button>
        </Card>

        <Card title="Organización">
          <div>
            <label className={label}>Categoría</label>
            <select className={input} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Etiquetas (separadas por coma)</label>
            <input className={input} value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
        </Card>

        <Card title="SEO">
          <div>
            <label className={label}>Título SEO</label>
            <input className={input} value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} />
          </div>
          <div>
            <label className={label}>Descripción SEO</label>
            <textarea className={cn(input, "min-h-20")} value={seoDesc} onChange={(e) => setSeoDesc(e.target.value)} />
          </div>
        </Card>

        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={saving || uploading}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3 text-sm uppercase tracking-widest text-cream transition-colors hover:bg-gold-dark disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {initial ? "Guardar cambios" : "Crear producto"}
        </button>

        {initial && (
          <div className="rounded-2xl border border-red-100 bg-red-50/40 p-4">
            <p className="mb-2 text-xs uppercase tracking-wider text-muted">Zona de riesgo</p>
            <p className="mb-3 text-xs text-muted">
              Para <strong>suspender</strong> el producto, cambia su estado a “Archivado” arriba.
              Para retirarlo del catálogo, elimínalo.
            </p>
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="w-full rounded-full border border-red-300 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              Eliminar producto
            </button>
          </div>
        )}
      </div>
    </form>
  );
}

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-ink/10 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg text-ink">{title}</h2>
        {action}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
