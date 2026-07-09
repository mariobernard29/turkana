// Alertas al correo de administración: ventas en línea, corte de caja e inventario bajo.
import { createAdminClient } from "@/lib/supabase/admin";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export async function getAlertConfig(): Promise<{ email: string; threshold: number }> {
  try {
    const db = createAdminClient();
    const { data } = await db.from("app_settings").select("key, value").in("key", ["admin_alert_email", "low_stock_threshold"]);
    const map = new Map(((data as unknown as { key: string; value: string }[]) ?? []).map((r) => [r.key, r.value]));
    return { email: (map.get("admin_alert_email") ?? "").trim(), threshold: parseInt(map.get("low_stock_threshold") ?? "5", 10) || 5 };
  } catch {
    return { email: "", threshold: 5 };
  }
}

function layout(title: string, inner: string, subtitle: string, footer: string) {
  return `
  <div style="background:#faf8f5;padding:40px 0;font-family:Helvetica,Arial,sans-serif;color:#2b2b2b">
    <div style="max-width:600px;margin:0 auto;background:#fff;padding:36px 32px">
      <h1 style="font-family:Georgia,serif;font-weight:400;font-size:22px;letter-spacing:2px;margin:0 0 2px">TURKANA</h1>
      <p style="color:#a08c6b;font-size:10px;letter-spacing:3px;margin:0 0 24px">${subtitle}</p>
      <h2 style="font-family:Georgia,serif;font-weight:400;font-size:19px;margin:0 0 16px">${title}</h2>
      ${inner}
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
      <p style="font-size:11px;color:#999;margin:0">${footer}</p>
    </div>
  </div>`;
}

// audience "customer" → subtítulo JEWELRY; "admin" → PANEL DE ADMINISTRACIÓN.
async function send(to: string, subject: string, title: string, inner: string, audience: "admin" | "customer" = "admin") {
  const subtitle = audience === "customer" ? "JEWELRY" : "PANEL DE ADMINISTRACIÓN";
  const footer = audience === "customer"
    ? "Turkana Jewelry · Plaza Alcazar Business Park · Los Mochis, Sinaloa"
    : "Alerta automática de Turkana Jewelry.";
  const key = process.env.RESEND_API_KEY;
  if (!key || !key.startsWith("re_") || !to) {
    console.warn("[alerts] no se envía correo:", !to ? "destinatario vacío" : "RESEND_API_KEY no configurada");
    return;
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "Turkana Jewelry <onboarding@resend.dev>",
        to, subject, html: layout(title, inner, subtitle, footer),
      }),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      console.error(`[alerts] Resend rechazó el correo a ${to}:`, (body as { message?: string }).message ?? r.status);
    } else {
      console.log(`[alerts] correo enviado a ${to}: ${subject}`);
    }
  } catch (e) {
    console.error("[alerts] error enviando correo:", e);
  }
}

const row = (l: string, v: string) => `<tr><td style="padding:3px 0;color:#666">${l}</td><td style="padding:3px 0;text-align:right">${v}</td></tr>`;

// ── Pedido pagado: confirmación al cliente + alerta al admin ────────────────────
export async function notifyOrderPaid(orderId: string) {
  const { email: adminEmail } = await getAlertConfig();
  const db = createAdminClient();

  const { data } = await db
    .from("orders")
    .select("order_number, created_at, subtotal_cents, discount_cents, shipping_cents, tax_cents, total_cents, shipping_method, shipping_address_id, customers(full_name, email, phone), order_items(name, sku, quantity, total_cents)")
    .eq("id", orderId).maybeSingle();
  if (!data) return;
  const o = data as unknown as {
    order_number: string; created_at: string; subtotal_cents: number; discount_cents: number; shipping_cents: number;
    tax_cents: number; total_cents: number; shipping_method: string | null; shipping_address_id: string | null;
    customers: { full_name: string; email: string | null; phone: string | null } | { full_name: string; email: string | null; phone: string | null }[] | null;
    order_items: { name: string; sku: string | null; quantity: number; total_cents: number }[];
  };
  const cust = Array.isArray(o.customers) ? o.customers[0] : o.customers;

  let addr = "—";
  if (o.shipping_address_id) {
    const { data: a } = await db.from("customer_addresses").select("street, ext_number, int_number, neighborhood, city, state, postal_code, references_note").eq("id", o.shipping_address_id).maybeSingle();
    const x = a as unknown as Record<string, string | null> | null;
    if (x) addr = `${x.street ?? ""} ${x.ext_number ?? ""}${x.int_number ? " int " + x.int_number : ""}, ${x.neighborhood ?? ""}, ${x.city ?? ""}, ${x.state ?? ""}, CP ${x.postal_code ?? ""}${x.references_note ? "<br/>Ref: " + x.references_note : ""}`;
  }

  const itemsHtml = (o.order_items ?? []).map((it) =>
    `<tr><td style="padding:4px 0">${it.quantity}× ${it.name} <span style="color:#999">(${it.sku ?? "—"})</span></td><td style="padding:4px 0;text-align:right">${money(it.total_cents)}</td></tr>`).join("");

  const totalsHtml = `
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      ${row("Subtotal", money(o.subtotal_cents))}
      ${o.discount_cents > 0 ? row("Descuento", "−" + money(o.discount_cents)) : ""}
      ${row("IVA (16%)", money(o.tax_cents))}
      ${row("Envío", o.shipping_cents === 0 ? "Gratis" : money(o.shipping_cents))}
      <tr><td style="padding:6px 0;font-weight:bold;border-top:1px solid #eee">TOTAL</td><td style="padding:6px 0;text-align:right;font-weight:bold;border-top:1px solid #eee">${money(o.total_cents)}</td></tr>
    </table>`;
  const itemsTable = `<table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0;border-top:1px solid #eee;border-bottom:1px solid #eee">${itemsHtml}</table>`;

  // Confirmación al CLIENTE (con productos, nombre y dirección de envío).
  if (cust?.email) {
    const customerInner = `
      <p style="margin:0 0 12px">Hola ${cust.full_name ?? ""}, confirmamos el pago de tu pedido <strong>${o.order_number}</strong>. ¡Gracias por tu compra! Pronto lo prepararemos con todo el cuidado que merece.</p>
      <p style="margin:0 0 4px;font-size:13px;color:#666">Enviar a:</p>
      <p style="margin:0 0 8px;font-size:13px"><strong>${cust.full_name ?? ""}</strong><br/>${addr}</p>
      ${itemsTable}
      ${totalsHtml}
      <p style="margin:16px 0 0;font-size:13px;color:#856f4f">📦 Te haremos llegar la información de rastreo (paquetería y número de guía) en cuanto tu pedido sea enviado.</p>`;
    await send(cust.email, `Confirmamos tu pedido ${o.order_number} — Turkana Jewelry`, "Pago confirmado", customerInner, "customer");
  }

  // Alerta al ADMIN (detalle interno completo).
  if (adminEmail) {
    const adminInner = `
      <p style="margin:0 0 12px"><strong>Folio ${o.order_number}</strong> · ${new Date(o.created_at).toLocaleString("es-MX")}</p>
      <p style="margin:0 0 4px;font-size:13px"><strong>Cliente:</strong> ${cust?.full_name ?? "—"}</p>
      <p style="margin:0 0 4px;font-size:13px"><strong>Correo:</strong> ${cust?.email ?? "—"} · <strong>Tel:</strong> ${cust?.phone ?? "—"}</p>
      <p style="margin:0 0 4px;font-size:13px"><strong>Envío (${o.shipping_method ?? "—"}):</strong> ${addr}</p>
      ${itemsTable}
      ${totalsHtml}`;
    await send(adminEmail, `🛒 Nueva venta en línea ${o.order_number} — ${money(o.total_cents)}`, "Nueva venta en línea", adminInner);
  }
}

// ── Corte de caja ──────────────────────────────────────────────────────────────
export type CashCutPayload = {
  sessionId: string;
  cashier: string; registerName: string; openedAt: string; closedAt: string;
  openingFloat: number; salesCount: number; discountsCents: number; refundsCents: number;
  dropsCents: number; precutsCents: number; peopleServed: number;
  expectedCash: number; expectedCard: number; expectedTransfer: number;
  countedCash: number; countedCard: number; countedTransfer: number; difference: number;
  lote: string;
};

export async function notifyCashCut(p: CashCutPayload) {
  const { email } = await getAlertConfig();
  if (!email) return;
  const db = createAdminClient();

  // Ventas del lote (cada cuenta con sus piezas y total).
  const { data: ords } = await db
    .from("orders")
    .select("order_number, total_cents, order_items(name, quantity, total_cents)")
    .eq("cash_session_id", p.sessionId)
    .order("created_at", { ascending: true });
  const orders = (ords as unknown as { order_number: string; total_cents: number; order_items: { name: string; quantity: number; total_cents: number }[] }[]) ?? [];

  const salesHtml = orders.length === 0
    ? `<p style="font-size:13px;color:#999;margin:0">Sin ventas registradas en el lote.</p>`
    : orders.map((o) => `
        <div style="border:1px solid #eee;border-radius:8px;padding:10px 12px;margin:0 0 8px">
          <p style="margin:0 0 6px;font-size:13px"><strong>Cuenta ${o.order_number}</strong></p>
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            ${(o.order_items ?? []).map((it) => `<tr><td style="padding:2px 0;color:#555">${it.quantity}× ${it.name}</td><td style="padding:2px 0;text-align:right">${money(it.total_cents)}</td></tr>`).join("")}
            <tr><td style="padding:5px 0 0;font-weight:bold;border-top:1px solid #eee">Total</td><td style="padding:5px 0 0;text-align:right;font-weight:bold;border-top:1px solid #eee">${money(o.total_cents)}</td></tr>
          </table>
        </div>`).join("");

  const diffColor = p.difference === 0 ? "#16a34a" : p.difference > 0 ? "#2563eb" : "#dc2626";
  const inner = `
    <p style="margin:0 0 4px;font-size:13px"><strong>Caja:</strong> ${p.registerName} · <strong>Cajero:</strong> ${p.cashier}</p>
    <p style="margin:0 0 4px;font-size:13px"><strong>Lote:</strong> ${p.lote} · <strong>Personas atendidas:</strong> ${p.peopleServed}</p>
    <p style="margin:0 0 16px;font-size:13px"><strong>Apertura:</strong> ${new Date(p.openedAt).toLocaleString("es-MX")} · <strong>Cierre:</strong> ${new Date(p.closedAt).toLocaleString("es-MX")}</p>

    <p style="margin:0 0 8px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#a08c6b">Ventas del lote (${orders.length})</p>
    ${salesHtml}

    <p style="margin:16px 0 8px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#a08c6b">Resumen de caja</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      ${row("Fondo inicial", money(p.openingFloat))}
      ${row("Ventas", String(p.salesCount))}
      ${row("Descuentos otorgados", "−" + money(p.discountsCents))}
      ${row("Reembolsos / cambios", "−" + money(p.refundsCents))}
      ${row("Resguardos", "−" + money(p.dropsCents))}
      ${p.precutsCents > 0 ? row("Precortes", money(p.precutsCents)) : ""}
      <tr><td colspan="2" style="padding:8px 0 2px;font-weight:bold">Esperado</td></tr>
      ${row("Efectivo esperado", money(p.expectedCash))}
      ${row("Tarjeta esperada", money(p.expectedCard))}
      ${row("Transferencia esperada", money(p.expectedTransfer))}
      <tr><td colspan="2" style="padding:8px 0 2px;font-weight:bold">Contado</td></tr>
      ${row("Efectivo contado", money(p.countedCash))}
      ${row("Tarjeta contada", money(p.countedCard))}
      ${row("Transferencia contada", money(p.countedTransfer))}
    </table>
    <p style="margin:14px 0 0;font-size:15px;text-align:right"><strong>Diferencia: <span style="color:${diffColor}">${p.difference >= 0 ? "+" : ""}${money(p.difference)}</span></strong></p>`;
  await send(email, `🧾 Corte de caja — ${p.registerName} (${p.difference === 0 ? "cuadró" : "dif. " + money(p.difference)})`, "Corte de caja", inner);
}

// ── Inventario bajo ─────────────────────────────────────────────────────────────
export async function checkLowStockAfterSale(
  entries: { variantId: string; qty: number }[],
  locationKey: "tienda" | "ecommerce",
  locationLabel: string,
) {
  const { email, threshold } = await getAlertConfig();
  if (!email || entries.length === 0) return;
  const db = createAdminClient();

  const { data: loc } = await db.from("inventory_locations").select("id").eq("key", locationKey).maybeSingle();
  if (!loc) return;
  const locId = (loc as { id: string }).id;
  const ids = [...new Set(entries.map((e) => e.variantId))];

  const [{ data: levels }, { data: vinfo }] = await Promise.all([
    db.from("stock_levels").select("variant_id, quantity, reserved").eq("location_id", locId).in("variant_id", ids),
    db.from("product_variants").select("id, sku, products(name, track_inventory)").in("id", ids),
  ]);
  const availMap = new Map(((levels as unknown as { variant_id: string; quantity: number; reserved: number }[]) ?? []).map((l) => [l.variant_id, Math.max(0, l.quantity - l.reserved)]));
  const infoMap = new Map(((vinfo as unknown as { id: string; sku: string; products: { name: string; track_inventory?: boolean } | { name: string; track_inventory?: boolean }[] | null }[]) ?? []).map((v) => [v.id, v]));

  const low: { name: string; sku: string; qty: number }[] = [];
  for (const e of entries) {
    const info = infoMap.get(e.variantId);
    if (!info) continue;
    const prod = Array.isArray(info.products) ? info.products[0] : info.products;
    if (prod?.track_inventory === false) continue;
    const after = availMap.get(e.variantId) ?? 0;
    const before = after + e.qty;
    if (before > threshold && after <= threshold) low.push({ name: prod?.name ?? info.sku, sku: info.sku, qty: after });
  }
  if (low.length === 0) return;

  const rows = low.map((l) =>
    `<tr><td style="padding:5px 0">${l.name} <span style="color:#999">(${l.sku})</span></td><td style="padding:5px 0;text-align:right;color:#dc2626;font-weight:bold">${l.qty} pza</td></tr>`).join("");
  const inner = `
    <p style="margin:0 0 8px;font-size:13px">Estos productos llegaron a <strong>${threshold} piezas o menos</strong> en <strong>${locationLabel}</strong>. Considera reabastecer o hacer un traspaso.</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;border-top:1px solid #eee;border-bottom:1px solid #eee">${rows}</table>`;
  await send(email, `⚠️ Inventario bajo — ${locationLabel} (${low.length})`, "Inventario bajo", inner);
}
