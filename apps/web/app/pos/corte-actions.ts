"use server";

// Ticket del corte de caja a demanda: lo usan el POS al cerrar turno y el botón
// "Imprimir corte" de /admin/reportes/cortes.
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCashCutReport, loadOpenSessions, type OpenSession } from "@/lib/cash-report";
import { buildCashCutReceipt } from "@/lib/cash-receipt";
import type { ReceiptData } from "@/lib/escpos";

// Quién abrió el turno y desde cuándo: el turno es uno solo para la tienda, así
// que quien cierra puede no ser quien lo abrió.
export async function getOpenSessionInfo(sessionId: string): Promise<OpenSession | null> {
  await requireStaff();
  const db = createAdminClient();
  const all = await loadOpenSessions(db);
  return all.find((s) => s.id === sessionId) ?? null;
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
