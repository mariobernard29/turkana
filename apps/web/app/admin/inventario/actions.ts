"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type DB = ReturnType<typeof createAdminClient>;
type LocKey = "tienda" | "ecommerce";

async function getLocations(db: DB): Promise<Record<string, string>> {
  const { data } = await db.from("inventory_locations").select("id, key");
  const map: Record<string, string> = {};
  for (const l of (data as unknown as { id: string; key: string }[]) ?? []) map[l.key] = l.id;
  return map;
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

export async function applyMovement(input: {
  variantId: string;
  type: "entrada" | "salida" | "ajuste";
  locationKey: LocKey;
  quantity: number;
  notes?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireStaff();
  if (!Number.isInteger(input.quantity) || input.quantity < 0)
    return { ok: false, error: "Cantidad inválida" };

  const db = createAdminClient();
  const locs = await getLocations(db);
  const locId = locs[input.locationKey];
  if (!locId) return { ok: false, error: "Almacén inválido" };

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
  return { ok: true };
}

export async function transferStock(input: {
  variantId: string;
  fromKey: LocKey;
  toKey: LocKey;
  quantity: number;
  notes?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireStaff();
  if (input.fromKey === input.toKey) return { ok: false, error: "Selecciona almacenes distintos" };
  if (!Number.isInteger(input.quantity) || input.quantity <= 0)
    return { ok: false, error: "Cantidad inválida" };

  const db = createAdminClient();
  const locs = await getLocations(db);
  const fromId = locs[input.fromKey];
  const toId = locs[input.toKey];
  if (!fromId || !toId) return { ok: false, error: "Almacén inválido" };

  const fromRow = await ensureStock(db, input.variantId, fromId);
  if (fromRow.quantity < input.quantity)
    return { ok: false, error: "Stock insuficiente en el almacén de origen" };
  const toRow = await ensureStock(db, input.variantId, toId);

  await db.from("stock_levels")
    .update({ quantity: fromRow.quantity - input.quantity, updated_at: new Date().toISOString() })
    .eq("id", fromRow.id);
  await db.from("stock_levels")
    .update({ quantity: toRow.quantity + input.quantity, updated_at: new Date().toISOString() })
    .eq("id", toRow.id);

  await db.from("inventory_movements").insert([
    { variant_id: input.variantId, location_id: fromId, type: "traspaso", quantity: -input.quantity, reference_type: "transfer", notes: input.notes || null, created_by: staff.id },
    { variant_id: input.variantId, location_id: toId, type: "traspaso", quantity: input.quantity, reference_type: "transfer", notes: input.notes || null, created_by: staff.id },
  ]);

  revalidatePath("/admin/inventario");
  return { ok: true };
}
