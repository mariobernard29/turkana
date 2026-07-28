"use client";

// Carga masiva del catálogo: exporta el Excel (que sirve de plantilla) e importa
// el mismo archivo con filas nuevas o corregidas.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Upload, Loader2 } from "lucide-react";
import { exportProductsExcel, importProductsExcel, type ImportSummary } from "@/app/admin/productos/excel-actions";

export function ProductsExcel() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const download = async () => {
    setBusy("export"); setError(null); setSummary(null);
    const res = await exportProductsExcel();
    setBusy(null);
    if (!res.ok || !res.fileBase64) { setError(res.error ?? "No se pudo generar el archivo"); return; }

    const bytes = Uint8Array.from(atob(res.fileBase64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }));
    const a = document.createElement("a");
    a.href = url;
    a.download = res.fileName ?? "productos.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const upload = async (file: File) => {
    setBusy("import"); setError(null); setSummary(null);
    const buf = await file.arrayBuffer();
    // Se manda en base64 para no depender de multipart en la acción de servidor.
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    const res = await importProductsExcel(btoa(binary));
    setBusy(null);
    if (!res.ok) { setError(res.error ?? "No se pudo importar"); return; }
    setSummary(res);
    router.refresh();
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={download}
          disabled={busy !== null}
          title="Descarga el catálogo actual; sirve de plantilla para cargar más"
          className="inline-flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2.5 text-sm text-ink hover:border-gold disabled:opacity-50"
        >
          {busy === "export" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Exportar Excel
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy !== null}
          title="Sube el Excel: da de alta los productos nuevos y actualiza sólo lo que cambió"
          className="inline-flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2.5 text-sm text-ink hover:border-gold disabled:opacity-50"
        >
          {busy === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Importar Excel
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = ""; // permite volver a subir el mismo archivo
            if (f) upload(f);
          }}
        />
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}

      {summary && (
        <div className="mt-3 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          <p>
            <strong>{summary.creados}</strong> producto(s) nuevo(s) ·{" "}
            <strong>{summary.actualizados}</strong> actualizado(s) ·{" "}
            <strong>{summary.sinCambios}</strong> sin cambios
            {summary.variantesNuevas > 0 && <> · <strong>{summary.variantesNuevas}</strong> talla(s) nueva(s)</>}
          </p>
          {summary.categoriasCreadas.length > 0 && (
            <p className="mt-1 text-xs">Categorías creadas: {summary.categoriasCreadas.join(", ")}</p>
          )}
          {summary.avisos.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-xs text-amber-800">
              {summary.avisos.slice(0, 10).map((a, i) => <li key={i}>{a}</li>)}
              {summary.avisos.length > 10 && <li>… y {summary.avisos.length - 10} aviso(s) más</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
