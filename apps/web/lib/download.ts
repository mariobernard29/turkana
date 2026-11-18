// Bajar al disco un archivo que el servidor mandó en base64.
//
// Lo hacían por su cuenta el PDF de reportes, el PDF de asistencia y el Excel
// del catálogo, los tres con el mismo par de descuidos:
//
//   1. El <a> nunca se metía al documento. Un ancla suelta funciona en Chrome
//      por buena voluntad, pero no es lo que pide el estándar y hay navegadores
//      (y Chrome con ciertas políticas de descarga) donde el clic no hace nada.
//   2. `URL.revokeObjectURL` se llamaba en el renglón siguiente al clic. La
//      descarga arranca de forma asíncrona, así que se estaba tirando el blob
//      mientras el navegador todavía iba a leerlo: a veces alcanza, a veces no,
//      y cuando no alcanza el botón se queda sin hacer nada y sin decir por qué.
//
// Aquí se hace de la forma aburrida y correcta: el ancla entra al documento, se
// hace clic, y la URL se suelta un momento después, cuando ya no hace falta.

// Convierte base64 a bytes. Lo que manda el servidor son binarios, no texto.
//
// Sin anotar el tipo de salida a propósito: así TypeScript infiere
// `Uint8Array<ArrayBuffer>`, que es lo que Blob acepta. Escribir `: Uint8Array`
// lo ensancha a `ArrayBufferLike` (que incluye SharedArrayBuffer) y deja de
// compilar.
function aBytes(base64: string) {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Guarda el archivo con el nombre dado. Devuelve false si el navegador no puede. */
export function descargarBase64(base64: string, fileName: string, mimeType: string): boolean {
  if (typeof document === "undefined") return false;

  const url = URL.createObjectURL(new Blob([aBytes(base64)], { type: mimeType }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  a.style.display = "none";

  document.body.appendChild(a);
  a.click();
  a.remove();

  // Un respiro antes de soltar el blob: si se revoca de inmediato, la descarga
  // puede quedarse sin su contenido a medio camino.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
