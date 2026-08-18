// Qué caja es este equipo. Vive en una cookie porque el POS se arma en el
// servidor: `app/pos/page.tsx` necesita saber de qué caja cargar el turno antes
// de que corra un solo renglón de JavaScript en el navegador.
export const REGISTER_COOKIE = "turkana_register_id";
export const REGISTER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // un año
