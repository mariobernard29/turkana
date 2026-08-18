"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAIN_LOCATION_KEY } from "@/lib/inventory";

type DB = ReturnType<typeof createAdminClient>;

async function mainLocationId(db: DB): Promise<string | null> {
  const { data } = await db
    .from("inventory_locations").select("id").eq("key", MAIN_LOCATION_KEY).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function ensureStock(db: DB, variantId: string, locationId: string) {
  const { data } = await db
    .from("stock_levels")
    .select("id, quantity")
    .eq("variant_id", variantId)
    .eq("location_id", locationId)
    .maybeSingle();
  if (data) return data as unknown as { id: string; quantity: number };
  const { data: created } = await db
    .from("stock_levels")
    .insert({ variant_id: variantId, location_id: locationId, quantity: 0 })
    .select("id, quantity")
    .single();
  return created as unknown as { id: string; quantity: number };
}

// Hay un solo almacén: el mostrador y la tienda en línea comparten existencias,
// así que ya no se elige a dónde va el movimiento ni se traspasa entre bodegas.
export async function applyMovement(input: {
  variantId: string;
  type: "entrada" | "salida" | "ajuste";
  quantity: number;
  notes?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireStaff();
  if (!Number.isInteger(input.quantity) || input.quantity < 0)
    return { ok: false, error: "Cantidad inválida" };

  const db = createAdminClient();
  const locId = await mainLocationId(db);
  if (!locId) return { ok: false, error: "Almacén no configurado" };

  const row = await ensureStock(db, input.variantId, locId);
  const current = row.quantity;

  let newQty: number;
  let moveQty: number;
  if (input.type === "entrada") {
    newQty = current + input.quantity;
    moveQty = input.quantity;
  } else if (input.type === "salida") {
    if (current < input.quantity) return { ok: false, error: "Stock insuficiente" };
    newQty = current - input.quantity;
    moveQty = -input.quantity;
  } else {
    // ajuste: fija la cantidad absoluta
    newQty = input.quantity;
    moveQty = input.quantity - current;
  }

  await db.from("stock_levels")
    .update({ quantity: newQty, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  await db.from("inventory_movements").insert({
    variant_id: input.variantId,
    location_id: locId,
    type: input.type,
    quantity: moveQty,
    reference_type: "manual",
    notes: input.notes || null,
    created_by: staff.id,
  });

  revalidatePath("/admin/inventario");
  revalidatePath("/pos");
  return { ok: true };
}
