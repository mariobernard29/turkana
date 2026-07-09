// Cliente de Stripe para el servidor (Route Handlers / Server Actions).
// La Secret key nunca llega al navegador.
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
  typescript: true,
});
