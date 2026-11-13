# Turkana Jewelry — Configuración de la cuenta Stripe

Pasos **exactos** para crear y configurar la cuenta de Stripe para este proyecto
(e-commerce en MXN, con tarjeta + OXXO, webhooks y conciliación de rewards).
Sigue el orden tal cual.

> Resumen de lo que necesitas obtener al final:
> - `pk_test_...` y `pk_live_...` (Publishable keys)
> - `sk_test_...` y `sk_live_...` (Secret keys)
> - `whsec_...` (Webhook signing secret) — uno por entorno
> - OXXO activado
> - Apple Pay / Google Pay activados (salen solos en Checkout)

---

## 1. Crear la cuenta

1. Entra a <https://dashboard.stripe.com/register>.
2. Regístrate con el correo del negocio (idealmente uno administrativo, no personal).
3. Confirma el correo.
4. En **país de la cuenta selecciona México** ⚠️ — esto es **irreversible** y es
   lo que habilita MXN y OXXO. Si te equivocas, hay que crear otra cuenta.
5. Nombra la cuenta: `Turkana Jewelry`.

---

## 2. Activar la cuenta (datos del negocio)

En **Settings → Business settings** completa:

- **Tipo de negocio:** persona física con actividad empresarial o moral, según
  cómo esté dada de alta la joyería.
- **RFC** del negocio.
- **CLABE bancaria** (cuenta MXN) para los depósitos (payouts).
- **Domicilio fiscal:** Blvrd Canuto Ibarra Guerrero 1700, El Dorado, 81278 Los
  Mochis, Sinaloa.
- **Nombre que aparece en el estado de cuenta del cliente** (statement descriptor):
  `TURKANA JEWELRY` (máx. 22 caracteres, se ve en el cargo de la tarjeta).
- **Sitio web:** la URL de producción (`turkanajewerly.com`).

> ⚠️ El dominio comprado es **`turkanajewerly.com`** — así, con "jewerly". No es
> errata de este documento: es como quedó registrado y es el que está verificado
> en Resend. Escríbelo igual en Stripe o la verificación de dominio falla.

> Sin activar la cuenta solo funciona el **modo de prueba** (test). Para cobrar de
> verdad hay que completar y aprobar la activación.

---

## 3. Configurar la moneda y métodos de pago

1. **Settings → Payments → Payment methods.**
2. **Moneda de presentación:** MXN.
3. Activa estos métodos:
   - ✅ **Tarjetas (Cards)** — Visa, Mastercard, Amex.
   - ✅ **OXXO** — pago en efectivo en tiendas (asíncrono, ver §6).
   - ✅ **Apple Pay** y **Google Pay** — se activan solos en Stripe Checkout si el
     dominio está verificado (paso §5). No requieren código extra.
   - ❌ **SPEI** — déjalo **desactivado** (no se usa en este proyecto).

> OXXO tiene límites por transacción (aprox. $10,000 MXN). Para piezas de mayor
> valor, el cliente debe pagar con tarjeta.

---

## 4. Obtener las claves de API

1. **Developers → API keys.**
2. Modo **Test** (interruptor arriba a la derecha en "Test mode"):
   - Copia **Publishable key** → `pk_test_...`
   - Revela y copia **Secret key** → `sk_test_...`
3. Cambia a modo **Live** y repite:
   - `pk_live_...` y `sk_live_...`

Guárdalas así (no las subas al repo):

```bash
# .env.local (Next.js)  — usa test mientras desarrollas
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...

# Secrets de Supabase Edge Functions
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
```

> ⚠️ La **Secret key** (`sk_...`) solo vive en el servidor (Edge Functions / rutas
> server de Next.js). **Nunca** en el navegador ni en el POS.

---

## 5. Verificar el dominio (para Apple Pay / Google Pay)

1. **Settings → Payments → Payment methods → Apple Pay → Configure domains.**
2. Agrega `turkanajewerly.com` (y el dominio de Vercel si usas uno temporal).
3. Stripe te pide subir un archivo de verificación; con **Stripe Checkout** (la
   opción que usamos) la verificación de Apple Pay es automática al usar el dominio
   registrado. Para Stripe Elements sí hay que subir el archivo a
   `/.well-known/apple-developer-merchantid-domain-association`.

---

## 6. Configurar los Webhooks

El webhook vive **dentro de la app de Next.js**, no en Supabase:
`apps/web/app/api/stripe/webhook/route.ts`. Es el que marca la orden como
pagada, descuenta el inventario, canjea el saldo Rewards y manda los correos.
Sin él, el cliente paga y la orden se queda en "pendiente" para siempre.

> La carpeta `supabase/functions/create-checkout` es de una versión vieja del
> proyecto y ya no se usa: no hay ninguna Edge Function desplegada.

### 6.1 Endpoint en producción

1. **Developers → Webhooks → Add endpoint.**
2. **Endpoint URL:**
   ```
   https://TU-DOMINIO/api/stripe/webhook
   ```
   (por ejemplo `https://turkanajewerly.com/api/stripe/webhook`; si todavía no
   conectas el dominio, el de Vercel: `https://turkana.vercel.app/api/stripe/webhook`).
3. **Eventos a escuchar** (selecciona exactamente estos cuatro — son los que el
   código atiende; los demás los ignora):
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
4. Crea el endpoint y copia el **Signing secret** → `whsec_...`.
5. Ponlo en **Vercel → Settings → Environment Variables** como
   `STRIPE_WEBHOOK_SECRET` (entorno Production) y vuelve a desplegar.

> ⚠️ El `whsec_` del modo **test** y el del modo **live** son distintos. Si pones
> el de test en producción, Stripe manda el evento, la firma no cuadra y la orden
> nunca se marca como pagada. En los logs de Vercel se ve como
> `[webhook] firma inválida`.

### 6.2 Pruebas en local (Stripe CLI)

```bash
stripe login
stripe listen --forward-to http://localhost:3000/api/stripe/webhook
```

La CLI imprime un `whsec_...` temporal; cópialo a `apps/web/.env.local` en
`STRIPE_WEBHOOK_SECRET` y reinicia `npm run dev`.

```bash
# Disparar eventos de prueba:
stripe trigger checkout.session.completed
stripe trigger payment_intent.succeeded
```

---

## 7. Tarjetas y referencias de prueba (modo test)

- Tarjeta OK: `4242 4242 4242 4242`, fecha futura, CVC cualquiera.
- Requiere 3D Secure: `4000 0027 6000 3184`.
- Rechazada: `4000 0000 0000 0002`.
- **OXXO de prueba:** en Checkout elige OXXO; Stripe genera un voucher simulado.
  Para simular el pago: `stripe trigger payment_intent.succeeded` o desde el
  dashboard de test.

---

## 8. Recibos y branding

1. **Settings → Branding:** sube el logo de Turkana, color de marca, ícono.
   Esto aplica a la página de Checkout y a los recibos de Stripe.
2. **Settings → Customer emails:** puedes activar el recibo automático de Stripe,
   pero recuerda que los correos de Turkana (Resend) los disparamos **manualmente**
   desde el admin. Decide si quieres el recibo de Stripe además del nuestro.

---

## 9. Checklist antes de pasar a producción (Live)

- [ ] Cuenta **activada** (datos fiscales + bancarios aprobados por Stripe).
- [ ] País de la cuenta = México, moneda MXN.
- [ ] Tarjetas + OXXO activados; SPEI desactivado.
- [ ] Apple Pay / Google Pay con dominio verificado.
- [ ] Claves **Live** (`pk_live`, `sk_live`) en variables de producción de Vercel y
      en Supabase secrets — separadas de las de test.
- [ ] Webhook **Live** creado apuntando a la función de producción + su `whsec_`.
- [ ] `statement descriptor` configurado (`TURKANA JEWELRY`).
- [ ] Probado un pago real de bajo monto con tarjeta y un voucher OXXO.
- [ ] Reglas de **Radar** (antifraude) revisadas (vienen activas por defecto).

---

## 10. Qué me tienes que pasar para conectar el código

Cuando tengas la cuenta lista, mándame (o ponlos tú en los `.env`):

| Variable | Dónde | Valor |
|----------|-------|-------|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Vercel + `.env.local` | `pk_live_...` (o `pk_test_...` en dev) |
| `STRIPE_SECRET_KEY` | Vercel + `.env.local` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Vercel + `.env.local` | `whsec_...` del endpoint |
| `NEXT_PUBLIC_SITE_URL` | Vercel | `https://turkanajewerly.com` (sin diagonal final) |

Las tres de Stripe van **todas en Vercel** (no en Supabase): el cobro y el
webhook corren dentro de la app de Next.js.

`NEXT_PUBLIC_SITE_URL` es con la que se arman las ligas de regreso de Stripe. Si
se queda en `http://localhost:3000`, el cliente paga y Stripe lo devuelve a una
página que no existe en su computadora.
