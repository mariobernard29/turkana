"use client";

// Imprimir (la página tiene estilos de impresión), bajar PDF y mandar por correo.
import { useState } from "react";
import { FileDown, Loader2, Mail, Printer } from "lucide-react";
import { attendancePdf, sendReportNow } from "@/app/admin/asistencia/actions";

export function AttendanceReportActions({
  fromKey,
  toKey,
  employeeId,
}: {
  fromKey: string;
  toKey: string;
  employeeId?: string;
}) {
  const [busy, setBusy] = useState<"pdf" | "mail" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const pdf = async () => {
    setBusy("pdf");
    setMsg(null);
    try {
      const res = await attendancePdf(fromKey, toKey, employeeId);
      if (!res.ok || !res.fileBase64) { setMsg({ ok: false, text: res.error ?? "No se pudo generar el PDF" }); return; }
      const bytes = Uint8Array.from(atob(res.fileBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = res.fileName ?? "asistencia.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setMsg({ ok: false, text: "No se pudo contactar al servidor. Revisa la conexión a internet e inténtalo de nuevo." });
    } finally {
      setBusy(null);
    }
  };

  const mail = async () => {
    setBusy("mail");
    setMsg(null);
    try {
      const res = await sendReportNow(fromKey, toKey);
      setMsg(res.ok ? { ok: true, text: "Reporte enviado por correo." } : { ok: false, text: res.error ?? "No se pudo enviar" });
    } catch {
      // Sin internet (o la sesión no se pudo validar) la acción ni siquiera llega
      // a correr y Next avienta un error genérico en inglés.
      setMsg({ ok: false, text: "No se pudo contactar al servidor. Revisa la conexión a internet e inténtalo de nuevo." });
    } finally {
      setBusy(null);
    }
  };

  const btn = "inline-flex items-center gap-2 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm text-ink transition-colors hover:border-gold disabled:opacity-50";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => window.print()} className={btn}>
          <Printer className="h-4 w-4" /> Imprimir
        </button>
        <button type="button" onClick={pdf} disabled={busy !== null} className={btn}>
          {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} PDF
        </button>
        {/* El correo siempre lleva a todo el personal del rango. */}
        <button type="button" onClick={mail} disabled={busy !== null} className={btn} title="Envía el reporte de todo el personal del rango">
          {busy === "mail" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Enviar por correo
        </button>
      </div>
      {msg && <p className={msg.ok ? "text-xs text-green-700" : "text-xs text-red-700"}>{msg.text}</p>}
    </div>
  );
}
