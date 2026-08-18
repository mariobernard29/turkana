"use client";

// Alta masiva del catálogo: descarga la plantilla (con el catálogo actual, que
// sirve de ejemplo) e importa el mismo archivo con las filas nuevas.
//
// La importación va en tandas: el servidor lee el archivo una vez y devuelve los
// productos agrupados, y de aquí se le mandan de regreso de poco en poco. Con el
// catálogo completo en una sola llamada, la función del servidor se pasaba del
// límite de tiempo y moría a media carga sin decir nada.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Upload, Loader2 } from "lucide-react";
import {
  exportProductsExcel, parseProductsExcel, importProductsChunk, logProductsImport,
  type ImportSummary,
} from "@/app/admin/productos/excel-actions";

// Productos por llamada. Suficientes para que no sean cientos de viajes y pocos
// para que ninguna llamada se acerque al límite de tiempo del servidor.
const TANDA = 25;

type Progreso = { hechos: number; total: number };

export function ProductsExcel() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<(ImportSummary & { filas: number }) | null>(null);
  const [progreso, setProgreso] = useState<Progreso | null>(null);

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
    setBusy("import"); setError(null); setSummary(null); setProgreso(null);
    try {
      const buf = await file.arrayBuffer();
      // Se manda en base64 para no depender de multipart en la acción de servidor.
      let binary = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }

      const leido = await parseProductsExcel(btoa(binary));
      if (!leido.ok) { setError(leido.error ?? "No se pudo leer el archivo"); return; }

      const total = leido.productos.length;
      setProgreso({ hechos: 0, total });

      const acc: ImportSummary & { filas: number } = {
        creados: 0, actualizados: 0, sinCambios: 0, variantesNuevas: 0,
        piezasCargadas: 0, categoriasCreadas: [], avisos: [...leido.avisos],
        filas: leido.filas,
      };

      for (let i = 0; i < total; i += TANDA) {
        const tanda = leido.productos.slice(i, i + TANDA);
        const res = await importProductsChunk(tanda);
        if (!res.ok) {
          // Lo que ya entró se queda: se avisa dónde se quedó para poder
          // reanudar volviendo a subir el mismo archivo.
          setSummary(acc);
          setError(`${res.error ?? "Error"} — se alcanzaron a dar de alta ${i} de ${total} productos. Vuelve a subir el archivo para continuar.`);
          return;
        }
        acc.creados += res.creados;
        acc.actualizados += res.actualizados;
        acc.sinCambios += res.sinCambios;
        acc.variantesNuevas += res.variantesNuevas;
        acc.piezasCargadas += res.piezasCargadas;
        acc.categoriasCreadas.push(...res.categoriasCreadas);
        acc.avisos.push(...res.avisos);
        setProgreso({ hechos: Math.min(i + TANDA, total), total });
      }

      await logProductsImport(acc, acc.filas);
      setSummary(acc);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo importar");
    } finally {
      setBusy(null);
      setProgreso(null);
    }
  };

  const pct = progreso && progreso.total > 0
    ? Math.round((progreso.hechos / progreso.total) * 100)
    : 0;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={download}
          disabled={busy !== null}
          title="Plantilla con las columnas a llenar y el catálogo actual de ejemplo"
          className="inline-flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2.5 text-sm text-ink hover:border-gold disabled:opacity-50"
        >
          {busy === "export" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Descargar plantilla
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

      <p className="mt-2 max-w-md text-xs text-muted">
        Una fila por talla, cada una con su propio código: las filas que comparten el
        nombre son el mismo producto. La columna <strong>Inventario tienda</strong> deja
        las piezas que hay (vacía = no se toca); es el almacén único, así que sirven
        igual al mostrador y a la web. Los productos entran <strong>activos</strong> —se pueden cobrar
        en el POS de inmediato— y ocultos en la tienda web hasta que los publiques.
      </p>

      {progreso && (
        <div className="mt-4 max-w-md">
          <div className="mb-1.5 flex items-baseline justify-between text-xs text-muted">
            <span>Dando de alta el catálogo…</span>
            <span className="tabular-nums">{progreso.hechos} de {progreso.total} productos</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-cream">
            <div
              className="h-full rounded-full bg-gold transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            No cierres esta pestaña. Si se interrumpe, vuelve a subir el mismo archivo:
            continúa donde se quedó y no duplica nada.
          </p>
        </div>
      )}

      {error && <p className="mt-3 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}

      {summary && (
        <div className="mt-3 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          <p>
            <strong>{summary.creados}</strong> producto(s) nuevo(s) ·{" "}
            <strong>{summary.actualizados}</strong> actualizado(s) ·{" "}
            <strong>{summary.sinCambios}</strong> sin cambios
            {summary.variantesNuevas > 0 && <> · <strong>{summary.variantesNuevas}</strong> talla(s) nueva(s)</>}
            {summary.piezasCargadas > 0 && <> · inventario cargado en <strong>{summary.piezasCargadas}</strong> talla(s)</>}
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
