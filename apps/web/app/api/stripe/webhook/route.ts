import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyOrderPaid, checkLowStockAfterSale } from "@/lib/admin-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DB = ReturnType<typeof createAdminClient>;

// Marca la orden como pagada (idempotente): payment + stock + rewards + aviso.
async function fulfillOrder(
  db: DB,
  orderId: string,
  payment: { method: string; amountCents: number; intentId?: string; chargeId?: string; raw: unknown },
) {
  const { data: orderData } = await db
    .from("orders")
    .select("id, customer_id, subtotal_cents, rewards_redeemed_cents, status")
    .eq("id", orderId)
    .maybeSingle();
  const order = orderData as unknown as {
    id: string; customer_id: string | null; subtotal_cents: number; rewards_redeemed_cents: number; status: string;
  } | null;
  if (!order || order.status === "paid") return; // ya pagado

  // Claim atómico: solo UNA ejecución transiciona pending/otro → paid.
  // (Stripe manda checkout.session.completed y payment_intent.succeeded casi juntos;
  //  sin esto, ambos envían los correos → duplicados.)
  const { data: claimed } = await db
    .from("orders").update({ status: "paid" }).eq("id", orderId).neq("status", "paid").select("id");
  if (!claimed || claimed.length === 0) return; // otro evento ya lo procesó

  // Pago: actualiza el registro pendiente o crea uno nuevo.
  const { data: existingPay } = await db
    .from("payments").select("id").eq("order_id", orderId).limit(1).maybeSingle();
  if (existingPay) {
    await db.from("payments").update({
      status: "completed",
      method: payment.method,
      amount_cents: payment.amountCents,
      stripe_payment_intent_id: payment.intentId ?? null,
      stripe_charge_id: payment.chargeId ?? null,
      raw: payment.raw,
    }).eq("id", (existingPay as { id: string }).id);
  } else {
    await db.from("payments").insert({
      order_id: orderId, method: payment.method, amount_cents: payment.amountCents,
      status: "completed", stripe_payment_intent_id: payment.intentId ?? null,
      stripe_charge_id: payment.chargeId ?? null, raw: payment.raw,
    });
  }

  // Descontar stock del almacén e-commerce.
  const { data: items } = await db
    .from("order_items").select("variant_id, quantity, is_service").eq("order_id", orderId);
  for (const it of (items as unknown as { variant_id: string | null; quantity: number; is_service: boolean }[]) ?? []) {
    if (it.is_service || !it.variant_id) continue;
    await db.rpc("decrement_stock", {
      p_variant: it.variant_id, p_location_key: "ecommerce",
      p_qty: it.quantity, p_ref_type: "order", p_ref_id: orderId,
    });
  }

  // Canjear el saldo Rewards aplicado en el checkout (se descuenta al pagar).
  if (order.customer_id && order.rewards_redeemed_cents > 0) {
    await db.rpc("redeem_rewards", {
      p_customer: order.customer_id, p_order: orderId,
      p_amount_cents: order.rewards_redeemed_cents, p_channel: "ecommerce",
    }); // si el saldo cambió, redeem_rewards falla y se ignora (descuento ya aplicado)
  }

  // (Rewards ya no es cashback: no se acredita saldo por compra.)

  await db.from("notifications").insert({
    type: "new_order",
    title: "Nuevo pedido pagado",
    body: `Orden pagada por $${(payment.amountCents / 100).toFixed(2)}`,
    data: { order_id: orderId },
    target_role: "admin",
  });

  // Confirmación detallada al cliente + alerta de venta al admin (tras el pago).
  await notifyOrderPaid(orderId);

  // Alerta de inventario bajo (tienda en línea).
  const saleEntries = ((items as unknown as { variant_id: string | null; quantity: number; is_service: boolean }[]) ?? [])
    .filter((it) => !it.is_service && it.variant_id)
    .map((it) => ({ variantId: it.variant_id as string, qty: it.quantity }));
  await checkLowStockAfterSale(saleEntries, "ecommerce", "Tienda en línea");
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret || secret.includes("...")) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET no configurada (o placeholder). Valor actual:", secret ? `${secret.slice(0, 8)}…` : "(vacío)");
    return new NextResponse("missing signature/secret", { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (e) {
    console.error("[webhook] firma inválida — el whsec no coincide con el de `stripe listen`:", String(e));
    return new NextResponse(`bad signature: ${String(e)}`, { status: 400 });
  }

  const db = createAdminClient();
  console.log("[webhook] evento recibido:", event.type);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const orderId = s.metadata?.order_id;
        // Guardar el payment_intent para correlacionar OXXO (pago posterior).
        if (orderId && s.payment_intent) {
          await db.from("payments")
            .update({ stripe_payment_intent_id: String(s.payment_intent) })
            .eq("order_id", orderId);
        }
        if (orderId && s.payment_status === "paid") {
          await fulfillOrder(db, orderId, {
            method: "stripe",
            amountCents: s.amount_total ?? 0,
            intentId: s.payment_intent ? String(s.payment_intent) : undefined,
            raw: event,
          });
        } else if (orderId) {
          // OXXO: voucher generado, aún sin pagar.
          await db.from("notifications").insert({
            type: "new_order", title: "OXXO pendiente de pago",
            body: `Orden ${orderId}: voucher OXXO generado`,
            data: { order_id: orderId }, target_role: "admin",
          });
        }
        break;
      }
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = pi.metadata?.order_id;
        if (orderId) {
          await fulfillOrder(db, orderId, {
            method: pi.payment_method_types?.includes("oxxo") ? "oxxo" : "stripe",
            amountCents: pi.amount_received ?? pi.amount,
            intentId: pi.id,
            chargeId: (pi.latest_charge as string) ?? undefined,
            raw: event,
          });
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await db.from("notifications").insert({
          type: "payment_failed", title: "Pago fallido",
          body: `Falló el pago de la orden ${pi.metadata?.order_id ?? "?"}`,
          data: { order_id: pi.metadata?.order_id }, target_role: "admin",
        });
        break;
      }
      case "charge.refunded": {
        const ch = event.data.object as Stripe.Charge;
        await db.from("payments").update({ status: "refunded" }).eq("stripe_charge_id", ch.id);
        await db.from("notifications").insert({
          type: "order_refunded", title: "Reembolso procesado",
          body: `Reembolso del cargo ${ch.id}`, data: { charge: ch.id }, target_role: "admin",
        });
        break;
      }
    }
  } catch (e) {
    console.error("[webhook] error procesando el evento:", e);
    return new NextResponse(`handler error: ${String(e)}`, { status: 500 });
  }

  console.log("[webhook] OK:", event.type);
  return NextResponse.json({ received: true });
}
