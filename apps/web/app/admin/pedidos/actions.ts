"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, carrierLabel, carrierTrackUrl, type EmailTemplate } from "@/lib/email";

const VALID_STATUS = [
  "pending", "paid", "preparing", "shipped", "delivered", "completed", "cancelled",
] as const;
type OrderStatus = (typeof VALID_STATUS)[number];

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireStaff();
  if (!VALID_STATUS.includes(status)) return { ok: false, error: "Estado inválido" };

  const db = createAdminClient();
  const { error } = await db.from("orders").update({ status }).eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  // Reflejar en envíos cuando aplique.
  if (status === "shipped" || status === "delivered") {
    const { data: ship } = await db
      .from("shipments").select("id").eq("order_id", orderId).maybeSingle();
    const patch = status === "shipped"
      ? { status: "shipped", shipped_at: new Date().toISOString() }
      : { status: "delivered", delivered_at: new Date().toISOString() };
    if (ship) await db.from("shipments").update(patch).eq("id", (ship as { id: string }).id);
    else await db.from("shipments").insert({ order_id: orderId, ...patch });
  }

  await db.from("audit_logs").insert({
    actor_id: staff.id, action: `order.status.${status}`,
    entity_type: "orders", entity_id: orderId,
  });

  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
  return { ok: true };
}

export async function sendOrderEmail(
  orderId: string,
  template: EmailTemplate,
): Promise<{ ok: boolean; error?: string }> {
  await requireStaff();
  const db = createAdminClient();

  const { data } = await db
    .from("orders")
    .select("order_number, customers(full_name, email)")
    .eq("id", orderId)
    .maybeSingle();

  const order = data as unknown as {
    order_number: string;
    customers: { full_name: string; email: string | null } | { full_name: string; email: string | null }[] | null;
  } | null;
  if (!order) return { ok: false, error: "Pedido no encontrado" };

  const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers;
  if (!customer?.email) return { ok: false, error: "El cliente no tiene correo registrado" };

  const res = await sendEmail(template, customer.email, {
    customer_name: customer.full_name,
    order_number: order.order_number,
  });

  if (res.ok) {
    await db.from("notifications").insert({
      type: "email_sent",
      title: `Correo enviado al cliente`,
      body: `${template} → ${customer.email} (orden ${order.order_number})`,
      data: { order_id: orderId, template },
      target_role: "admin",
    });
  }
  return res;
}

// ── Guía de envío: guarda paquetería + número, marca enviado y avisa al cliente ─
async function orderCustomer(db: ReturnType<typeof createAdminClient>, orderId: string) {
  const { data } = await db.from("orders").select("order_number, customers(full_name, email)").eq("id", orderId).maybeSingle();
  const o = data as unknown as { order_number: string; customers: { full_name: string; email: string | null } | { full_name: string; email: string | null }[] | null } | null;
  if (!o) return null;
  const c = Array.isArray(o.customers) ? o.customers[0] : o.customers;
  return { orderNumber: o.order_number, name: c?.full_name ?? "", email: c?.email ?? null };
}

export async function sendShippingGuide(
  orderId: string,
  carrier: string,
  tracking: string,
): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireStaff();
  const db = createAdminClient();
  if (!carrier) return { ok: false, error: "Selecciona la paquetería" };
  if (!tracking.trim()) return { ok: false, error: "Ingresa el número de guía" };

  const info = await orderCustomer(db, orderId);
  if (!info) return { ok: false, error: "Pedido no encontrado" };
  if (!info.email) return { ok: false, error: "El cliente no tiene correo registrado" };

  // Guardar guía en el envío (upsert manual) y marcar el pedido como enviado.
  const now = new Date().toISOString();
  const patch = { status: "shipped" as const, shipped_at: now, carrier, tracking_number: tracking.trim() };
  const { data: ship } = await db.from("shipments").select("id").eq("order_id", orderId).maybeSingle();
  if (ship) await db.from("shipments").update(patch).eq("id", (ship as { id: string }).id);
  else await db.from("shipments").insert({ order_id: orderId, ...patch });
  await db.from("orders").update({ status: "shipped" }).eq("id", orderId);

  const res = await sendEmail("order_shipped", info.email, {
    customer_name: info.name,
    order_number: info.orderNumber,
    carrier: carrierLabel(carrier),
    tracking: tracking.trim(),
    tracking_url: carrierTrackUrl(carrier, tracking.trim()),
  });
  if (!res.ok) return res;

  await db.from("audit_logs").insert({ actor_id: staff.id, action: "order.shipped.guide", entity_type: "orders", entity_id: orderId, after: { carrier, tracking } });
  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
  return { ok: true };
}

export async function sendDeliveredThankYou(orderId: string): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireStaff();
  const db = createAdminClient();
  const info = await orderCustomer(db, orderId);
  if (!info) return { ok: false, error: "Pedido no encontrado" };
  if (!info.email) return { ok: false, error: "El cliente no tiene correo registrado" };

  await db.from("orders").update({ status: "delivered" }).eq("id", orderId);
  const { data: ship } = await db.from("shipments").select("id").eq("order_id", orderId).maybeSingle();
  const patch = { status: "delivered" as const, delivered_at: new Date().toISOString() };
  if (ship) await db.from("shipments").update(patch).eq("id", (ship as { id: string }).id);
  else await db.from("shipments").insert({ order_id: orderId, ...patch });

  const res = await sendEmail("order_delivered", info.email, { customer_name: info.name, order_number: info.orderNumber });
  if (!res.ok) return res;

  await db.from("audit_logs").insert({ actor_id: staff.id, action: "order.delivered.thanks", entity_type: "orders", entity_id: orderId });
  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
  return { ok: true };
}
