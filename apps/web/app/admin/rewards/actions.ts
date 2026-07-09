"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCouponEmail, type CouponEmailData } from "@/lib/coupon-email";

type Res = { ok: boolean; error?: string };

function genCode(): string {
  const s = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "TKN-";
  for (let i = 0; i < 6; i++) c += s[Math.floor(Math.random() * s.length)];
  return c;
}

export async function createCoupon(input: {
  code?: string;
  type: "order" | "product";
  discountKind: "percent" | "amount";
  discountValue: number;
  productId?: string;
  description?: string;
}): Promise<Res> {
  await requireStaff();
  const db = createAdminClient();

  const value = input.discountKind === "percent" ? Math.round(input.discountValue) : Math.round(input.discountValue * 100);
  if (!value || value <= 0) return { ok: false, error: "Valor de descuento inválido" };
  if (input.discountKind === "percent" && value > 100) return { ok: false, error: "El porcentaje no puede superar 100" };
  if (input.type === "product" && !input.productId) return { ok: false, error: "Selecciona el producto del cupón" };

  const code = (input.code?.trim() || genCode()).toUpperCase();
  const { error } = await db.from("coupons").insert({
    code,
    type: input.type,
    discount_kind: input.discountKind,
    discount_value: value,
    product_id: input.type === "product" ? input.productId : null,
    description: input.description || null,
  });
  if (error) return { ok: false, error: error.code === "23505" ? "Ese código ya existe" : error.message };
  revalidatePath("/admin/rewards");
  return { ok: true };
}

export async function deleteCoupon(id: string): Promise<Res> {
  await requireStaff();
  const db = createAdminClient();
  const { error } = await db.from("coupons").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/rewards");
  return { ok: true };
}

export async function toggleCoupon(id: string, active: boolean): Promise<Res> {
  await requireStaff();
  const db = createAdminClient();
  await db.from("coupons").update({ active }).eq("id", id);
  revalidatePath("/admin/rewards");
  return { ok: true };
}

export async function sendCouponToMembers(couponId: string): Promise<{ ok: boolean; sent?: number; failed?: number; error?: string }> {
  await requireStaff();
  const db = createAdminClient();

  const { data: c } = await db
    .from("coupons")
    .select("code, type, discount_kind, discount_value, product_id, products(name)")
    .eq("id", couponId)
    .maybeSingle();
  const coupon = c as unknown as {
    code: string; type: "order" | "product"; discount_kind: "percent" | "amount"; discount_value: number;
    product_id: string | null; products: { name: string } | { name: string }[] | null;
  } | null;
  if (!coupon) return { ok: false, error: "Cupón no encontrado" };

  // Foto del producto (misma que web/POS).
  let productImage: string | null = null;
  let productName: string | null = null;
  if (coupon.type === "product" && coupon.product_id) {
    const prod = Array.isArray(coupon.products) ? coupon.products[0] : coupon.products;
    productName = prod?.name ?? null;
    const { data: imgs } = await db.from("product_images").select("storage_path, position").eq("product_id", coupon.product_id).order("position").limit(1);
    const path = (imgs as unknown as { storage_path: string }[] | null)?.[0]?.storage_path;
    if (path) productImage = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
  }

  const data: CouponEmailData = {
    code: coupon.code, type: coupon.type, discountKind: coupon.discount_kind,
    discountValue: coupon.discount_value, productName, productImage,
  };

  // Miembros registrados (con cuenta y correo).
  const { data: members } = await db
    .from("customers")
    .select("email, full_name")
    .not("email", "is", null)
    .not("auth_user_id", "is", null);
  const list = (members as unknown as { email: string; full_name: string }[]) ?? [];
  if (list.length === 0) return { ok: false, error: "No hay miembros registrados con correo" };

  let sent = 0, failed = 0;
  for (const m of list) {
    const r = await sendCouponEmail(m.email, m.full_name?.split(" ")[0] ?? "", data);
    if (r.ok) sent++; else failed++;
  }
  return { ok: sent > 0, sent, failed, error: sent === 0 ? "No se pudo enviar (revisa Resend/dominio)" : undefined };
}
