// Correos de seguimiento de perforaciones (cuidados, 1ª semana, 1er mes).
// Se disparan MANUALMENTE desde /admin/perforaciones/[id].
// Nota: el layout de marca está duplicado en lib/email.ts, lib/admin-alerts.ts y
// lib/coupon-email.ts; se mantiene el mismo esqueleto aquí para no reescribir esos.
import { STORE } from "@/lib/business";
import { hasCartilage, spotsSummary } from "@/lib/piercings";

export type PiercingEmailKind = "care" | "week" | "month";

const SUBJECTS: Record<PiercingEmailKind, string> = {
  care: "Cuidados de tu nueva perforación — Turkana Jewelry",
  week: "¿Cómo va tu perforación? — Primera semana",
  month: "Tu perforación cumple un mes ✨ — Turkana Jewelry",
};

export type PiercingEmailData = {
  customerName: string;
  performedAt: string; // YYYY-MM-DD
  spots: string[];
};

const WHATSAPP =
  "https://wa.me/526682410761?text=" +
  encodeURIComponent("¡Hola Turkana! ✨ Tengo una duda sobre mi perforación 👂");

function fecha(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function layout(title: string, inner: string) {
  return `
  <div style="background:#faf8f5;padding:48px 0;font-family:Helvetica,Arial,sans-serif;color:#2b2b2b">
    <div style="max-width:560px;margin:0 auto;background:#fff;padding:48px 40px">
      <h1 style="font-family:Georgia,serif;font-weight:400;font-size:26px;letter-spacing:2px;text-align:center;margin:0 0 4px">TURKANA</h1>
      <p style="text-align:center;color:#a08c6b;font-size:11px;letter-spacing:3px;margin:0 0 32px">JEWELRY</p>
      <h2 style="font-family:Georgia,serif;font-weight:400;font-size:20px;margin:0 0 16px">${title}</h2>
      ${inner}
      <p style="text-align:center;margin:28px 0 0">
        <a href="${WHATSAPP}" style="display:inline-block;background:#2b2b2b;color:#faf8f5;text-decoration:none;padding:12px 28px;border-radius:999px;font-size:13px;letter-spacing:2px;text-transform:uppercase">Escríbenos por WhatsApp</a>
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:32px 0"/>
      <p style="font-size:12px;color:#999;text-align:center;line-height:1.6">
        Turkana Jewelry · ${STORE.addressLines.join(" · ")}<br/>
        Tel. ${STORE.phone} · ${STORE.instagram}
      </p>
    </div>
  </div>`;
}

// Recuadro con los datos de la perforación, va en los tres correos.
function ficha(d: PiercingEmailData) {
  return `
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;border-top:1px solid #eee;border-bottom:1px solid #eee">
    <tr><td style="padding:8px 0;color:#666">Fecha</td><td style="padding:8px 0;text-align:right">${fecha(d.performedAt)}</td></tr>
    <tr><td style="padding:8px 0;color:#666">Perforación</td><td style="padding:8px 0;text-align:right">${spotsSummary(d.spots)}</td></tr>
  </table>`;
}

function li(text: string) {
  return `<li style="margin:0 0 10px;line-height:1.55">${text}</li>`;
}

function lista(items: string[]) {
  return `<ul style="padding-left:20px;margin:16px 0;font-size:14px">${items.join("")}</ul>`;
}

function careHtml(d: PiercingEmailData) {
  return layout(
    "Cuidados de tu nueva perforación",
    `<p style="font-size:14px;line-height:1.6">Hola ${d.customerName}, gracias por confiar en nosotros ✨
      Tu arete es de <strong>acero quirúrgico hipoalergénico</strong> y se aplicó con un cartucho
      estéril de un solo uso. Para que cicatrice bien, sigue estas indicaciones:</p>
     ${ficha(d)}
     ${lista([
       li("<strong>Lava tus manos</strong> siempre antes de tocar la zona."),
       li("<strong>No muevas ni gires el arete</strong>, ni lo aprietes más."),
       li("Limpia <strong>dos veces al día</strong> con solución salina estéril, usando gasa (no algodón, deja pelusa)."),
       li("<strong>No entres a albercas, mar, jacuzzi ni tinas durante las primeras 4 semanas.</strong> El agua estancada es la causa más común de infección."),
       li("<strong>Evita sudar mucho</strong> los primeros días: gimnasio, ejercicio intenso, sauna o vapor."),
       li("Nada de perfume, spray para el cabello, maquillaje, cremas ni tintes cerca de la perforación."),
       li("Duerme del lado contrario y ten cuidado al peinarte, al vestirte y con los audífonos."),
       li("<strong>No retires el arete antes de 6 a 8 semanas</strong>, aunque se vea bien: por dentro sigue cicatrizando."),
     ])}
     <p style="font-size:14px;line-height:1.6"><strong>Es normal</strong> algo de enrojecimiento, hinchazón leve,
      comezón y una costra clara los primeros días.</p>
     <p style="font-size:14px;line-height:1.6;background:#faf8f5;border-left:3px solid #a08c6b;padding:12px 16px;margin:16px 0">
      <strong>Acude con nosotros o con tu médico</strong> si hay dolor que va en aumento, calor,
      hinchazón que no baja, pus amarillo o verde, o fiebre.</p>
     <p style="font-size:14px;line-height:1.6">Cualquier duda, escríbenos. Con gusto te revisamos en tienda sin costo.</p>`,
  );
}

function weekHtml(d: PiercingEmailData) {
  return layout(
    "¿Cómo va tu perforación?",
    `<p style="font-size:14px;line-height:1.6">Hola ${d.customerName}, ya pasó la primera semana desde tu
      perforación y queremos saber cómo vas.</p>
     ${ficha(d)}
     <p style="font-size:14px;line-height:1.6"><strong>A estas alturas es normal</strong> que sigas notando
      un poco de enrojecimiento o sensibilidad al tocarla, y alguna costra clara. Lo que ya debería
      haber bajado es la hinchazón de los primeros días.</p>
     ${lista([
       li("Sigue limpiando <strong>dos veces al día</strong> con solución salina."),
       li("<strong>Aún no</strong> entres a la alberca, al mar ni al jacuzzi."),
       li("<strong>No te quites el arete todavía</strong>, aunque se vea bien."),
       li("No lo gires ni lo muevas para “despegarlo”: eso reabre la herida."),
     ])}
     <p style="font-size:14px;line-height:1.6">Si notas dolor que va en aumento, calor, pus o mal olor,
      <strong>pasa a la tienda y te revisamos sin costo</strong>. Más vale checarlo a tiempo.</p>
     <p style="font-size:14px;line-height:1.6">Con cariño,<br/>El equipo de Turkana Jewelry.</p>`,
  );
}

function monthHtml(d: PiercingEmailData) {
  const cartilago = hasCartilage(d.spots);
  const tiempos = cartilago
    ? `Como tu perforación es en <strong>cartílago</strong> (parte media o alta de la oreja),
       la cicatrización es más lenta: puede tomar de <strong>3 a 6 meses</strong>. Ten un poco más de paciencia.`
    : `En el <strong>lóbulo</strong> la cicatrización suele completarse entre las <strong>6 y 8 semanas</strong>,
       así que ya estás en la recta final.`;

  return layout(
    "Tu perforación cumple un mes",
    `<p style="font-size:14px;line-height:1.6">Hola ${d.customerName}, ¡ya pasó un mes! 🎉</p>
     ${ficha(d)}
     <p style="font-size:14px;line-height:1.6">${tiempos}</p>
     ${lista([
       li("Ya puedes <strong>volver a la alberca y al mar</strong> (pasadas las 4 semanas), pero enjuaga bien la zona con agua limpia al salir."),
       li("Sigue limpiando una o dos veces al día hasta que deje de estar sensible."),
       li(cartilago
         ? "<strong>Todavía no cambies el arete.</strong> En cartílago conviene esperar a que la perforación deje de doler y de secretar por completo."
         : "Si ya no hay molestia ni secreción, <strong>pronto podrás cambiar tu arete</strong>."),
       li("<strong>Pasa a la tienda y te ayudamos a cambiarlo</strong>, además de revisar que todo haya cicatrizado bien."),
     ])}
     <p style="font-size:14px;line-height:1.6">Y si quieres estrenar algo nuevo, te esperamos con gusto ✨</p>
     <p style="font-size:14px;line-height:1.6">Con cariño,<br/>El equipo de Turkana Jewelry.</p>`,
  );
}

function render(kind: PiercingEmailKind, d: PiercingEmailData) {
  switch (kind) {
    case "care": return careHtml(d);
    case "week": return weekHtml(d);
    case "month": return monthHtml(d);
  }
}

export async function sendPiercingEmail(
  kind: PiercingEmailKind,
  to: string,
  data: PiercingEmailData,
): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !key.startsWith("re_") || key === "re_...") {
    return { ok: false, error: "RESEND_API_KEY no configurada en .env.local" };
  }

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "Turkana Jewelry <onboarding@resend.dev>",
      to,
      subject: SUBJECTS[kind],
      html: render(kind, data),
    }),
  });

  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    return { ok: false, error: (body as { message?: string }).message ?? `Resend ${r.status}` };
  }
  return { ok: true };
}
