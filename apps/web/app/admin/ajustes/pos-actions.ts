"use server";

// Cajas e impresoras: lo que antes había que tocar a mano en el SQL Editor.
// Con dos puntos de cobro la tienda ya no puede depender de eso.
import { revalidatePath } from "next/cache";
import { formatStore } from "@/lib/dates";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildReceipt, type ReceiptData } from "@/lib/escpos";

const ADMIN_ROLES = ["super_admin", "admin"];

async function requireAdmin() {
  const staff = await requireStaff();
  if (!ADMIN_ROLES.includes(staff.role ?? "")) {
    return { error: "Sólo los administradores pueden cambiar cajas e impresoras" as const };
  }
  return { staff, db: createAdminClient() };
}

// ── Cajas ───────────────────────────────────────────────────────────────────
export type RegisterRow = {
  id: string;
  name: string;
  isActive: boolean;
  openTurn: { cashier: string; openedAt: string } | null;
  devices: { id: string; name: string; platform: string | null; lastSeenAt: string | null }[];
};

export async function getRegisters(): Promise<RegisterRow[]> {
  await requireStaff();
  const db = createAdminClient();

  const { data: regData } = await db
    .from("cash_registers").select("id, name, is_active").order("name");
  const registers = (regData as unknown as { id: string; name: string; is_active: boolean }[]) ?? [];
  if (!registers.length) return [];

  const { data: sessData } = await db
    .from("cash_sessions").select("register_id, cashier_id, opened_at").eq("status", "open");
  const sessions = (sessData as unknown as { register_id: string; cashier_id: string | null; opened_at: string }[]) ?? [];

  const cashierIds = [...new Set(sessions.map((s) => s.cashier_id).filter(Boolean) as string[])];
  const names = new Map<string, string>();
  if (cashierIds.length) {
    const { data: profs } = await db.from("profiles").select("id, full_name").in("id", cashierIds);
    for (const p of (profs as unknown as { id: string; full_name: string }[]) ?? []) names.set(p.id, p.full_name);
  }

  const { data: devData } = await db
    .from("devices").select("id, name, platform, register_id, last_seen_at").order("last_seen_at", { ascending: false });
  const devices = (devData as unknown as {
    id: string; name: string; platform: string | null; register_id: string | null; last_seen_at: string | null;
  }[]) ?? [];

  return registers.map((r) => {
    const turn = sessions.find((s) => s.register_id === r.id);
    return {
      id: r.id,
      name: r.name,
      isActive: r.is_active,
      openTurn: turn
        ? { cashier: turn.cashier_id ? names.get(turn.cashier_id) ?? "—" : "—", openedAt: turn.opened_at }
        : null,
      devices: devices
        .filter((d) => d.register_id === r.id)
        .map((d) => ({ id: d.id, name: d.name, platform: d.platform, lastSeenAt: d.last_seen_at })),
    };
  });
}

export async function saveRegister(input: {
  id?: string;
  name: string;
  isActive: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Ponle nombre a la caja" };

  const { error } = input.id
    ? await ctx.db.from("cash_registers").update({ name, is_active: input.isActive }).eq("id", input.id)
    : await ctx.db.from("cash_registers").insert({ name, is_active: input.isActive });

  if (error) {
    if (error.code === "23505") return { ok: false, error: "Ya hay una caja con ese nombre" };
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/ajustes/cajas");
  return { ok: true };
}

// No se borran cajas: sus cortes viejos apuntan a ellas. Se desactivan, y con eso
// dejan de ofrecerse a los equipos nuevos.
export async function deactivateRegister(id: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const { data } = await ctx.db
    .from("cash_sessions").select("id").eq("register_id", id).eq("status", "open").maybeSingle();
  if (data) return { ok: false, error: "Esa caja tiene un turno abierto. Ciérralo primero desde el POS." };

  const { error } = await ctx.db.from("cash_registers").update({ is_active: false }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/ajustes/cajas");
  return { ok: true };
}

// ── Impresoras ──────────────────────────────────────────────────────────────
export type PrinterRow = {
  id: string;
  name: string;
  host: string;
  port: number;
  registerId: string | null;
  isDefault: boolean;
  isActive: boolean;
  lastSeenAt: string | null;
  online: boolean;
};

export type JobRow = {
  id: string;
  label: string | null;
  docType: string;
  status: string;
  attempts: number;
  error: string | null;
  createdAt: string;
  printedAt: string | null;
};

const HEARTBEAT_MS = 90_000;

export async function getPrinters(): Promise<PrinterRow[]> {
  await requireStaff();
  const db = createAdminClient();
  const { data } = await db
    .from("printers").select("id, name, host, port, register_id, is_default, is_active, last_seen_at").order("name");

  return ((data as unknown as {
    id: string; name: string; host: string; port: number; register_id: string | null;
    is_default: boolean; is_active: boolean; last_seen_at: string | null;
  }[]) ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    host: p.host,
    port: p.port,
    registerId: p.register_id,
    isDefault: p.is_default,
    isActive: p.is_active,
    lastSeenAt: p.last_seen_at,
    online: !!p.last_seen_at && Date.now() - new Date(p.last_seen_at).getTime() < HEARTBEAT_MS,
  }));
}

export async function getRecentJobs(limit = 20): Promise<JobRow[]> {
  await requireStaff();
  const db = createAdminClient();
  const { data } = await db
    .from("print_jobs").select("id, label, doc_type, status, attempts, error, created_at, printed_at")
    .order("created_at", { ascending: false }).limit(limit);

  return ((data as unknown as {
    id: string; label: string | null; doc_type: string; status: string;
    attempts: number; error: string | null; created_at: string; printed_at: string | null;
  }[]) ?? []).map((j) => ({
    id: j.id, label: j.label, docType: j.doc_type, status: j.status,
    attempts: j.attempts, error: j.error, createdAt: j.created_at, printedAt: j.printed_at,
  }));
}

export async function savePrinter(input: {
  id?: string;
  name: string;
  host: string;
  port: number;
  registerId: string | null;
  isDefault: boolean;
  isActive: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const name = input.name.trim();
  const host = input.host.trim();
  if (!name) return { ok: false, error: "Ponle nombre a la impresora" };
  if (!host) return { ok: false, error: "Falta la dirección (IP) de la impresora" };
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    return { ok: false, error: "El puerto no es válido (el de estas impresoras es 9100)" };
  }

  const row = {
    name, host, port: input.port,
    register_id: input.registerId,
    is_default: input.isDefault,
    is_active: input.isActive,
  };

  const { data, error } = input.id
    ? await ctx.db.from("printers").update(row).eq("id", input.id).select("id").single()
    : await ctx.db.from("printers").insert(row).select("id").single();
  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo guardar" };

  // Una sola predeterminada: si no, un ticket sin caja asignada podría salir en
  // cualquiera de las dos.
  if (input.isDefault) {
    await ctx.db.from("printers").update({ is_default: false }).neq("id", (data as { id: string }).id);
  }

  revalidatePath("/admin/ajustes/impresoras");
  return { ok: true };
}

// Vuelve a poner en cola un ticket que quedó en error (papel, impresora apagada).
export async function retryJob(id: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const { error } = await ctx.db
    .from("print_jobs").update({ status: "pending", attempts: 0, error: null }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/ajustes/impresoras");
  return { ok: true };
}

// Saca un ticket de la cola y lo tira. Hace falta cuando un trabajo se queda
// atorado: sin esto la única salida era entrar a la base de datos, y mientras
// tanto el contador de la cola no bajaba nunca.
export async function deleteJob(id: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const { error } = await ctx.db.from("print_jobs").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/ajustes/impresoras");
  return { ok: true };
}

// Vacía de un golpe lo que no ha salido (pendiente, imprimiendo o en error).
// Los ya impresos se conservan como historial.
export async function clearQueue(): Promise<{ ok: boolean; error?: string; removed?: number }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const { data, error } = await ctx.db
    .from("print_jobs").delete()
    .in("status", ["pending", "printing", "error"])
    .select("id");
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/ajustes/impresoras");
  return { ok: true, removed: (data ?? []).length };
}

// Página de prueba desde el panel: comprueba la cadena completa —cola, agente,
// impresora— sin tener que cobrar una venta de mentiras.
export async function testPrint(printerId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { ok: false, error: ctx.error };

  // docType 'prueba': antes se mandaba como 'sale' y salía una nota de venta
  // completa, con datos fiscales y un total, que parecía una venta de verdad.
  const receipt: ReceiptData = {
    docType: "prueba",
    orderNumber: "PRUEBA",
    items: [],
    subtotal: 0, tax: 0, total: 0,
    attendedBy: ctx.staff.fullName,
    meta: [{ label: "Enviada", value: formatStore(new Date()) }],
    notes: [
      "Si lees esto, la cola y el agente estan",
      "funcionando y la impresora responde.",
    ],
  };

  // El logo ya no necesita canvas: viene precalculado en lib/logo-raster.ts.
  const payload = Buffer.from(buildReceipt(receipt)).toString("base64");

  const { error } = await ctx.db.from("print_jobs").insert({
    printer_id: printerId,
    doc_type: "prueba",
    label: "Pagina de prueba",
    payload,
    created_by: ctx.staff.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/ajustes/impresoras");
  return { ok: true };
}
