# Supabase — Turkana Jewelry

Migraciones, seed y configuración de la base de datos. Ver `../BACKEND_SETUP.md`
para el diseño completo.

## Aplicar

```bash
# desde la raíz del repo
supabase init                 # si aún no existe config.toml
supabase link --project-ref <PROJECT_REF>

# Local (Docker): aplica migraciones + seed.sql
supabase start
supabase db reset             # corre migrations/ y luego seed.sql

# Producción
supabase db push              # aplica migraciones al proyecto enlazado
# el seed se corre manualmente una vez:
#   psql "$DATABASE_URL" -f supabase/seed.sql
```

## Orden de migraciones

```
0001_extensions_helpers.sql            extensiones + set_updated_at()
0002_settings.sql                      app_settings (folios, rewards, envíos, IVA)
0003_auth_roles.sql                    roles, permissions, profiles
0004_catalog.sql                       categorías, colecciones, productos, variantes, imágenes
0005_inventory.sql                     almacenes, stock_levels, movimientos
0006_customers_rewards.sql             clientes, direcciones, rewards
0007_orders_payments.sql               órdenes, partidas, pagos, envíos (folio TK-000001)
0008_pos_cash.sql                      caja: sesiones, movimientos, resguardos
0009_credit_layaway_returns_services.sql  crédito, apartados, devoluciones, servicios
0010_notifications_audit_sync.sql      notificaciones, auditoría, devices, sync_queue
0011_functions.sql                     helpers de seguridad + funciones de negocio
0012_rls.sql                           RLS en todas las tablas + Realtime
seed.sql                               datos iniciales + buckets de Storage
```

## IMPORTANTE: habilitar el Auth Hook del rol

El JWT necesita el claim `user_role` para que RLS funcione. Hay dos formas:

**Dashboard:** Authentication → Hooks → *Custom Access Token* → selecciona
`public.custom_access_token_hook`.

**Local (`config.toml`):**

```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```

Y otorga acceso al rol de auth:

```sql
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
```

## Notas

- Todos los montos en **centavos MXN** (`bigint`).
- Precios de variante **sin IVA**; el 16% se suma en checkout.
- Folio de orden: 6 dígitos + prefijo configurable en `app_settings.order_folio_prefix`.
- Canje de rewards limitado por `app_settings.rewards_max_redeem_cents` ($1,000).
- Mutaciones sensibles (stock, rewards, caja) van por funciones `security definer`
  o Edge Functions con `service_role`.
