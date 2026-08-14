"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { findOrCreateCustomer } from "@/lib/customers";
import { sanitizeSpots } from "@/lib/piercings";
import { sendPiercingEmail, type PiercingEmailKind } from "@/lib/piercing-email";

export type PiercingInput = {
  id?: string;
  name: string;
  phone?: string;
  email?: string;
  performedAt: string; // YYYY-MM-DD
  batchNumber?: string;
  spots: string[];
  notes?: string;
};

type Res = { ok: boolean; error?: string };

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export async function savePiercing(input: PiercingInput): Promise<Res & { id?: string }> {
  const staff = await requireStaff();
  const db = createAdminClient();

  const name = input.name.trim();
  if (!name) return { ok: false, error: "El nombre del cliente es obligatorio" };

  const email = input.email?.trim().toLowerCase() || "";
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: "El correo no tiene un formato válido" };

  const spots = sanitizeSpots(input.spots);
  if (spots.length === 0) return { ok: false, error: "Marca al menos un punto en la oreja" };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.performedAt)) {
    return { ok: false, error: "La fecha no es válida" };
  }

  try {
    // Reutiliza el cliente si ya existe (dedupe por correo y por teléfono).
    const customerId = await findOrCreateCustomer(db, {
      name,
      email: email || undefined,
      phone: input.phone?.trim() || undefined,
    });

    const row = {
      customer_id: customerId,
      performed_at: input.performedAt,
      batch_number: input.batchNumber?.trim() || null,
      spots,
      notes: input.notes?.trim() || null,
    };

    let id = input.id;
    if (id) {
      const { error } = await db.from("piercings").update(row).eq("id", id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { data, error } = await db
        .from("piercings")
        .insert({ ...row, created_by: staff.id })
        .select("id")
        .single();
      if (error) return { ok: false, error: error.message };
      id = (data as { id: string }).id;
    }

    revalidatePath("/admin/perforaciones");
    revalidatePath(`/admin/perforaciones/${id}`);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar la perforación" };
  }
}

const SENT_COL: Record<PiercingEmailKind, string> = {
  care: "care_email_sent_at",
  week: "week_email_sent_at",
  month: "month_email_sent_at",
};

const KIND_LABEL: Record<PiercingEmailKind, string> = {
  care: "Instrucciones de cuidado",
  week: "Seguimiento semanal",
  month: "Seguimiento mensual",
};

// El embed de customers llega como objeto o arreglo según el join.
function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function sendFollowUpEmail(id: string, kind: PiercingEmailKind): Promise<Res> {
  await requireStaff();
  if (!SENT_COL[kind]) return { ok: false, error: "Tipo de correo desconocido" };
  const db = createAdminClient();

  const { data } = await db
    .from("piercings")
    .select("id, folio, performed_at, spots, customers(full_name, email)")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  const p = data as unknown as {
    folio: string;
    performed_at: string;
    spots: string[];
    customers: { full_name: string; email: string | null } | { full_name: string; email: string | null }[] | null;
  } | null;

  if (!p) return { ok: false, error: "No se encontró la perforación" };

  const customer = one(p.customers);
  const email = customer?.email?.trim();
  if (!email) return { ok: false, error: "El cliente no tiene correo registrado" };

  const res = await sendPiercingEmail(kind, email, {
    customerName: customer?.full_name ?? "",
    performedAt: p.performed_at,
    spots: sanitizeSpots(p.spots),
  });
  if (!res.ok) return res;

  await db.from("piercings").update({ [SENT_COL[kind]]: new Date().toISOString() }).eq("id", id);
  await db.from("notifications").insert({
    type: "email_sent",
    title: `${KIND_LABEL[kind]} enviado`,
    body: `${p.folio} → ${email}`,
    data: { piercing_id: id, kind },
    target_role: "admin",
  });

  revalidatePath("/admin/perforaciones");
  revalidatePath(`/admin/perforaciones/${id}`);
  return { ok: true };
}

export async function deletePiercing(id: string): Promise<Res> {
  await requireStaff();
  const db = createAdminClient();
  const { error } = await db
    .from("piercings")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/perforaciones");
  return { ok: true };
}
