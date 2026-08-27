// Seguimientos de perforaciones por WhatsApp: el mismo texto que el correo
// (lib/piercing-content.ts), pero en plano y metido en un link wa.me para que el
// cajero lo mande desde el WhatsApp que ya tiene abierto en el equipo.
import {
  TITLES,
  fichaRows,
  piercingBlocks,
  type PiercingEmailData,
  type PiercingEmailKind,
} from "@/lib/piercing-content";

// WhatsApp entiende *negrita* igual que el contenido compartido, así que el
// texto pasa tal cual; sólo se acomodan las listas y la ficha.
export function piercingWhatsappText(
  kind: PiercingEmailKind,
  d: PiercingEmailData,
): string {
  const parts: string[] = [`*${TITLES[kind]}*`];

  for (const b of piercingBlocks(kind, d)) {
    switch (b.t) {
      case "p":
      case "note":
        parts.push(b.text);
        break;
      case "ficha":
        parts.push(fichaRows(d).map((r) => `${r.label}: ${r.value}`).join("\n"));
        break;
      case "ul":
        parts.push(b.items.map((i) => `• ${i}`).join("\n"));
        break;
    }
  }

  // Los seguimientos ya cierran con "El equipo de Turkana Jewelry"; el de cuidados no.
  if (!parts.some((p) => p.includes("El equipo de Turkana Jewelry"))) {
    parts.push("El equipo de Turkana Jewelry ✨");
  }
  return parts.join("\n\n");
}

// wa.me quiere el número con lada de país y sin signos. Los teléfonos de la
// tienda se capturan a 10 dígitos (México), pero puede venir ya con el 52.
export function whatsappNumber(phone?: string | null): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length === 10) return `52${d}`;                        // 668 241 0761
  if (d.length === 11 && d.startsWith("1")) return `52${d.slice(1)}`;
  if (d.length >= 11 && d.length <= 15) return d;              // ya trae lada de país
  return null;
}

export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const num = whatsappNumber(phone);
  if (!num) return null;
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}
