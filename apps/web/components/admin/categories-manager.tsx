"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Trash2, Check, Eye, EyeOff } from "lucide-react";
import { createCategory, updateCategory, deleteCategory } from "@/app/admin/catalogo/actions";
import { cn } from "@/lib/utils";

type Cat = { id: string; name: string; slug: string; parent_id: string | null; hidden_online: boolean };

export function CategoriesManager({ categories }: { categories: Cat[] }) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setError(null); setBusy(true);
    const res = await createCategory({ name: newName, parentId: newParent || null });
    setBusy(false);
    if (!res.ok) { setError(res.error ?? "Error"); return; }
    setNewName(""); setNewParent("");
    router.refresh();
  };

  const field = "rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end gap-2 rounded-2xl border border-ink/10 bg-white p-4">
        <div className="flex-1">
          <label className="mb-1 block text-xs uppercase tracking-wider text-muted">Nueva categoría</label>
          <input className={`${field} w-full`} placeholder="Ej. Anillos" value={newName} onChange={(e) => setNewName(e.target.value)} />
        </div>
        <select className={field} value={newParent} onChange={(e) => setNewParent(e.target.value)}>
          <option value="">Sin categoría padre</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={add} disabled={busy || !newName.trim()} className="flex items-center gap-2 rounded-full bg-ink px-6 py-2 text-sm uppercase tracking-widest text-cream hover:bg-gold-dark disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Agregar
        </button>
      </div>
      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}

      <div className="space-y-2">
        {categories.length === 0 && <p className="py-8 text-center text-sm text-muted">Sin categorías.</p>}
        {categories.map((c) => <Row key={c.id} cat={c} all={categories} />)}
      </div>
    </div>
  );
}

function Row({ cat, all }: { cat: Cat; all: Cat[] }) {
  const router = useRouter();
  const [name, setName] = useState(cat.name);
  const [parentId, setParentId] = useState(cat.parent_id ?? "");
  const [hidden, setHidden] = useState(cat.hidden_online);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = name !== cat.name || parentId !== (cat.parent_id ?? "") || hidden !== cat.hidden_online;
  const field = "rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold";

  const save = async () => {
    setBusy(true);
    const res = await updateCategory({ id: cat.id, name, parentId: parentId || null, hiddenOnline: hidden });
    setBusy(false);
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 1500); router.refresh(); }
  };
  const remove = async () => {
    if (!confirm(`¿Eliminar la categoría "${cat.name}"?`)) return;
    setBusy(true);
    await deleteCategory(cat.id);
    router.refresh();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ink/10 bg-white p-3">
      <input className={`${field} flex-1`} value={name} onChange={(e) => setName(e.target.value)} />
      <select className={field} value={parentId} onChange={(e) => setParentId(e.target.value)}>
        <option value="">Sin padre</option>
        {all.filter((x) => x.id !== cat.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      <span className="text-xs text-muted">/{cat.slug}</span>
      <button
        type="button"
        onClick={() => setHidden((v) => !v)}
        title={hidden ? "Oculta en tienda online" : "Visible en tienda online"}
        className={cn("flex items-center gap-1 rounded-full border px-3 py-2 text-xs", hidden ? "border-ink bg-ink/5 text-ink" : "border-ink/15 text-muted hover:border-gold")}
      >
        {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        {hidden ? "Oculta" : "Visible"}
      </button>
      <button onClick={save} disabled={busy || !dirty} className="flex items-center gap-1 rounded-full border border-ink/15 px-4 py-2 text-xs text-ink hover:border-gold disabled:opacity-40">
        {saved ? <Check className="h-3.5 w-3.5 text-green-600" /> : "Guardar"}
      </button>
      <button onClick={remove} disabled={busy} className="text-muted hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
    </div>
  );
}
