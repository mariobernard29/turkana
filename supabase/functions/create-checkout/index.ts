// create-checkout
// Crea una Stripe Checkout Session (tarjeta + OXXO) para una orden del e-commerce.
// El front crea la orden en estado 'pending' y llama aquí con { order_id }.
import Stripe from "https://esm.sh/stripe@16?target=deno";
import { adminClient } from "../_shared/supabase.ts";
import { handleOptions, json } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const { order_id } = await req.json();
    if (!order_id) return json({ error: "order_id requerido" }, 400);

    const db = adminClient();

    const { data: order, error } = await db
      .from("orders")
      .select("id, order_number, total_cents, shipping_cents, customer_id, status")
      .eq("id", order_id)
      .single();
    if (error || !order) return json({ error: "Orden no encontrada" }, 404);
    if (order.status !== "pending") return json({ error: "Orden no pagable" }, 409);

    const { data: items } = await db
      .from("order_items")
      .select("name, unit_price_cents, quantity")
      .eq("order_id", order_id);

    // Line items en centavos (precio sin IVA; el IVA y envío van como líneas aparte).
    const line_items = (items ?? []).map((it) => ({
      quantity: it.quantity,
      price_data: {
        currency: "mxn",
        unit_amount: it.unit_price_cents,
        product_data: { name: it.name },
      },
    }));

    // Una sola línea con IVA + envío para que el total cuadre con la orden.
    const extra = order.total_cents -
      (items ?? []).reduce((s, it) => s + it.unit_price_cents * it.quantity, 0);
    if (extra > 0) {
      line_items.push({
        quantity: 1,
        price_data: {
          currency: "mxn",
          unit_amount: extra,
          product_data: { name: "IVA + envío" },
        },
      });
    }

    const site = Deno.env.get("SITE_URL") ?? "https://turkanajewelry.com";
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency: "mxn",
      line_items,
      payment_method_types: ["card", "oxxo"],
      payment_method_options: { oxxo: { expires_after_days: 3 } },
      metadata: { order_id: order.id, order_number: order.order_number },
      success_url: `${site}/checkout/exito?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/checkout`,
    });

    await db.from("orders").update({ notes: `stripe_session:${session.id}` })
      .eq("id", order.id);

    return json({ url: session.url, session_id: session.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
