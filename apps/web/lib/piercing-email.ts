// Correos de seguimiento de perforaciones (cuidados, 1ª semana, 1er mes).
// Se disparan MANUALMENTE desde /admin/perforaciones/[id].
// La redacción vive en lib/piercing-content.ts; aquí sólo se pinta en HTML, para
// que el mismo texto pueda mandarse también por WhatsApp (lib/piercing-whatsapp.ts).
// Nota: el layout de marca está duplicado en lib/email.ts, lib/admin-alerts.ts y
// lib/coupon-email.ts; se mantiene el mismo esqueleto aquí para no reescribir esos.
import { STORE } from "@/lib/business";
import {
  SUBJECTS,
  TITLES,
  fichaRows,
  piercingBlocks,
  type Block,
  type PiercingEmailData,
  type PiercingEmailKind,
} from "@/lib/piercing-content";

export type { PiercingEmailData, PiercingEmailKind };

const WHATSAPP =
  "https://wa.me/526682410761?text=" +
  encodeURIComponent("¡Hola Turkana! ✨ Tengo una duda sobre mi perforación 👂");

// *negrita* y saltos de línea, tal como vienen del contenido compartido.
function inline(text: string) {
  return text
    .replace(/\*([^*]+)\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br/>");
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
  const rows = fichaRows(d)
    .map(
      (r) =>
        `<tr><td style="padding:8px 0;color:#666">${r.label}</td><td style="padding:8px 0;text-align:right">${r.value}</td></tr>`,
    )
    .join("");
  return `
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;border-top:1px solid #eee;border-bottom:1px solid #eee">
    ${rows}
  </table>`;
}

function renderBlock(b: Block, d: PiercingEmailData): string {
  switch (b.t) {
    case "p":
      return `<p style="font-size:14px;line-height:1.6">${inline(b.text)}</p>`;
    case "note":
      return `<p style="font-size:14px;line-height:1.6;background:#faf8f5;border-left:3px solid #a08c6b;padding:12px 16px;margin:16px 0">${inline(b.text)}</p>`;
    case "ficha":
      return ficha(d);
    case "ul": {
      const items = b.items
        .map((i) => `<li style="margin:0 0 10px;line-height:1.55">${inline(i)}</li>`)
        .join("");
      return `<ul style="padding-left:20px;margin:16px 0;font-size:14px">${items}</ul>`;
    }
  }
}

function render(kind: PiercingEmailKind, d: PiercingEmailData) {
  const inner = piercingBlocks(kind, d).map((b) => renderBlock(b, d)).join("\n");
  return layout(TITLES[kind], inner);
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
