// Email de cupón Turkana Rewards (encabezado/footer fijos; solo cambia el cupón).
export type CouponEmailData = {
  code: string;
  type: "order" | "product";
  discountKind: "percent" | "amount";
  discountValue: number; // % (1-100) o centavos
  productName?: string | null;
  productImage?: string | null; // URL absoluta
};

function discountLabel(d: CouponEmailData) {
  const v = d.discountKind === "percent" ? `${d.discountValue}%` : `$${(d.discountValue / 100).toFixed(2)}`;
  return d.type === "product"
    ? `${v} de descuento en ${d.productName ?? "una pieza seleccionada"}`
    : `${v} de descuento en tu compra`;
}

function html(name: string, d: CouponEmailData) {
  const productBlock = d.type === "product" && d.productImage
    ? `<div style="text-align:center;margin:8px 0 20px">
         <img src="${d.productImage}" alt="${d.productName ?? ""}" style="width:200px;height:200px;object-fit:cover;border-radius:12px"/>
         <p style="margin:8px 0 0;font-size:13px;color:#2b2b2b">${d.productName ?? ""}</p>
       </div>`
    : "";

  return `
  <div style="background:#faf8f5;padding:48px 0;font-family:Helvetica,Arial,sans-serif;color:#2b2b2b">
    <div style="max-width:560px;margin:0 auto;background:#fff;padding:48px 40px">
      <h1 style="font-family:Georgia,serif;font-weight:400;font-size:26px;letter-spacing:2px;text-align:center;margin:0 0 4px">TURKANA</h1>
      <p style="text-align:center;color:#a08c6b;font-size:11px;letter-spacing:3px;margin:0 0 28px">REWARDS</p>

      <h2 style="font-family:Georgia,serif;font-weight:400;font-size:22px;margin:0 0 12px;text-align:center">Un regalo para ti, ${name || "miembro"}</h2>
      <p style="text-align:center;color:#666;font-size:14px;margin:0 0 24px">Como miembro de Turkana Rewards, tienes un cupón exclusivo:</p>

      ${productBlock}

      <div style="border:2px dashed #a08c6b;border-radius:16px;padding:24px;text-align:center;margin:0 0 8px">
        <p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;color:#a08c6b;text-transform:uppercase">Tu cupón</p>
        <p style="margin:0 0 8px;font-family:monospace;font-size:30px;letter-spacing:4px;color:#2b2b2b">${d.code}</p>
        <p style="margin:0;font-size:15px;color:#856f4f">${discountLabel(d)}</p>
      </div>

      <p style="text-align:center;font-size:12px;color:#999;margin:20px 0 0">
        Presenta este código en tienda o aplícalo en línea. Sujeto a disponibilidad y vigencia.
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:28px 0"/>
      <p style="font-size:12px;color:#999;text-align:center;line-height:1.6">
        Turkana Jewelry · Plaza Alcazar Business Park · Los Mochis, Sinaloa<br/>
        Síguenos @turkana.mx
      </p>
    </div>
  </div>`;
}

export async function sendCouponEmail(to: string, name: string, d: CouponEmailData): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !key.startsWith("re_")) return { ok: false, error: "RESEND_API_KEY no configurada" };

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "Turkana Jewelry <onboarding@resend.dev>",
      to,
      subject: "Tienes un cupón exclusivo de Turkana Rewards 🎁",
      html: html(name, d),
    }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    return { ok: false, error: (body as { message?: string }).message ?? `Resend ${r.status}` };
  }
  return { ok: true };
}
