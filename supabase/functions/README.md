# Edge Functions — Turkana

| Función | Auth | Qué hace |
|---------|------|----------|
| `create-checkout` | usuario (JWT) | Crea Stripe Checkout Session (tarjeta + OXXO) para una orden |
| `stripe-webhook` | **público** | Recibe eventos de Stripe, concilia pago, stock, rewards, notifica |
| `send-email` | service/admin | Envía correos Turkana vía Resend |
| `sync-process` | staff (JWT) | Procesa el outbox offline del POS y marca conflictos |

## Secrets

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set EMAIL_FROM="Turkana Jewelry <pedidos@turkanajewelry.com>"
supabase secrets set SITE_URL=https://turkanajewelry.com
# SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya existen por defecto en el runtime.
```

## config.toml

`stripe-webhook` no recibe el JWT de Supabase (lo llama Stripe), así que hay que
desactivar la verificación. Agrega en `supabase/config.toml`:

```toml
[functions.stripe-webhook]
verify_jwt = false

[functions.create-checkout]
verify_jwt = true

[functions.send-email]
verify_jwt = true

[functions.sync-process]
verify_jwt = true
```

## Deploy

```bash
supabase functions deploy create-checkout
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy send-email
supabase functions deploy sync-process
```

## Probar en local

```bash
supabase functions serve --env-file ./supabase/.env.local
stripe listen --forward-to http://localhost:54321/functions/v1/stripe-webhook
stripe trigger checkout.session.completed
```
