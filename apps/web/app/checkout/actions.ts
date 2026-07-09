"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { getShippingSettings } from "@/lib/settings";

const TAX_RATE = 0.16;

export type CheckoutInput = {
  items: { variantId: string; qty: number }[];
  customer: { firstName: string; lastName: string; email: string; phone: string };
  address: {
    street: string;
    extNumber: string;
    intNumber: string;
    postalCode: string;
    neighborhood: string;
    city: string;
    state: string;
    references: string;
    lat: number | null;
    lng: number | null;
  };
  shippingMethod: "standard" | "express";
  redeemCents?: number; // saldo Rewards a canjear (validado en el servidor)
};

export async function startCheckout(
  input: CheckoutInput,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const db = createAdminClient();

  if (!input.items?.length) return { ok: false, error: "El carrito está vacío" };
  if (!input.customer.email) return { ok: false, error: "El correo es obligatorio" };

  const ids = input.items.map((i) => i.variantId);

  // ── Variantes (precio y nombre desde la BD, nunca del cliente) ─────────────
  const { data: vData } = await db
    .from("product_variants")
    .select("id, sku, price_cents, is_active, attributes, products(name, slug)")
    .in("id", ids);
  const variants = (vData as unknown as {
    id: string; sku: string; price_cents: number; is_active: boolean; attributes: Record<string, string> | null;
    products: { name: string; slug: string } | { name: string; slug: string }[] | null;
  }[]) ?? [];
  const vmap = new Map(variants.map((v) => [v.id, v]));

  // ── Stock disponible del almacén e-commerce ────────────────────────────────
  const { data: loc } = await db
    .from("inventory_locations").select("id").eq("key", "ecommerce").maybeSingle();
  if (!loc) return { ok: false, error: "Almacén e-commerce no configurado" };
  const { data: sData } = await db
    .from("stock_levels")
    .select("variant_id, quantity, reserved")
    .eq("location_id", (loc as { id: string }).id)
    .in("variant_id", ids);
  const smap = new Map(
    ((sData as unknown as { variant_id: string; quantity: number; reserved: number }[]) ?? [])
      .map((s) => [s.variant_id, Math.max(0, s.quantity - s.reserved)]),
  );

  // ── Construir partidas + validar (precios con IVA incluido) ────────────────
  let goods = 0;
  const orderItems: Record<string, unknown>[] = [];
  const lineItems: { quantity: number; price_data: { currency: string; unit_amount: number; product_data: { name: string } } }[] = [];

  for (const item of input.items) {
    const v = vmap.get(item.variantId);
    if (!v || !v.is_active) return { ok: false, error: "Un producto ya no está disponible" };
    const avail = smap.get(item.variantId) ?? 0;
    if (avail < item.qty) return { ok: false, error: `Sin stock suficiente para ${v.sku}` };

    const prod = Array.isArray(v.products) ? v.products[0] : v.products;
    const talla = v.attributes?.talla;
    const name = `${prod?.name ?? v.sku}${talla ? ` · Talla ${talla}` : ""}`;
    const lineTotal = v.price_cents * item.qty;
    goods += lineTotal;

    orderItems.push({
      variant_id: v.id,
      sku: v.sku,
      name,
      unit_price_cents: v.price_cents,
      quantity: item.qty,
      total_cents: lineTotal,
    });
    lineItems.push({
      quantity: item.qty,
      price_data: { currency: "mxn", unit_amount: v.price_cents, product_data: { name } },
    });
  }

  // ── Envío + desglose de IVA incluido (calculado en el servidor) ────────────
  const ship = await getShippingSettings();
  const qualifiesFree = goods >= ship.freeThresholdCents;
  const shipping = qualifiesFree
    ? 0
    : input.shippingMethod === "express" ? ship.expressCents : ship.standardCents;
  const base = Math.round(goods / (1 + TAX_RATE)); // base gravable (sin IVA)
  const tax = goods - base;                         // IVA contenido en el precio
  const total = goods + shipping;                   // los precios ya traen IVA
  const shippingMethodLabel = qualifiesFree ? "free" : input.shippingMethod;

  // Envío como única línea extra; los productos ya incluyen IVA (sin línea aparte).
  if (shipping > 0) {
    lineItems.push({
      quantity: 1,
      price_data: { currency: "mxn", unit_amount: shipping, product_data: { name: `Envío (${input.shippingMethod === "express" ? "Express" : "Estándar"})` } },
    });
  }

  // ── Cliente: sesión de Rewards si existe; si no, invitado por correo ────────
  const fullName = `${input.customer.firstName} ${input.customer.lastName}`.trim();
  let customerId: string;
  let balanceCents = 0;

  const supabaseServer = await createClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  let loggedCustomerId: string | null = null;
  if (user) {
    const { data } = await db.from("customers").select("id, customer_rewards(balance_cents)").eq("auth_user_id", user.id).maybeSingle();
    if (data) {
      const row = data as unknown as { id: string; customer_rewards: { balance_cents: number } | { balance_cents: number }[] | null };
      const rw = Array.isArray(row.customer_rewards) ? row.customer_rewards[0] : row.customer_rewards;
      loggedCustomerId = row.id;
      balanceCents = rw?.balance_cents ?? 0;
    }
  }

  if (loggedCustomerId) {
    customerId = loggedCustomerId;
    await db.from("customers").update({ full_name: fullName, phone: input.customer.phone }).eq("id", customerId);
  } else {
    const { data: existing } = await db.from("customers").select("id").eq("email", input.customer.email).maybeSingle();
    if (existing) {
      customerId = (existing as { id: string }).id;
      await db.from("customers").update({ full_name: fullName, phone: input.customer.phone }).eq("id", customerId);
    } else {
      const { data: created, error } = await db.from("customers").insert({ full_name: fullName, email: input.customer.email, phone: input.customer.phone }).select("id").single();
      if (error) return { ok: false, error: error.message };
      customerId = (created as { id: string }).id;
    }
  }

  // Canje de Rewards (solo con sesión; tope configurable; nunca más que los productos).
  let redeem = 0;
  if (loggedCustomerId && (input.redeemCents ?? 0) > 0) {
    const { data: capRow } = await db.from("app_settings").select("value").eq("key", "rewards_max_redeem_cents").maybeSingle();
    const cap = Number((capRow as { value: string } | null)?.value ?? "100000");
    redeem = Math.max(0, Math.min(input.redeemCents ?? 0, balanceCents, cap, goods));
  }
  const charge = total - redeem;

  // ── Dirección ──────────────────────────────────────────────────────────────
  const { data: addr } = await db
    .from("customer_addresses")
    .insert({
      customer_id: customerId,
      street: input.address.street,
      ext_number: input.address.extNumber,
      int_number: input.address.intNumber || null,
      postal_code: input.address.postalCode,
      neighborhood: input.address.neighborhood || null,
      city: input.address.city || null,
      state: input.address.state || null,
      references_note: input.address.references || null,
      lat: input.address.lat,
      lng: input.address.lng,
    })
    .select("id").single();

  // ── Orden + partidas ───────────────────────────────────────────────────────
  const { data: order, error: orderErr } = await db
    .from("orders")
    .insert({
      channel: "ecommerce",
      customer_id: customerId,
      status: "pending",
      subtotal_cents: base,
      shipping_cents: shipping,
      tax_cents: tax,
      total_cents: charge,
      rewards_redeemed_cents: redeem,
      shipping_method: shippingMethodLabel,
      shipping_address_id: (addr as { id: string } | null)?.id ?? null,
    })
    .select("id, order_number").single();
  if (orderErr || !order) return { ok: false, error: orderErr?.message ?? "No se pudo crear la orden" };

  const orderId = (order as { id: string; order_number: string }).id;
  await db.from("order_items").insert(orderItems.map((oi) => ({ ...oi, order_id: orderId })));

  // ── Sesión de Stripe (tarjeta + OXXO) ──────────────────────────────────────
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  try {
    // El canje de Rewards se aplica como cupón (descuento) sobre el cobro Stripe.
    let discounts: { coupon: string }[] | undefined;
    if (redeem > 0) {
      const coupon = await stripe.coupons.create({ amount_off: redeem, currency: "mxn", duration: "once", name: "Turkana Rewards" });
      discounts = [{ coupon: coupon.id }];
    }
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency: "mxn",
      line_items: lineItems,
      discounts,
      payment_method_types: ["card", "oxxo"],
      payment_method_options: { oxxo: { expires_after_days: 3 } },
      customer_email: input.customer.email,
      metadata: { order_id: orderId, order_number: (order as { order_number: string }).order_number },
      payment_intent_data: { metadata: { order_id: orderId } },
      success_url: `${site}/checkout/exito?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/carrito`,
    });
    await db.from("payments").insert({
      order_id: orderId,
      method: "stripe",
      amount_cents: charge,
      status: "pending",
      stripe_session_id: session.id,
    });
    return { ok: true, url: session.url ?? undefined };
  } catch (e) {
    return { ok: false, error: `Stripe: ${String(e)}` };
  }
}
