// Contenido de los seguimientos de perforaciones (cuidados, 1ª semana, 1er mes).
// Vive aquí una sola vez porque se manda por dos canales: correo (lib/piercing-email.ts,
// que lo pinta en HTML) y WhatsApp (lib/piercing-whatsapp.ts, que lo pinta en texto).
// Si se edita la redacción, cambia en los dos lados al mismo tiempo.
import { hasCartilage, spotsSummary } from "@/lib/piercings";

export type PiercingEmailKind = "care" | "week" | "month";

export type PiercingEmailData = {
  customerName: string;
  performedAt: string; // YYYY-MM-DD
  spots: string[];
};

// En los textos, *así* marca negrita: el correo lo vuelve <strong> y WhatsApp lo
// entiende tal cual. Un \n es un salto de línea dentro del mismo párrafo.
export type Block =
  | { t: "p"; text: string }
  | { t: "note"; text: string }   // recuadro de aviso (dolor, infección...)
  | { t: "ficha" }                // fecha y puntos perforados
  | { t: "ul"; items: string[] };

export const SUBJECTS: Record<PiercingEmailKind, string> = {
  care: "Cuidados de tu nueva perforación — Turkana Jewelry",
  week: "¿Cómo va tu perforación? — Primera semana",
  month: "Tu perforación cumple un mes ✨ — Turkana Jewelry",
};

export const TITLES: Record<PiercingEmailKind, string> = {
  care: "Cuidados de tu nueva perforación",
  week: "¿Cómo va tu perforación?",
  month: "Tu perforación cumple un mes",
};

export function fechaLarga(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Las dos filas de la ficha, para que cada canal las acomode a su manera.
export function fichaRows(d: PiercingEmailData): { label: string; value: string }[] {
  return [
    { label: "Fecha", value: fechaLarga(d.performedAt) },
    { label: "Perforación", value: spotsSummary(d.spots) },
  ];
}

function careBlocks(d: PiercingEmailData): Block[] {
  return [
    {
      t: "p",
      text: `Hola ${d.customerName}, gracias por confiar en nosotros ✨ Tu arete es de *acero quirúrgico hipoalergénico* y se aplicó con un cartucho estéril de un solo uso. Para que cicatrice bien, sigue estas indicaciones:`,
    },
    { t: "ficha" },
    {
      t: "ul",
      items: [
        "*Lava tus manos* siempre antes de tocar la zona.",
        "*No muevas ni gires el arete*, ni lo aprietes más.",
        "Limpia *dos veces al día* con solución salina estéril, usando gasa (no algodón, deja pelusa).",
        "*No entres a albercas, mar, jacuzzi ni tinas durante las primeras 4 semanas.* El agua estancada es la causa más común de infección.",
        "*Evita sudar mucho* los primeros días: gimnasio, ejercicio intenso, sauna o vapor.",
        "Nada de perfume, spray para el cabello, maquillaje, cremas ni tintes cerca de la perforación.",
        "Duerme del lado contrario y ten cuidado al peinarte, al vestirte y con los audífonos.",
        "*No retires el arete antes de 6 a 8 semanas*, aunque se vea bien: por dentro sigue cicatrizando.",
      ],
    },
    {
      t: "p",
      text: "*Es normal* algo de enrojecimiento, hinchazón leve, comezón y una costra clara los primeros días.",
    },
    {
      t: "note",
      text: "*Acude con nosotros o con tu médico* si hay dolor que va en aumento, calor, hinchazón que no baja, pus amarillo o verde, o fiebre.",
    },
    { t: "p", text: "Cualquier duda, escríbenos. Con gusto te revisamos en tienda sin costo." },
  ];
}

function weekBlocks(d: PiercingEmailData): Block[] {
  return [
    {
      t: "p",
      text: `Hola ${d.customerName}, ya pasó la primera semana desde tu perforación y queremos saber cómo vas.`,
    },
    { t: "ficha" },
    {
      t: "p",
      text: "*A estas alturas es normal* que sigas notando un poco de enrojecimiento o sensibilidad al tocarla, y alguna costra clara. Lo que ya debería haber bajado es la hinchazón de los primeros días.",
    },
    {
      t: "ul",
      items: [
        "Sigue limpiando *dos veces al día* con solución salina.",
        "*Aún no* entres a la alberca, al mar ni al jacuzzi.",
        "*No te quites el arete todavía*, aunque se vea bien.",
        "No lo gires ni lo muevas para “despegarlo”: eso reabre la herida.",
      ],
    },
    {
      t: "p",
      text: "Si notas dolor que va en aumento, calor, pus o mal olor, *pasa a la tienda y te revisamos sin costo*. Más vale checarlo a tiempo.",
    },
    { t: "p", text: "Con cariño,\nEl equipo de Turkana Jewelry." },
  ];
}

function monthBlocks(d: PiercingEmailData): Block[] {
  const cartilago = hasCartilage(d.spots);
  const tiempos = cartilago
    ? "Como tu perforación es en *cartílago* (parte media o alta de la oreja), la cicatrización es más lenta: puede tomar de *3 a 6 meses*. Ten un poco más de paciencia."
    : "En el *lóbulo* la cicatrización suele completarse entre las *6 y 8 semanas*, así que ya estás en la recta final.";

  return [
    { t: "p", text: `Hola ${d.customerName}, ¡ya pasó un mes! 🎉` },
    { t: "ficha" },
    { t: "p", text: tiempos },
    {
      t: "ul",
      items: [
        "Ya puedes *volver a la alberca y al mar* (pasadas las 4 semanas), pero enjuaga bien la zona con agua limpia al salir.",
        "Sigue limpiando una o dos veces al día hasta que deje de estar sensible.",
        cartilago
          ? "*Todavía no cambies el arete.* En cartílago conviene esperar a que la perforación deje de doler y de secretar por completo."
          : "Si ya no hay molestia ni secreción, *pronto podrás cambiar tu arete*.",
        "*Pasa a la tienda y te ayudamos a cambiarlo*, además de revisar que todo haya cicatrizado bien.",
      ],
    },
    { t: "p", text: "Y si quieres estrenar algo nuevo, te esperamos con gusto ✨" },
    { t: "p", text: "Con cariño,\nEl equipo de Turkana Jewelry." },
  ];
}

export function piercingBlocks(kind: PiercingEmailKind, d: PiercingEmailData): Block[] {
  switch (kind) {
    case "care": return careBlocks(d);
    case "week": return weekBlocks(d);
    case "month": return monthBlocks(d);
  }
}
