// send-email
// Envía correos transaccionales con branding Turkana vía Resend.
// Se invoca desde el admin (botones) y desde otras Edge Functions.
import { adminClient } from "../_shared/supabase.ts";
import { handleOptions, json } from "../_shared/cors.ts";

type TemplateData = Record<string, unknown>;

const SUBJECTS: Record<string, string> = {
  order_placed: "Recibimos tu compra — Turkana Jewelry",
  payment_confirmed: "Tu pago fue confirmado — Turkana Jewelry",
  order_prepared: "Tu pedido está listo — Turkana Jewelry",
  order_shipped: "Tu pedido va en camino — Turkana Jewelry",
};

// Plantilla base editorial (serif en encabezado, mucho espacio en blanco).
function layout(title: string, inner: string): string {
  return `
  <div style="background:#faf8f5;padding:48px 0;font-family:Helvetica,Arial,sans-serif;color:#2b2b2b">
    <div style="max-width:560px;margin:0 auto;background:#fff;padding:48px 40px">
      <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:26px;letter-spacing:1px;text-align:center;margin:0 0 8px">TURKANA</h1>
      <p style="text-align:center;color:#a08c6b;font-size:11px;letter-spacing:3px;margin:0 0 32px">JEWELRY</p>
      <h2 style="font-family:Georgia,serif;font-weight:400;font-size:20px;margin:0 0 16px">${title}</h2>
      ${inner}
      <hr style="border:none;border-top:1px solid #eee;margin:32px 0"/>
      <p style="font-size:12px;color:#999;text-align:center;line-height:1.6">
        Turkana Jewelry · Blvrd Canuto Ibarra Guerrero 1700, Los Mochis, Sinaloa<br/>
        Plaza Alcazar Business Park
      </p>
    </div>
  </div>`;
}

function render(template: string, data: TemplateData): string {
  const name = (data.customer_name as string) ?? "";
  const folio = (data.order_number as string) ?? "";
  switch (template) {
    case "order_placed":
      return layout("Gracias por tu compra",
        `<p>Hola ${name}, recibimos tu pedido <strong>${folio}</strong>. Te avisaremos cuando confirmemos el pago.</p>`);
    case "payment_confirmed":
      return layout("Pago confirmado",
        `<p>Hola ${name}, confirmamos el pago de tu pedido <strong>${folio}</strong>. Pronto comenzaremos a prepararlo.</p>`);
    case "order_prepared":
      return layout("Tu pedido está listo",
        `<p>Hola ${name}, tu pedido <strong>${folio}</strong> ya está preparado.</p>`);
    case "order_shipped":
      return layout("Tu pedido va en camino",
        `<p>Hola ${name}, tu pedido <strong>${folio}</strong> fue enviado.</p>`);
    default:
      return layout("Turkana Jewelry", `<p>${(data.message as string) ?? ""}</p>`);
  }
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const { template, to, data } = await req.json();
    if (!template || !to) return json({ error: "template y to requeridos" }, 400);

    const html = render(template, data ?? {});
    const subject = SUBJECTS[template] ?? "Turkana Jewelry";

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: Deno.env.get("EMAIL_FROM"),
        to,
        subject,
        html,
      }),
    });

    const result = await r.json();
    if (!r.ok) return json({ error: result }, 502);

    // Registro opcional del envío.
    try {
      const db = adminClient();
      await db.from("notifications").insert({
        type: "email_sent",
        title: `Correo enviado: ${template}`,
        body: `Para ${to}`,
        data: { template, to, id: result.id },
        target_role: "admin",
      });
    } catch (_) { /* no bloquear el envío por el log */ }

    return json({ ok: true, id: result.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
