"use client";

// La puerta única de impresión del POS.
//
// El camino normal manda el ticket a la cola: la app arma los bytes ESC/POS y el
// agente del mostrador los vuelca a la impresora. El cajero toca "imprimir" y
// sale el papel, sin diálogo de por medio.
//
// Si algo de esa cadena no está —sin red, sin impresora dada de alta, o el
// agente caído— se cae al camino viejo: el HTML con el diálogo del navegador.
// Una tienda no se puede quedar sin poder entregar un ticket.
import { buildReceipt, DOC_TITLES, docType, type ReceiptData, type RasterLogo } from "@/lib/escpos";
import { loadLogoRaster, printReceiptHTML } from "@/lib/print";
import { enqueuePrint } from "@/app/pos/print-actions";

export type PrintOutcome = {
  ok: boolean;
  /** true si se imprimió por el diálogo del navegador en vez de la impresora. */
  fallback: boolean;
  error?: string;
};

// El logo se convierte a mapa de bits una sola vez por pestaña: es lo más caro
// de armar el ticket y no cambia.
let logoOnce: Promise<RasterLogo | undefined> | null = null;
function logo() {
  if (!logoOnce) logoOnce = loadLogoRaster();
  return logoOnce;
}

// A base64 por trozos: con el bitmap del logo son varios miles de bytes y
// String.fromCharCode(...bytes) desborda la pila.
function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function label(data: ReceiptData): string {
  return `${DOC_TITLES[docType(data)]} ${data.orderNumber}`.trim();
}

// Avisa al indicador del encabezado que refresque: si la impresora acaba de
// fallar, el cajero lo ve en el mismo momento en que lo nota el sistema.
function notify() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("turkana-print"));
}

export async function printReceipt(
  data: ReceiptData,
  opts?: { sessionId?: string },
): Promise<PrintOutcome> {
  // Sin red no hay cola que valga: el navegador es la única salida.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    printReceiptHTML(data);
    return { ok: true, fallback: true };
  }

  try {
    const bytes = buildReceipt(data, await logo());
    const res = await enqueuePrint({
      docType: docType(data),
      label: label(data),
      payloadB64: toBase64(bytes),
      sessionId: opts?.sessionId,
    });

    notify();
    if (res.ok) return { ok: true, fallback: false };

    printReceiptHTML(data);
    return { ok: true, fallback: true, error: res.reason };
  } catch (e) {
    printReceiptHTML(data);
    return { ok: true, fallback: true, error: e instanceof Error ? e.message : String(e) };
  }
}
