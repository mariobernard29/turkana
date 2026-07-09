// Datos de la tienda y fiscales para tickets/comprobantes.
export const STORE = {
  brand: "TURKANA",
  tagline: "JOYERÍA FINA",
  phone: "668 241 0761",
  instagram: "@turkana.mx",
  addressLines: [
    "Blvrd Canuto Ibarra Guerrero 1700, El Dorado",
    "Plaza Alcazar Business Park",
    "Los Mochis, Sinaloa",
  ],
  // Datos fiscales (la dirección de la tienda es también el domicilio fiscal).
  fiscal: {
    legalName: "MARIA ALEJANDRA CARDENAS VAZQUEZ",
    rfc: "CAVA950412TP6",
    regimen: "621 - Incorporación Fiscal",
  },
} as const;

// Bolsa de regalo (producto fijo creado por fix_extras.sql). Usada por la casilla del checkout.
export const GIFT_BAG = {
  variantId: "a0b10000-0000-4000-8000-000000000001",
  productSlug: "bolsa-de-regalo",
  name: "Bolsa de regalo",
  sku: "EXTRA-BOLSA",
  priceCents: 1500,
} as const;
