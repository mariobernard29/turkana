"use server";

// Ticket del corte de caja a demanda: lo usan el POS al cerrar turno y el botón
// "Imprimir corte" de /admin/reportes/cortes.
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCashCutReport, loadOpenSessions, type OpenSession } from "@/lib/cash-report";
import { buildCashCutReceipt } from "@/lib/cash-receipt";
import type { ReceiptData } from "@/lib/escpos";

// Otros turnos abiertos (de otros cajeros): el corte sólo cubre el propio, así
// que hay que avisar si hay dinero esperando en otro lado.
export async function getOtherOpenSessions(currentSessionId: string): Promise<OpenSession[]> {
  await requireStaff();
  const db = createAdminClient();
  const all = await loadOpenSessions(db);
  return all.filter((s) => s.id !== currentSessionId);
}

export async function getCashCutReceipt(
  sessionId: string,
): Promise<{ ok: boolean; receipt?: ReceiptData; error?: string }> {
  await requireStaff();
  const db = createAdminClient();
  const report = await loadCashCutReport(db, sessionId);
  if (!report) return { ok: false, error: "Turno no encontrado" };
  return { ok: true, receipt: buildCashCutReceipt(report) };
}
