// Alta/búsqueda de clientes compartida por el POS (ventas a crédito, apartados).
// Módulo de servidor normal: recibe el cliente de BD.
import { createAdminClient } from "@/lib/supabase/admin";

type DB = ReturnType<typeof createAdminClient>;

// Sólo dígitos: los teléfonos se teclean con espacios/guiones distintos cada vez.
export const normalizePhone = (p?: string | null) => (p ?? "").replace(/\D/g, "");

export type CustomerInput = { name: string; email?: string; phone?: string };

// Deduplica por correo y, si no hay correo, por teléfono (antes siempre insertaba
// un cliente nuevo cuando venía sin correo, llenando la tabla de duplicados).
export async function findOrCreateCustomer(db: DB, c: CustomerInput): Promise<string> {
  const email = c.email?.trim().toLowerCase() || null;
  const phone = c.phone?.trim() || null;

  if (email) {
    const { data } = await db.from("customers").select("id").eq("email", email).maybeSingle();
    if (data) {
      const id = (data as { id: string }).id;
      await db.from("customers").update({ full_name: c.name, phone: phone }).eq("id", id);
      return id;
    }
  }

  const digits = normalizePhone(phone);
  if (digits.length >= 10) {
    // Se compara por dígitos en memoria: la BD guarda el teléfono como se tecleó.
    const { data } = await db
      .from("customers").select("id, phone").not("phone", "is", null).is("deleted_at", null).limit(500);
    const match = ((data as unknown as { id: string; phone: string }[]) ?? [])
      .find((r) => normalizePhone(r.phone) === digits);
    if (match) {
      await db.from("customers").update({ full_name: c.name, ...(email ? { email } : {}) }).eq("id", match.id);
      return match.id;
    }
  }

  const { data: created } = await db
    .from("customers")
    .insert({ full_name: c.name, email, phone })
    .select("id").single();
  return (created as { id: string }).id;
}
