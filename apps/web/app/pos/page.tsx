import { cookies } from "next/headers";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/paginate";
import { loadOpenSessions } from "@/lib/cash-report";
import { REGISTER_COOKIE } from "@/lib/pos-register";
import { PosOpen } from "@/components/pos/pos-open";
import { PosRegisterPicker, type PickerRegister } from "@/components/pos/pos-register-picker";
import { PosSale, type PosProduct } from "@/components/pos/pos-sale";

export const dynamic = "force-dynamic";

type ProdRel = {
  name: string; status: string; deleted_at: string | null; category_id: string | null;
  product_images: { storage_path: string; position: number; variant_id: string | null }[] | null;
};
type RawVariant = {
  id: string;
  product_id: string;
  sku: string;
  attributes: Record<string, string> | null;
  price_cents: number;
  products: ProdRel | ProdRel[] | null;
  stock_levels: { quantity: number; reserved: number; low_stock_threshold: number | null; location_id: string }[];
};

function sortTallas(a: { talla: string }, b: { talla: string }) {
  const na = Number(a.talla), nb = Number(b.talla);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return a.talla.localeCompare(b.talla);
}

async function loadPos(registerId: string) {
  const db = createAdminClient();

  // Un turno por CAJA: el mostrador y el iPad cobran a la vez, cada uno con su
  // cajón. Se busca el turno de ESTA caja, no "el turno de la tienda".
  const { data: sessionData } = await db
    .from("cash_sessions")
    .select("id, opening_float_cents, opened_at")
    .eq("register_id", registerId)
    .eq("status", "open")
    .maybeSingle();
  const session = sessionData as unknown as { id: string; opening_float_cents: number; opened_at: string } | null;

  if (!session) {
    return { session: null, products: [] as PosProduct[], categories: [] as { id: string; name: string }[] };
  }

  const { data: loc } = await db.from("inventory_locations").select("id").eq("key", "tienda").maybeSingle();
  const tiendaId = (loc as { id: string } | null)?.id;

  const { data: catData } = await db.from("categories").select("id, name").is("deleted_at", null).order("name");
  const categories = (catData as unknown as { id: string; name: string }[]) ?? [];

  // Por páginas: con el catálogo completo pasan de mil tallas, y de un solo tiro
  // PostgREST recorta sin avisar. Una talla que no llega aquí no se puede cobrar.
  const vData = await fetchAll<RawVariant>((from, to) => db
    .from("product_variants")
    .select("id, product_id, sku, attributes, price_cents, products(name, status, deleted_at, category_id, product_images(storage_path, position, variant_id)), stock_levels(quantity, reserved, low_stock_threshold, location_id)")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("id")
    .range(from, to));

  // Agrupar variantes (tallas) por producto.
  const map = new Map<string, PosProduct>();
  for (const v of vData) {
    const prod = Array.isArray(v.products) ? v.products[0] : v.products;
    if (!prod || prod.deleted_at || prod.status !== "active") continue;
    const st = (v.stock_levels ?? []).find((s) => s.location_id === tiendaId);
    const stock = st ? Math.max(0, st.quantity - st.reserved) : 0;
    const low = st?.low_stock_threshold ?? 2;

    let p = map.get(v.product_id);
    if (!p) {
      const img = [...(prod.product_images ?? [])].sort((a, b) => a.position - b.position)[0]?.storage_path ?? null;
      p = { productId: v.product_id, name: prod.name, sku: v.sku, image: img, categoryId: prod.category_id, sizes: [] };
      map.set(v.product_id, p);
    }
    p.sizes.push({ variantId: v.id, talla: v.attributes?.talla ?? "", priceCents: v.price_cents, stock, lowThreshold: low });
  }

  const products = [...map.values()]
    .map((p) => ({ ...p, sizes: p.sizes.sort(sortTallas) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { session, products, categories };
}

// Las cajas que puede ser este equipo, con el turno abierto de cada una para que
// nadie tome por error la caja que ya está trabajando el compañero.
async function loadPickerRegisters(): Promise<PickerRegister[]> {
  const db = createAdminClient();
  const { data } = await db
    .from("cash_registers").select("id, name").eq("is_active", true).order("name");
  const registers = (data as unknown as { id: string; name: string }[]) ?? [];
  const open = await loadOpenSessions(db);
  return registers.map((r) => {
    const turn = open.find((o) => o.registerId === r.id);
    return {
      id: r.id,
      name: r.name,
      openTurn: turn ? { cashier: turn.cashier, openedAt: turn.openedAt } : null,
    };
  });
}

export default async function PosPage() {
  await requireStaff("/pos");

  const jar = await cookies();
  const registerId = jar.get(REGISTER_COOKIE)?.value ?? null;

  // Sin caja asignada (equipo nuevo, o la caja se dio de baja) no se puede
  // cobrar: no habría a qué corte mandar el dinero.
  const db = createAdminClient();
  const { data: reg } = registerId
    ? await db.from("cash_registers").select("id, name").eq("id", registerId).eq("is_active", true).maybeSingle()
    : { data: null };
  const register = reg as { id: string; name: string } | null;

  if (!register) {
    return <PosRegisterPicker registers={await loadPickerRegisters()} />;
  }

  const { session, products, categories } = await loadPos(register.id);

  if (!session) {
    return <PosOpen register={register} />;
  }
  // Aviso de turno largo: un turno se quedó abierto 31 horas y su dinero acabó
  // arrastrado a otro día. El umbral se configura en Ajustes → Negocio.
  const { data: maxRow } = await db
    .from("app_settings").select("value").eq("key", "session_max_hours").maybeSingle();
  const maxHours = parseInt((maxRow as { value?: string } | null)?.value ?? "", 10) || 12;
  const openHours = Math.floor((Date.now() - new Date(session.opened_at).getTime()) / 3_600_000);

  return (
    <PosSale
      session={{ id: session.id }}
      products={products}
      categories={categories}
      shiftHours={openHours >= maxHours ? openHours : null}
    />
  );
}
