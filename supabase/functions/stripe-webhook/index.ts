// stripe-webhook
// Verifica la firma, concilia pagos, descuenta stock, acredita rewards y notifica.
// Idempotente: el unique index en payments evita procesar dos veces.
import Stripe from "https://esm.sh/stripe@16?target=deno";
import { adminClient } from "../_shared/supabase.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const whSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

// Marca una orden como pagada: payment + stock + rewards + notificación. Idempotente.
async function fulfillOrder(
  db: ReturnType<typeof adminClient>,
  orderId: string,
  payment: { method: string; amount: number; intent?: string; session?: string; raw: unknown },
) {
  // Idempotencia: si ya hay payment con este intent/session, salir.
  const ref = payment.intent ?? payment.session;
  const { data: existing } = await db
    .from("payments")
    .select("id")
    .or(`stripe_payment_intent_id.eq.${payment.intent ?? "none"},stripe_session_id.eq.${payment.session ?? "none"}`)
    .maybeSingle();
  if (existing) return;

  const { data: order } = await db
    .from("orders")
    .select("id, customer_id, subtotal_cents, status")
    .eq("id", orderId)
    .single();
  if (!order || order.status === "paid") return;

  await db.from("payments").insert({
    order_id: orderId,
    method: payment.method,
    amount_cents: payment.amount,
    status: "completed",
    stripe_payment_intent_id: payment.intent ?? null,
    stripe_session_id: payment.session ?? null,
    raw: payment.raw,
  });

  await db.from("orders").update({ status: "paid" }).eq("id", orderId);

  // Descontar stock del almacén e-commerce.
  const { data: items } = await db
    .from("order_items")
    .select("variant_id, quantity, is_service")
    .eq("order_id", orderId);
  for (const it of items ?? []) {
    if (it.is_service || !it.variant_id) continue;
    await db.rpc("decrement_stock", {
      p_variant: it.variant_id,
      p_location_key: "ecommerce",
      p_qty: it.quantity,
      p_ref_type: "order",
      p_ref_id: orderId,
    });
  }

  // Acreditar rewards (1.5% del subtotal sin IVA ni envío).
  if (order.customer_id) {
    await db.rpc("credit_rewards", {
      p_customer: order.customer_id,
      p_order: orderId,
      p_subtotal_cents: order.subtotal_cents,
      p_channel: "ecommerce",
    });
  }

  // Notificación al dashboard del admin (el correo al cliente se envía manual).
  await db.from("notifications").insert({
    type: "new_order",
    title: "Nuevo pedido pagado",
    body: `Orden ${orderId} pagada por $${(payment.amount / 100).toFixed(2)}`,
    data: { order_id: orderId },
    target_role: "admin",
  });
}

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("missing signature", { status: 400 });
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, whSecret);
  } catch (e) {
    return new Response(`bad signature: ${e}`, { status: 400 });
  }

  const db = adminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const orderId = s.metadata?.order_id;
        // Pago síncrono (tarjeta) ya está pagado; OXXO queda 'unpaid' aquí.
        if (orderId && s.payment_status === "paid") {
          await fulfillOrder(db, orderId, {
            method: "stripe",
            amount: s.amount_total ?? 0,
            session: s.id,
            intent: (s.payment_intent as string) ?? undefined,
            raw: event,
          });
        }
        break;
      }
      case "payment_intent.processing": {
        // OXXO: voucher generado, pago pendiente.
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = pi.metadata?.order_id;
        if (orderId) {
          await db.from("notifications").insert({
            type: "new_order",
            title: "OXXO pendiente de pago",
            body: `Orden ${orderId} con voucher OXXO generado`,
            data: { order_id: orderId },
            target_role: "admin",
          });
        }
        break;
      }
      case "payment_intent.succeeded": {
        // Confirma OXXO (o tarjeta async). Concilia y cumple la orden.
        const pi = event.data.object as Stripe.PaymentIntent;
        const orderId = pi.metadata?.order_id;
        if (orderId) {
          await fulfillOrder(db, orderId, {
            method: "oxxo",
            amount: pi.amount_received ?? pi.amount,
            intent: pi.id,
            raw: event,
          });
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await db.from("notifications").insert({
          type: "payment_failed",
          title: "Pago fallido",
          body: `Falló el pago de la orden ${pi.metadata?.order_id ?? "?"}`,
          data: { order_id: pi.metadata?.order_id },
          target_role: "admin",
        });
        break;
      }
      case "charge.refunded": {
        const ch = event.data.object as Stripe.Charge;
        await db.from("payments")
          .update({ status: "refunded" })
          .eq("stripe_charge_id", ch.id);
        await db.from("notifications").insert({
          type: "order_refunded",
          title: "Reembolso procesado",
          body: `Reembolso del cargo ${ch.id}`,
          data: { charge: ch.id },
          target_role: "admin",
        });
        // TODO: reponer stock y revertir rewards según política de devoluciones.
        break;
      }
    }
  } catch (e) {
    // Devolver 500 hace que Stripe reintente (idempotencia nos protege).
    return new Response(`handler error: ${e}`, { status: 500 });
  }

  return new Response("ok");
});
