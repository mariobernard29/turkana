// Envío de correos transaccionales con branding Turkana vía Resend.
// Se dispara MANUALMENTE desde el admin (botones en cada pedido).

export type EmailTemplate =
  | "order_placed"
  | "payment_confirmed"
  | "order_prepared"
  | "order_shipped"
  | "order_delivered";

const SUBJECTS: Record<EmailTemplate, string> = {
  order_placed: "Recibimos tu compra — Turkana Jewelry",
  payment_confirmed: "Tu pago fue confirmado — Turkana Jewelry",
  order_prepared: "Tu pedido está listo — Turkana Jewelry",
  order_shipped: "Tu pedido va en camino — Turkana Jewelry",
  order_delivered: "¡Gracias por tu compra! — Turkana Jewelry",
};

// Paqueterías principales de México + plantilla de enlace de rastreo.
export const CARRIERS: Record<string, { label: string; trackUrl?: (n: string) => string }> = {
  dhl: { label: "DHL", trackUrl: (n) => `https://www.dhl.com/mx-es/home/tracking.html?tracking-id=${encodeURIComponent(n)}` },
  fedex: { label: "FedEx", trackUrl: (n) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}` },
  estafeta: { label: "Estafeta", trackUrl: (n) => `https://www.estafeta.com/Herramientas/Rastreo?guias=${encodeURIComponent(n)}` },
  paquetexpress: { label: "Paquetexpress", trackUrl: (n) => `https://www.paquetexpress.com.mx/rastreo?guia=${encodeURIComponent(n)}` },
  redpack: { label: "Redpack", trackUrl: (n) => `https://www.redpack.com.mx/es/rastreo/?guias=${encodeURIComponent(n)}` },
  ups: { label: "UPS", trackUrl: (n) => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}` },
  correos: { label: "Correos de México", trackUrl: (n) => `https://www.correosdemexico.gob.mx/SSLServicios/SeguimientoEnvio/Seguimiento.aspx?guia=${encodeURIComponent(n)}` },
  noventa9: { label: "99minutos", trackUrl: (n) => `https://99minutos.com/rastreo?tracking=${encodeURIComponent(n)}` },
  otra: { label: "Otra paquetería" },
};

export function carrierTrackUrl(carrierKey: string, tracking: string): string | undefined {
  return CARRIERS[carrierKey]?.trackUrl?.(tracking);
}
export function carrierLabel(carrierKey: string): string {
  return CARRIERS[carrierKey]?.label ?? carrierKey;
}

function layout(title: string, inner: string) {
  return `
  <div style="background:#faf8f5;padding:48px 0;font-family:Helvetica,Arial,sans-serif;color:#2b2b2b">
    <div style="max-width:560px;margin:0 auto;background:#fff;padding:48px 40px">
      <h1 style="font-family:Georgia,serif;font-weight:400;font-size:26px;letter-spacing:2px;text-align:center;margin:0 0 4px">TURKANA</h1>
      <p style="text-align:center;color:#a08c6b;font-size:11px;letter-spacing:3px;margin:0 0 32px">JEWELRY</p>
      <h2 style="font-family:Georgia,serif;font-weight:400;font-size:20px;margin:0 0 16px">${title}</h2>
      ${inner}
      <hr style="border:none;border-top:1px solid #eee;margin:32px 0"/>
      <p style="font-size:12px;color:#999;text-align:center;line-height:1.6">
        Turkana Jewelry · Plaza Alcazar Business Park · Los Mochis, Sinaloa
      </p>
    </div>
  </div>`;
}

type EmailData = { customer_name?: string; order_number?: string; carrier?: string; tracking?: string; tracking_url?: string };

function render(template: EmailTemplate, data: EmailData) {
  const name = data.customer_name ?? "";
  const folio = data.order_number ?? "";
  switch (template) {
    case "order_placed":
      return layout("Gracias por tu compra",
        `<p>Hola ${name}, recibimos tu pedido <strong>${folio}</strong>. Te avisaremos cuando confirmemos el pago.</p>`);
    case "payment_confirmed":
      return layout("Pago confirmado",
        `<p>Hola ${name}, confirmamos el pago de tu pedido <strong>${folio}</strong>. Pronto comenzaremos a prepararlo con todo el cuidado que merece.</p>`);
    case "order_prepared":
      return layout("Tu pedido está listo",
        `<p>Hola ${name}, tu pedido <strong>${folio}</strong> ya está preparado y empacado.</p>`);
    case "order_shipped": {
      const trackBtn = data.tracking_url
        ? `<p style="text-align:center;margin:24px 0"><a href="${data.tracking_url}" style="display:inline-block;background:#2b2b2b;color:#faf8f5;text-decoration:none;padding:12px 28px;border-radius:999px;font-size:13px;letter-spacing:2px;text-transform:uppercase">Rastrear mi pedido</a></p>`
        : "";
      return layout("Tu pedido va en camino",
        `<p>Hola ${name}, tu pedido <strong>${folio}</strong> fue enviado. 🚚</p>
         <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;border-top:1px solid #eee;border-bottom:1px solid #eee">
           ${data.carrier ? `<tr><td style="padding:8px 0;color:#666">Paquetería</td><td style="padding:8px 0;text-align:right">${data.carrier}</td></tr>` : ""}
           ${data.tracking ? `<tr><td style="padding:8px 0;color:#666">Número de guía</td><td style="padding:8px 0;text-align:right;font-family:monospace">${data.tracking}</td></tr>` : ""}
         </table>
         ${trackBtn}
         <p style="font-size:12px;color:#999">El rastreo puede tardar unas horas en mostrar movimientos.</p>`);
    }
    case "order_delivered":
      return layout("¡Gracias por tu compra!",
        `<p>Hola ${name}, nos da mucho gusto que tu pedido <strong>${folio}</strong> haya llegado a tus manos. ✨</p>
         <p>Esperamos que tu pieza Turkana te acompañe en muchos momentos especiales. Si te encantó, nos encantaría verte de nuevo.</p>
         <p style="margin-top:16px">Con cariño,<br/>El equipo de Turkana Jewelry.</p>`);
  }
}

export async function sendEmail(
  template: EmailTemplate,
  to: string,
  data: EmailData,
): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !key.startsWith("re_") || key === "re_...") {
    return { ok: false, error: "RESEND_API_KEY no configurada en .env.local" };
  }

  const html = render(template, data);
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "Turkana Jewelry <onboarding@resend.dev>",
      to,
      subject: SUBJECTS[template],
      html,
    }),
  });

  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    return { ok: false, error: (body as { message?: string }).message ?? `Resend ${r.status}` };
  }
  return { ok: true };
}
