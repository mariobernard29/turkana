"use client";

// Botón que pide el PDF al servidor y lo baja. El archivo llega en base64
// (mismo camino que la plantilla de Excel del catálogo) y aquí se vuelve un
// Blob para que el navegador lo guarde con su nombre.
//
// Los parámetros viajan sueltos y no como una función ya armada: desde un
// componente de servidor sólo se puede pasar la acción misma, no un cierre
// alrededor de ella.
import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { kpiReportPdf, piecesReportPdf } from "@/app/admin/reportes/pdf-actions";
import type { PiecesFilters, Range } from "@/lib/reports";

type Props = {
  kind: "kpis" | "piezas";
  range: Range;
  desde?: string;
  hasta?: string;
  filters?: PiecesFilters;
  label?: string;
};

export function ReportPdfButton({ kind, range, desde, hasta, filters, label }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = kind === "kpis"
        ? await kpiReportPdf(range, desde, hasta)
        : await piecesReportPdf(range, desde, hasta, filters ?? {});

      if (!res.ok || !res.fileBase64) {
        setError(res.error ?? "No se pudo generar el PDF");
        return;
      }

      const bytes = Uint8Array.from(atob(res.fileBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = res.fileName ?? "reporte.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el PDF");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-full border border-ink/15 bg-white px-5 py-2 text-sm text-ink transition-colors hover:border-gold disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
        {busy ? "Armando PDF…" : (label ?? "Descargar PDF")}
      </button>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
