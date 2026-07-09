"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function sendTestEmail(email: string): Promise<{ ok: boolean; error?: string; from?: string }> {
  await requireStaff();
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Turkana Jewelry <onboarding@resend.dev>";
  if (!key || !key.startsWith("re_")) return { ok: false, error: "RESEND_API_KEY no está configurada en .env.local" };
  if (!email.trim()) return { ok: false, error: "Ingresa un correo" };

  const html = `
  <div style="background:#faf8f5;padding:40px 0;font-family:Helvetica,Arial,sans-serif;color:#2b2b2b">
    <div style="max-width:520px;margin:0 auto;background:#fff;padding:40px 32px;text-align:center">
      <h1 style="font-family:Georgia,serif;font-weight:400;font-size:24px;letter-spacing:2px;margin:0 0 4px">TURKANA</h1>
      <p style="color:#a08c6b;font-size:11px;letter-spacing:3px;margin:0 0 24px">JEWELRY</p>
      <h2 style="font-family:Georgia,serif;font-weight:400;font-size:20px;margin:0 0 12px">✅ El sistema de correos funciona</h2>
      <p style="color:#666;font-size:14px;margin:0">Este es un correo de prueba enviado desde el panel de administración de Turkana.</p>
    </div>
  </div>`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: email.trim(), subject: "Correo de prueba — Turkana Jewelry", html }),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      return { ok: false, error: (body as { message?: string }).message ?? `Resend respondió ${r.status}`, from };
    }
    return { ok: true, from };
  } catch (e) {
    return { ok: false, error: String(e), from };
  }
}

// ── Parámetros del negocio (envíos / caja / alertas) ───────────────────────────
const BIZ_KEYS = {
  freeThreshold: "free_shipping_threshold_cents",
  standard: "shipping_standard_cents",
  express: "shipping_express_cents",
  cashDrop: "cash_drop_threshold_cents",
  adminEmail: "admin_alert_email",
  lowStock: "low_stock_threshold",
} as const;

const DESCRIPTIONS: Record<string, string> = {
  [BIZ_KEYS.freeThreshold]: "Envío gratis desde (centavos)",
  [BIZ_KEYS.standard]: "Envío estándar (centavos)",
  [BIZ_KEYS.express]: "Envío express (centavos)",
  [BIZ_KEYS.cashDrop]: "Límite de efectivo en caja (centavos)",
  [BIZ_KEYS.adminEmail]: "Correo de administración para alertas",
  [BIZ_KEYS.lowStock]: "Umbral de inventario bajo (piezas)",
};

export type BusinessSettings = {
  freeThresholdCents: number; standardCents: number; expressCents: number; cashDropCents: number;
  adminEmail: string; lowStockThreshold: number;
};

export async function getBusinessSettings(): Promise<BusinessSettings> {
  await requireStaff();
  const db = createAdminClient();
  const { data } = await db.from("app_settings").select("key, value").in("key", Object.values(BIZ_KEYS));
  const map = new Map(((data as unknown as { key: string; value: string }[]) ?? []).map((r) => [r.key, r.value]));
  const num = (k: string, d: number) => parseInt(map.get(k) ?? "", 10) || d;
  return {
    freeThresholdCents: num(BIZ_KEYS.freeThreshold, 199900),
    standardCents: num(BIZ_KEYS.standard, 11000),
    expressCents: num(BIZ_KEYS.express, 15900),
    cashDropCents: num(BIZ_KEYS.cashDrop, 1000000),
    adminEmail: (map.get(BIZ_KEYS.adminEmail) ?? "").trim(),
    lowStockThreshold: num(BIZ_KEYS.lowStock, 5),
  };
}

export async function updateBusinessSettings(input: BusinessSettings): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireStaff();
  if (!["super_admin", "admin"].includes(staff.role ?? "")) return { ok: false, error: "Solo administradores pueden cambiar estos parámetros" };
  const db = createAdminClient();

  const money: [string, number][] = [
    [BIZ_KEYS.freeThreshold, input.freeThresholdCents],
    [BIZ_KEYS.standard, input.standardCents],
    [BIZ_KEYS.express, input.expressCents],
    [BIZ_KEYS.cashDrop, input.cashDropCents],
  ];
  if (input.adminEmail && !/^\S+@\S+\.\S+$/.test(input.adminEmail)) return { ok: false, error: "Correo de administración inválido" };

  const rows: { key: string; value: string; description: string }[] = [
    ...money.map(([k, v]) => {
      if (v < 0 || Number.isNaN(v)) throw new Error("bad");
      return { key: k, value: String(Math.round(v)), description: DESCRIPTIONS[k] };
    }),
    { key: BIZ_KEYS.lowStock, value: String(Math.max(1, Math.round(input.lowStockThreshold || 5))), description: DESCRIPTIONS[BIZ_KEYS.lowStock] },
    { key: BIZ_KEYS.adminEmail, value: input.adminEmail.trim(), description: DESCRIPTIONS[BIZ_KEYS.adminEmail] },
  ];
  const { error } = await db.from("app_settings").upsert(rows, { onConflict: "key" });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/ajustes");
  revalidatePath("/checkout");
  return { ok: true };
}
