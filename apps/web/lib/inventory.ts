// Almacén único. Antes había dos —'tienda' y 'ecommerce'— con existencias
// separadas: había que traspasar piezas de uno a otro y una pieza podía verse
// agotada en la web mientras seguía en el mostrador. Ahora es una sola bolsa:
// lo que se carga aquí lo ven igual el POS y la tienda en línea.
//
// La clave se quedó como 'tienda' a propósito: es la que ya usaban el POS, los
// apartados y la importación por Excel, y renombrarla obligaba a tocar cada
// llamada a las funciones de stock sin ganar nada.
export const MAIN_LOCATION_KEY = "tienda";

// Cómo se llama en pantalla y en los correos de inventario bajo.
export const MAIN_LOCATION_LABEL = "Almacén principal";
