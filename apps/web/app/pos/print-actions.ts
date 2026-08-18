"use server";

// Cola de impresión. La app deja aquí los bytes ESC/POS ya armados y el agente
// que corre en la PC del mostrador los recoge y los manda a la impresora. Desde
// la nube no hay forma de hablarle a una IP de la tienda, así que el sentido de
// la conexión se invierte: el que está adentro es quien pregunta.
import { cookies } from "next/headers";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGISTER_COOKIE } from "@/lib/pos-register";
import type { DocType } from "@/lib/escpos";

type DB = ReturnType<typeof createAdminClient>;

// Cuánto puede callarse el agente antes de darlo por caído. Late cada 30 s.
const HEARTBEAT_MS = 90_000;

export type PrinterStatus = {
  configured: boolean;
  online: boolean;
  name: string | null;
  lastSeenAt: string | null;
  pending: number;
  failed: number;
};

type PrinterRow = { id: string; name: string; last_seen_at: string | null };

// La impresora de esta caja, o la compartida. Con una sola impresora en la
// tienda las dos cajas caen en la misma y sus tickets salen en el mostrador.
async function resolvePrinter(db: DB, registerId: string | null): Promise<PrinterRow | null> {
  if (registerId) {
    const { data } = await db
      .from("printers").select("id, name, last_seen_at")
      .eq("register_id", registerId).eq("is_active", true)
      .limit(1).maybeSingle();
    if (data) return data as unknown as PrinterRow;
  }

  const { data: def } = await db
    .from("printers").select("id, name, last_seen_at")
    .eq("is_active", true).eq("is_default", true)
    .limit(1).maybeSingle();
  if (def) return def as unknown as PrinterRow;

  const { data: first } = await db
    .from("printers").select("id, name, last_seen_at")
    .eq("is_active", true).order("created_at").limit(1).maybeSingle();
  return (first as unknown as PrinterRow) ?? null;
}

const isOnline = (lastSeen: string | null) =>
  !!lastSeen && Date.now() - new Date(lastSeen).getTime() < HEARTBEAT_MS;

async function currentRegisterId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(REGISTER_COOKIE)?.value ?? null;
}

export async function getPrinterStatus(): Promise<PrinterStatus> {
  await requireStaff();
  const db = createAdminClient();
  const printer = await resolvePrinter(db, await currentRegisterId());

  if (!printer) {
    return { configured: false, online: false, name: null, lastSeenAt: null, pending: 0, failed: 0 };
  }

  const { count: pending } = await db
    .from("print_jobs").select("id", { count: "exact", head: true })
    .eq("printer_id", printer.id).in("status", ["pending", "printing"]);

  // Sólo los errores recientes: uno de ayer ya no dice nada del turno de hoy.
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { count: failed } = await db
    .from("print_jobs").select("id", { count: "exact", head: true })
    .eq("printer_id", printer.id).eq("status", "error").gte("created_at", since);

  return {
    configured: true,
    online: isOnline(printer.last_seen_at),
    name: printer.name,
    lastSeenAt: printer.last_seen_at,
    pending: pending ?? 0,
    failed: failed ?? 0,
  };
}

export type EnqueueResult =
  | { ok: true; jobId: string }
  | { ok: false; reason: "sin-impresora" | "agente-caido" | "error"; error?: string };

export async function enqueuePrint(input: {
  docType: DocType;
  label?: string;
  payloadB64: string;
  sessionId?: string;
  printerId?: string;
}): Promise<EnqueueResult> {
  const staff = await requireStaff();
  const db = createAdminClient();

  const printer = input.printerId
    ? ((await db.from("printers").select("id, name, last_seen_at").eq("id", input.printerId).maybeSingle()).data as unknown as PrinterRow | null)
    : await resolvePrinter(db, await currentRegisterId());

  if (!printer) return { ok: false, reason: "sin-impresora" };

  // Si el agente no está latiendo, encolar sería peor que no imprimir: el ticket
  // saldría solo horas después, cuando ya nadie lo espera. Mejor devolverlo al
  // navegador para que el cajero imprima por el camino de siempre.
  if (!isOnline(printer.last_seen_at)) return { ok: false, reason: "agente-caido" };

  const { data, error } = await db.from("print_jobs").insert({
    printer_id: printer.id,
    doc_type: input.docType,
    label: input.label ?? null,
    payload: input.payloadB64,
    session_id: input.sessionId ?? null,
    created_by: staff.id,
  }).select("id").single();

  if (error || !data) return { ok: false, reason: "error", error: error?.message };
  return { ok: true, jobId: (data as { id: string }).id };
}
