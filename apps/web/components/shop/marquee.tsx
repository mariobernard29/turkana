// Tira de promesas que corre sin fin.
//
// Antes esto eran tres iconos en círculos (camión, escudo, diamante) sobre un
// degradado — el bloque de "beneficios" que trae absolutamente toda plantilla de
// tienda. Dice lo mismo, pero en una línea que se mueve: ocupa un cuarto del
// alto, no usa un solo icono de catálogo y le da al crema un punto de vida.
//
// El truco del bucle: la lista se pinta dos veces y la animación recorre -50%.
// Al terminar, la segunda copia está justo donde arrancó la primera, así que el
// salto de vuelta al inicio no se ve.

const PROMESAS = [
  "Envíos a todo México",
  "Gratis desde $1,999",
  "Autenticidad en cada pieza",
  "Tarjeta, OXXO y pagos seguros",
  "Perforaciones con cita en Los Mochis",
];

export function PromiseMarquee() {
  const tira = [...PROMESAS, ...PROMESAS];

  return (
    <section
      aria-label="Envíos, garantía y formas de pago"
      className="relative overflow-hidden border-y border-ink/10 bg-sand py-3.5"
    >
      {/* Difuminado en los extremos: la tira se desvanece en vez de cortarse.
          El degradado arranca del MISMO color del fondo de la tira (sand). Con
          cream se veía una banda más clara pegada a cada orilla. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-sand to-transparent sm:w-28" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-sand to-transparent sm:w-28" />

      <div data-turkana-marquee className="flex w-max">
        <ul
          className="flex shrink-0 items-center gap-10 pr-10 text-[0.68rem] uppercase tracking-[0.28em] text-muted sm:gap-14 sm:pr-14 sm:text-xs"
          style={{ animation: "turkana-marquee 42s linear infinite" }}
        >
          {tira.map((p, i) => (
            <li key={i} className="flex shrink-0 items-center gap-10 whitespace-nowrap sm:gap-14">
              {p}
              <span aria-hidden className="text-gold">&#9670;</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
