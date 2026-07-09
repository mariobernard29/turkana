# Turkana Jewelry — Guía de Backend (Supabase + Stripe)

> Instrucciones para construir la base de datos, el backend y las integraciones
> (Stripe, Resend, sincronización offline) de la plataforma omnicanal de
> Turkana Jewelry. Pensado para **producción**, no para un MVP.

**Stack:** Next.js 16 (App Router / Server Components) · Supabase (PostgreSQL,
Auth, Storage, Realtime, Edge Functions) · Stripe · Resend · Vercel.

---

## Tabla de contenido

1. [Principios de arquitectura](#1-principios-de-arquitectura)
2. [Requisitos previos y cuentas](#2-requisitos-previos-y-cuentas)
3. [Estructura del proyecto](#3-estructura-del-proyecto)
4. [Variables de entorno](#4-variables-de-entorno)
5. [Inicialización de Supabase](#5-inicialización-de-supabase)
6. [Convenciones de base de datos](#6-convenciones-de-base-de-datos)
7. [Esquema de base de datos (migraciones)](#7-esquema-de-base-de-datos-migraciones)
8. [Auth, roles y permisos](#8-auth-roles-y-permisos)
9. [Row Level Security (RLS)](#9-row-level-security-rls)
10. [Storage (imágenes y archivos)](#10-storage-imágenes-y-archivos)
11. [Realtime](#11-realtime)
12. [Edge Functions](#12-edge-functions)
13. [Integración con Stripe](#13-integración-con-stripe)
14. [Correos con Resend](#14-correos-con-resend)
15. [Turkana Rewards (lealtad)](#15-turkana-rewards-lealtad)
16. [Inventario omnicanal (doble almacén)](#16-inventario-omnicanal-doble-almacén)
17. [Sincronización Offline-First del POS](#17-sincronización-offline-first-del-pos)
18. [Auditoría](#18-auditoría)
19. [Orden de implementación](#19-orden-de-implementación)
20. [Seguridad y checklist de producción](#20-seguridad-y-checklist-de-producción)

---

## 1. Principios de arquitectura

- **Una sola base de datos** para POS y E-commerce. Toda venta (online o física)
  impacta inventario, clientes, lealtad y reportes de forma atómica.
- **Supabase = fuente de verdad.** Las tablets mantienen una copia local
  (IndexedDB/Dexie) y reconcilian contra Supabase.
- **Lógica de negocio crítica en la base de datos** (funciones PL/pgSQL +
  triggers) y en **Edge Functions**, no en el cliente. El navegador nunca
  decide stock, precios finales ni acreditación de puntos.
- **Service role solo en el servidor.** El `service_role` key jamás se expone al
  navegador ni al POS. Solo vive en Edge Functions y en rutas server-side de
  Next.js.
- **Todo audita.** Cada tabla lleva `created_at/updated_at/deleted_at/created_by`
  y las operaciones sensibles escriben en `audit_logs`.
- **Soft delete** por defecto (`deleted_at`); nunca `DELETE` físico en tablas de
  negocio.
- **Dinero en enteros (centavos).** Todos los montos se guardan como `bigint` en
  centavos de MXN para evitar errores de punto flotante.
- **IVA 16% se suma en el checkout.** Los precios de variante (`price_cents`) se
  guardan **sin IVA**. En cada orden: `tax_cents = round((subtotal - discount - rewards_redeemed) * 0.16)`
  y `total = subtotal - discount - rewards_redeemed + tax + shipping`. El cálculo
  vive en una función del servidor, nunca en el cliente.

---

## 2. Requisitos previos y cuentas

| Servicio | Para qué | Qué obtener |
|----------|----------|-------------|
| Supabase | DB, Auth, Storage, Realtime, Functions | Project URL, `anon` key, `service_role` key, DB password |
| Stripe | Pagos del e-commerce | Publishable key, Secret key, Webhook signing secret |
| Resend | Correos transaccionales | API key, dominio verificado (DNS SPF/DKIM) |
| Google Maps | Autocompletado de direcciones | API key (Places + Maps JS) |
| Vercel | Deploy del front | Proyecto conectado al repo |

Instala herramientas locales:

```bash
npm i -g supabase        # CLI de Supabase
npm i -g stripe          # Stripe CLI (para escuchar webhooks en local)
```

---

## 3. Estructura del proyecto

```
turkana-sistema/
├─ apps/
│  ├─ web/                      # Next.js 16 (e-commerce + admin + POS PWA)
│  │  ├─ app/
│  │  │  ├─ (shop)/             # Tienda en línea
│  │  │  ├─ (admin)/            # Panel administrativo
│  │  │  ├─ (pos)/              # POS (PWA instalable)
│  │  │  └─ api/                # Route handlers (webhooks, server actions)
│  │  └─ lib/
│  │     ├─ supabase/           # Clientes browser/server/admin
│  │     ├─ stripe/
│  │     └─ offline/            # Dexie + sync engine
├─ supabase/
│  ├─ migrations/               # *.sql versionadas
│  ├─ functions/                # Edge Functions (Deno)
│  │  ├─ stripe-webhook/
│  │  ├─ create-checkout/
│  │  ├─ send-email/
│  │  └─ sync-process/
│  ├─ seed.sql                  # Datos iniciales (roles, permisos, config)
│  └─ config.toml
└─ BACKEND_SETUP.md
```

---

## 4. Variables de entorno

`.env.local` (Next.js) — **nunca** commitear:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...          # SOLO server-side

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Resend
RESEND_API_KEY=re_...
EMAIL_FROM="Turkana Jewelry <pedidos@turkanajewelry.com>"
EMAIL_ADMIN="admin@turkanajewelry.com"

# Google Maps
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...

# App
NEXT_PUBLIC_SITE_URL=https://turkanajewelry.com
```

Secrets de Edge Functions (no usan `.env.local`):

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set EMAIL_FROM="Turkana Jewelry <pedidos@turkanajewelry.com>"
```

---

## 5. Inicialización de Supabase

```bash
supabase init                 # crea supabase/
supabase login
supabase link --project-ref <PROJECT_REF>

# Desarrollo local con Docker (opcional pero recomendado)
supabase start                # levanta Postgres + Studio local

# Crear una migración
supabase migration new init_schema
# ... editas el .sql generado ...

# Aplicar en local
supabase db reset             # reaplica todas las migraciones + seed
# Aplicar en remoto
supabase db push
```

---

## 6. Convenciones de base de datos

Define helpers reutilizables antes de las tablas.

```sql
-- Extensiones
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";     -- búsqueda por similitud

-- Trigger genérico: mantener updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

-- Columnas estándar para toda tabla de negocio:
--   id          uuid primary key default gen_random_uuid()
--   created_at  timestamptz not null default now()
--   updated_at  timestamptz not null default now()
--   deleted_at  timestamptz
--   created_by  uuid references auth.users(id)
-- + trigger:  create trigger trg_set_updated_at before update on <tabla>
--             for each row execute function set_updated_at();
```

> Convención de tipos de dinero: `amount_cents bigint not null` (centavos MXN).
> Para mostrar: `amount_cents / 100.0`.

---

## 7. Esquema de base de datos (migraciones)

Divide en migraciones temáticas. Orden sugerido de archivos:

```
0001_extensions_helpers.sql
0002_auth_roles_permissions.sql
0003_catalog.sql          -- categories, collections, products, variants, images
0004_inventory.sql        -- locations, stock_levels, movements
0005_customers_rewards.sql
0006_orders_payments.sql  -- orders, items, payments, shipments
0007_pos_cash.sql         -- registers, sessions, movements, drops
0008_credit_layaway.sql
0009_returns_services.sql
0010_notifications_audit.sql
0011_sync.sql             -- sync_queue, devices
0012_rls_policies.sql
0013_functions_triggers.sql
```

A continuación el esquema central (resumido pero completo en sus tablas clave).

### 7.1 Auth, roles y permisos

```sql
create table roles (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,         -- super_admin, admin, gerente, cajero, inventarios, atencion
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

create table permissions (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,         -- ventas.cancelar, credito.modificar, inventario.ajustar, usuarios.crear ...
  description text
);

create table role_permissions (
  role_id       uuid references roles(id) on delete cascade,
  permission_id uuid references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- Perfil ligado a auth.users (1:1)
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role_id     uuid references roles(id),
  full_name   text not null,
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  created_by  uuid references auth.users(id)
);
create trigger trg_profiles_updated before update on profiles
  for each row execute function set_updated_at();
```

### 7.2 Catálogo

```sql
create table categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references categories(id),  -- subcategorías
  name text not null,
  slug text unique not null,
  position int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table collections (
  id uuid primary key default gen_random_uuid(),
  name text not null,                  -- Primavera, Navidad, San Valentín...
  slug text unique not null,
  description text,
  hero_image_url text,
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  position int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  sku text unique,                     -- SKU base (las variantes tienen el suyo)
  short_description text,
  long_description text,
  material text,                       -- oro, plata, oro rosa...
  stone text,                          -- piedra
  weight_grams numeric(10,2),
  category_id uuid references categories(id),
  collection_id uuid references collections(id),
  tags text[] default '{}',
  -- SEO
  seo_title text,
  seo_description text,
  -- estado / publicación
  status text not null default 'draft' check (status in ('draft','active','archived')),
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id)
);
create index on products using gin (tags);
create index on products using gin (name gin_trgm_ops);

-- Cada variante: SKU, precio y stock propios
create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  sku text unique not null,
  -- atributos de la variante (talla, metal, largo...)
  attributes jsonb not null default '{}',   -- {"metal":"oro","talla":"7"}
  price_cents bigint not null,
  compare_at_cents bigint,                  -- precio tachado / antes
  barcode text,
  is_active boolean not null default true,
  position int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on product_variants (product_id);

create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  variant_id uuid references product_variants(id) on delete cascade,  -- imágenes propias por variante
  storage_path text not null,           -- ruta en bucket
  alt text,
  type text not null default 'image' check (type in ('image','video')),
  position int default 0,
  created_at timestamptz not null default now()
);
```

### 7.3 Inventario omnicanal (doble almacén, catálogo compartido)

```sql
create table inventory_locations (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,             -- 'tienda' | 'ecommerce'
  name text not null,
  type text not null check (type in ('physical','online')),
  created_at timestamptz not null default now()
);

-- Stock por variante y por almacén (mismo catálogo, distintas cantidades)
create table stock_levels (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references product_variants(id) on delete cascade,
  location_id uuid not null references inventory_locations(id),
  quantity int not null default 0,
  reserved int not null default 0,      -- apartados / pedidos no confirmados
  low_stock_threshold int default 2,
  updated_at timestamptz not null default now(),
  unique (variant_id, location_id)
);

create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references product_variants(id),
  location_id uuid not null references inventory_locations(id),
  type text not null check (type in ('entrada','salida','ajuste','traspaso','venta','devolucion')),
  quantity int not null,                -- positivo o negativo
  reference_type text,                  -- 'order','return','transfer','manual'
  reference_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index on inventory_movements (variant_id, created_at);
```

> El reparto "lista principal → almacenes" se hace con movimientos `traspaso`:
> dos asientos (salida en origen, entrada en destino) en una transacción.

### 7.4 Clientes y Rewards

```sql
create table customers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id),  -- null si es cliente solo-físico
  full_name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index on customers (email) where email is not null;

create table customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  street text, ext_number text, int_number text,
  postal_code text, neighborhood text, city text, state text,
  references_note text,
  lat numeric, lng numeric,             -- de Google Maps
  is_default boolean default false,
  created_at timestamptz not null default now()
);

create table customer_rewards (
  customer_id uuid primary key references customers(id) on delete cascade,
  balance_cents bigint not null default 0,   -- saldo de puntos en valor MXN
  lifetime_earned_cents bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table reward_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  type text not null check (type in ('earn','redeem','adjust','expire')),
  amount_cents bigint not null,         -- +gana / -canjea
  order_id uuid,                        -- origen
  channel text check (channel in ('pos','ecommerce')),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
```

### 7.5 Órdenes, pagos, envíos

```sql
create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,    -- folio legible (ver función generador)
  channel text not null check (channel in ('pos','ecommerce')),
  customer_id uuid references customers(id),
  status text not null default 'pending'
    check (status in ('pending','paid','preparing','shipped','delivered','completed','cancelled')),
  -- montos (centavos)
  subtotal_cents bigint not null default 0,
  discount_cents bigint not null default 0,
  shipping_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  total_cents bigint not null default 0,
  rewards_earned_cents bigint not null default 0,
  rewards_redeemed_cents bigint not null default 0,
  -- POS
  cash_session_id uuid,
  device_id uuid,
  -- envío
  shipping_method text,                 -- 'standard','express','free'
  shipping_address_id uuid references customer_addresses(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id)
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  variant_id uuid references product_variants(id),
  -- snapshot al momento de la venta (inmutable)
  sku text not null,
  name text not null,
  unit_price_cents bigint not null,
  quantity int not null,
  total_cents bigint not null,
  is_service boolean not null default false   -- venta de servicio sin inventario
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  method text not null check (method in ('cash','card','transfer','stripe','rewards','credit','layaway')),
  amount_cents bigint not null,
  status text not null default 'completed'
    check (status in ('pending','completed','failed','refunded')),
  -- Stripe
  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_session_id text,
  raw jsonb,                            -- conciliación
  created_at timestamptz not null default now()
);
create index on payments (stripe_payment_intent_id);

create table shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  status text not null default 'preparing'
    check (status in ('preparing','ready','shipped','delivered')),
  -- sin tracking de paquetería: solo estados manuales
  shipped_at timestamptz, delivered_at timestamptz,
  created_at timestamptz not null default now()
);
```

### 7.6 Caja del POS (turnos por lote)

```sql
create table cash_registers (        -- la caja física
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location_id uuid references inventory_locations(id),
  created_at timestamptz not null default now()
);

create table cash_sessions (         -- apertura → corte
  id uuid primary key default gen_random_uuid(),
  register_id uuid not null references cash_registers(id),
  cashier_id uuid not null references auth.users(id),
  device_id uuid,
  opening_float_cents bigint not null,         -- fondo inicial
  status text not null default 'open' check (status in ('open','closed')),
  -- corte final
  counted_cash_cents bigint, counted_card_cents bigint, counted_transfer_cents bigint,
  expected_cash_cents bigint, difference_cents bigint,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references auth.users(id)
);

create table cash_movements (        -- entradas/salidas, precortes, ventas en efectivo
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references cash_sessions(id),
  type text not null check (type in ('sale','refund','expense','drop','in','out','precut')),
  method text check (method in ('cash','card','transfer')),
  amount_cents bigint not null,
  reference_id uuid, notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table cash_drops (            -- resguardos a caja fuerte
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references cash_sessions(id),
  amount_cents bigint not null,
  responsible_id uuid not null references auth.users(id),
  threshold_cents bigint,            -- límite configurado que disparó la alerta
  notes text,
  created_at timestamptz not null default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references cash_sessions(id),
  concept text not null,
  amount_cents bigint not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
```

### 7.7 Crédito, apartados, devoluciones, servicios

```sql
create table credit_accounts (       -- solo tienda física
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  limit_cents bigint not null default 0,
  balance_cents bigint not null default 0,    -- saldo deudor
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now()
);

create table credit_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references credit_accounts(id),
  order_id uuid references orders(id),
  type text not null check (type in ('charge','payment')),
  amount_cents bigint not null,
  due_date date,
  status text check (status in ('vigente','vencido','pagado')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table layaways (              -- apartados
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  variant_id uuid references product_variants(id),
  total_cents bigint not null,
  paid_cents bigint not null default 0,
  status text not null default 'active' check (status in ('active','completed','cancelled','expired')),
  due_date date,
  order_id uuid references orders(id),  -- al convertir a venta
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table layaway_payments (
  id uuid primary key default gen_random_uuid(),
  layaway_id uuid not null references layaways(id) on delete cascade,
  amount_cents bigint not null,
  method text check (method in ('cash','card','transfer')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table returns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  variant_id uuid references product_variants(id),
  quantity int not null,
  reason text,
  type text not null check (type in ('return','exchange')),
  exchange_variant_id uuid references product_variants(id),  -- si es cambio
  refund_cents bigint default 0,
  responsible_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table service_sales (         -- venta rápida sin inventario
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  concept text not null,             -- limpieza, reparación, ajuste de anillo...
  description text,
  amount_cents bigint not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
```

### 7.8 Notificaciones, auditoría, sync

```sql
create table notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,            -- new_order, low_stock, out_of_stock, credit_due, layaway_due, cash_difference, big_sale, cash_cut
  title text not null,
  body text,
  data jsonb,
  target_role text,              -- a qué rol dirigir en el dashboard
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  action text not null,          -- 'order.cancel', 'inventory.adjust', 'credit.update'...
  entity_type text,
  entity_id uuid,
  before jsonb, after jsonb,
  ip text, device_id uuid,
  created_at timestamptz not null default now()
);

create table devices (             -- multidispositivo
  id uuid primary key default gen_random_uuid(),
  name text not null,
  platform text,                  -- android, ipad, windows
  register_id uuid references cash_registers(id),
  last_seen_at timestamptz,
  is_active boolean default true,
  created_at timestamptz not null default now()
);

create table sync_queue (          -- cola de operaciones offline
  id uuid primary key default gen_random_uuid(),
  device_id uuid references devices(id),
  client_op_id text not null,      -- id idempotente generado en el cliente
  operation_type text not null,    -- 'order.create','layaway.payment','customer.create'...
  payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending','synced','error','conflict')),
  error text,
  client_created_at timestamptz not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (device_id, client_op_id)   -- idempotencia
);
```

---

## 8. Auth, roles y permisos

- **Supabase Auth** maneja login (email/password). Cada usuario del staff tiene
  un `profiles` con `role_id`.
- Clientes del e-commerce también usan Auth; su `customers.auth_user_id` los liga.
- **Custom claims**: agrega el rol al JWT con un Auth Hook para que RLS lo lea sin
  hacer joins. En Supabase: *Authentication → Hooks → Custom Access Token*.

```sql
-- Hook que inyecta role + permisos en el JWT
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql as $$
declare claims jsonb; user_role text;
begin
  select r.key into user_role
  from profiles p join roles r on r.id = p.role_id
  where p.id = (event->>'user_id')::uuid;

  claims := event->'claims';
  claims := jsonb_set(claims, '{user_role}', to_jsonb(coalesce(user_role,'customer')));
  return jsonb_set(event, '{claims}', claims);
end; $$;
```

Helper para leer rol/permiso dentro de policies y funciones:

```sql
create or replace function auth_role() returns text
language sql stable as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb->>'user_role','customer')
$$;

create or replace function has_permission(perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    join role_permissions rp on rp.role_id = p.role_id
    join permissions pm on pm.id = rp.permission_id
    where p.id = auth.uid() and pm.key = perm
  ) or auth_role() = 'super_admin'
$$;
```

Seed inicial (en `seed.sql`):

```sql
insert into roles (key,name) values
  ('super_admin','Super Admin'),('admin','Administrador'),('gerente','Gerente'),
  ('cajero','Cajero'),('inventarios','Inventarios'),('atencion','Atención al Cliente');

insert into permissions (key,description) values
  ('ventas.cancelar','Cancelar venta'),
  ('credito.modificar','Modificar crédito'),
  ('inventario.ajustar','Ajustar inventario'),
  ('usuarios.crear','Crear usuarios'),
  ('caja.corte','Realizar corte de caja'),
  ('resguardo.crear','Crear resguardo');

insert into inventory_locations (key,name,type) values
  ('tienda','Tienda Física','physical'),
  ('ecommerce','E-commerce','online');
```

---

## 9. Row Level Security (RLS)

Activa RLS en **todas** las tablas. Reglas base:

- **Catálogo público** (`products`, `product_variants`, `product_images`,
  `categories`, `collections`): lectura anónima solo de filas publicadas.
- **Clientes**: cada cliente ve solo lo suyo (`auth.uid()`).
- **Staff**: acceso según rol/permiso.
- **Escrituras de negocio** (órdenes, inventario, caja): preferentemente vía
  funciones `security definer` o Edge Functions con `service_role`, no escritura
  directa del cliente.

```sql
alter table products enable row level security;
alter table product_variants enable row level security;
alter table orders enable row level security;
alter table customers enable row level security;
-- ... (repetir en todas)

-- Catálogo: lectura pública de productos activos
create policy "catalog_public_read" on products
  for select using (status = 'active' and deleted_at is null);

create policy "variants_public_read" on product_variants
  for select using (is_active and deleted_at is null);

-- Staff con permiso puede gestionar catálogo
create policy "catalog_staff_write" on products
  for all using (has_permission('inventario.ajustar'))
  with check (has_permission('inventario.ajustar'));

-- Cliente ve sus órdenes; staff ve todas
create policy "orders_owner_read" on orders
  for select using (
    auth_role() in ('super_admin','admin','gerente','cajero','atencion')
    or customer_id in (select id from customers where auth_user_id = auth.uid())
  );

-- Cliente ve su propio registro
create policy "customers_self" on customers
  for select using (
    auth_user_id = auth.uid()
    or auth_role() in ('super_admin','admin','gerente','cajero','atencion')
  );

-- Rewards: solo lectura del propio saldo
create policy "rewards_self_read" on customer_rewards
  for select using (
    customer_id in (select id from customers where auth_user_id = auth.uid())
    or auth_role() in ('super_admin','admin','gerente')
  );
```

> Las mutaciones de `stock_levels`, `customer_rewards`, `cash_*`, `credit_*` se
> hacen exclusivamente desde funciones `security definer`/Edge Functions para que
> el cliente nunca altere saldos directamente.

---

## 10. Storage (imágenes y archivos)

Crea buckets:

```sql
insert into storage.buckets (id, name, public) values
  ('product-images','product-images', true),
  ('collections','collections', true),
  ('tickets','tickets', false),        -- PDFs de cortes/tickets (privado)
  ('brand','brand', true);
```

Policies de Storage:

```sql
-- Lectura pública de imágenes de producto
create policy "public read product-images" on storage.objects
  for select using (bucket_id = 'product-images');

-- Subida solo staff con permiso de inventario
create policy "staff upload product-images" on storage.objects
  for insert with check (
    bucket_id = 'product-images' and has_permission('inventario.ajustar')
  );
```

En el admin, la subida **drag & drop** sube directo a Storage (signed upload URL)
y guarda `storage_path` en `product_images`. No subas binarios a Postgres.

---

## 11. Realtime

Habilita Realtime para reflejar cambios al instante (stock, pedidos nuevos,
dashboard, notificaciones).

```sql
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table stock_levels;
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table cash_sessions;
```

En el cliente, suscríbete con filtros (p. ej. `notifications` por rol) respetando
RLS. El POS usa Realtime para sincronizar stock entre tablets cuando hay conexión.

---

## 12. Edge Functions

Funciones Deno desplegadas en Supabase (`supabase functions deploy <name>`):

| Función | Responsabilidad |
|---------|-----------------|
| `create-checkout` | Crea la sesión de Stripe Checkout para una orden del e-commerce |
| `stripe-webhook` | Recibe y verifica eventos de Stripe, concilia pagos, acredita rewards, dispara correos |
| `send-email` | Envía correos transaccionales vía Resend con plantillas Turkana |
| `sync-process` | Procesa la `sync_queue` del POS y resuelve/marca conflictos |

Las funciones usan `service_role` (vía secret) para escribir saltándose RLS de
forma controlada.

---

## 13. Integración con Stripe

### 13.1 Flujo del e-commerce

1. Cliente confirma carrito → Next.js crea la `order` en estado `pending` y llama
   a `create-checkout`.
2. `create-checkout` crea una **Stripe Checkout Session** con los line items y la
   metadata `{ order_id }`. Acepta tarjetas, **Apple Pay** y **Google Pay**
   (se habilitan automáticamente en Checkout con dominio verificado).
3. Cliente paga en Stripe.
4. Stripe envía webhooks → `stripe-webhook` concilia.

> **Nunca** se almacenan números de tarjeta ni CVV. PCI lo cubre Stripe.

`create-checkout` (esqueleto):

```ts
// supabase/functions/create-checkout/index.ts
import Stripe from "https://esm.sh/stripe@16?target=deno";
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });

Deno.serve(async (req) => {
  const { order_id } = await req.json();
  // 1. cargar order + items desde Supabase (service_role)
  // 2. construir line_items en centavos
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    currency: "mxn",
    line_items: lineItems,
    payment_method_types: ["card", "oxxo"],  // tarjeta + OXXO (Apple/Google Pay salen solos en card)
    payment_method_options: {
      oxxo: { expires_after_days: 3 },        // voucher OXXO vence en 3 días
    },
    metadata: { order_id },
    success_url: `${SITE}/checkout/exito?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE}/checkout`,
  });
  return Response.json({ url: session.url });
});
```

### 13.2 Webhooks

Eventos a manejar (todos se registran en `payments.raw` / `audit_logs`):

| Evento | Acción |
|--------|--------|
| `checkout.session.completed` | Marcar orden `paid` (si el método es síncrono); crear `payment`, **acreditar 1.5% de rewards** (sin envío ni impuestos), descontar stock de `ecommerce`. **OXXO es asíncrono**: aquí la sesión queda completada pero el pago llega después (`payment_intent.succeeded`) |
| `payment_intent.processing` | OXXO: voucher generado, pago pendiente. Orden en `pending`, notificar al cliente las instrucciones de pago |
| `payment_intent.succeeded` | Confirmar/conciliar `payment`; si era OXXO, marcar orden `paid` y acreditar rewards aquí |
| `payment_intent.payment_failed` | Notificar admin "Pago fallido" |
| `charge.refunded` | Crear `return`/ajuste, revertir rewards, reponer stock |

```ts
// supabase/functions/stripe-webhook/index.ts
import Stripe from "https://esm.sh/stripe@16?target=deno";
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const whSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature")!;
  const body = await req.text();
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, whSecret);
  } catch { return new Response("bad signature", { status: 400 }); }

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      const orderId = s.metadata.order_id;
      // idempotente: si ya existe payment por session_id, salir
      // 1. insert payment (stripe_session_id, amount, raw=event)
      // 2. update order set status='paid'
      // 3. RPC: descontar stock ecommerce de cada item
      // 4. RPC: acreditar rewards = round(subtotal_sin_envio_sin_iva * 0.015)
      // 5. invocar send-email (pago confirmado)  +  notificación admin "nuevo pedido"
      break;
    }
    case "payment_intent.payment_failed":
      // notificación admin "pago fallido"
      break;
    case "charge.refunded":
      // revertir: stock + rewards + payment.status='refunded'
      break;
  }
  return new Response("ok");
});
```

Registra el endpoint en Stripe Dashboard → Webhooks apuntando a
`https://<PROJECT_REF>.functions.supabase.co/stripe-webhook` y copia el
`whsec_...`. En local: `stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook`.

> **Idempotencia obligatoria**: antes de procesar, verifica que el
> `event.id`/`session_id` no se haya procesado (tabla de eventos o unique en
> `payments.stripe_session_id`). Stripe reintenta.

### 13.3 Conciliación

Cada pago Stripe genera un `payment` ligado a `order_id` → `customer_id` →
rewards. El `raw jsonb` guarda el evento completo para auditoría y conciliación
contable.

---

## 14. Correos con Resend

Función `send-email` con plantillas branding Turkana (serif en encabezados, mucho
espacio en blanco). Eventos:

**Cliente:** compra realizada · pago confirmado · pedido preparado · pedido
enviado.
**Admin:** nuevo pedido · pedido cancelado · pago fallido · stock bajo · crédito
vencido · apartado por vencer · diferencia en corte · venta importante · corte de
caja (con todo el detalle).

**Todos los correos al cliente se envían manualmente desde el admin** (botón en la
orden): "Compra realizada", "Pago confirmado", "Pedido preparado" y "Pedido
enviado" llaman a `send-email` con el template correspondiente. El sistema **no**
envía correos automáticos al cliente; las alertas internas (admin) sí pueden caer
automáticas en el dashboard (`notifications`), pero el correo se dispara con el
botón. Esto da control total sobre cuándo y qué se comunica al cliente.

```ts
// supabase/functions/send-email/index.ts
Deno.serve(async (req) => {
  const { template, to, data } = await req.json();
  const html = renderTemplate(template, data);   // plantillas Turkana
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: Deno.env.get("EMAIL_FROM"),
      to, subject: subjectFor(template), html,
    }),
  });
  return Response.json({ ok: r.ok });
});
```

Verifica el dominio en Resend (DNS: SPF, DKIM, DMARC) antes de producción.

---

## 15. Turkana Rewards (lealtad)

Acumulación **1.5% del subtotal**, sin envío ni impuestos, igual en POS y online.
Centraliza en una función `security definer` para que sea la única vía de mover
saldos:

```sql
create or replace function credit_rewards(p_customer uuid, p_order uuid,
  p_subtotal_cents bigint, p_channel text)
returns void language plpgsql security definer set search_path = public as $$
declare pts bigint := floor(p_subtotal_cents * 0.015);
begin
  insert into customer_rewards (customer_id, balance_cents, lifetime_earned_cents)
  values (p_customer, pts, pts)
  on conflict (customer_id) do update
    set balance_cents = customer_rewards.balance_cents + pts,
        lifetime_earned_cents = customer_rewards.lifetime_earned_cents + pts,
        updated_at = now();

  insert into reward_transactions (customer_id, type, amount_cents, order_id, channel)
  values (p_customer, 'earn', pts, p_order, p_channel);

  update orders set rewards_earned_cents = pts where id = p_order;
end; $$;
```

**Canje (POS y online).** El saldo se usa como descuento en cualquier canal.
La redención pasa por una única función `security definer` que valida saldo,
descuenta y registra el movimiento de forma atómica; el front solo *propone* el
monto a canjear y el servidor lo confirma:

```sql
create or replace function redeem_rewards(p_customer uuid, p_order uuid,
  p_amount_cents bigint, p_channel text)
returns bigint language plpgsql security definer set search_path = public as $$
declare bal bigint; cap bigint;
begin
  -- tope configurable por operación (default $1,000 = 100000 centavos)
  select coalesce(value::bigint, 100000) into cap
  from app_settings where key = 'rewards_max_redeem_cents';
  if p_amount_cents > cap then
    raise exception 'CANJE_EXCEDE_TOPE';
  end if;

  select balance_cents into bal from customer_rewards
  where customer_id = p_customer for update;     -- bloquea fila

  if bal is null or bal < p_amount_cents then
    raise exception 'SALDO_INSUFICIENTE';
  end if;

  update customer_rewards
    set balance_cents = balance_cents - p_amount_cents, updated_at = now()
  where customer_id = p_customer;

  insert into reward_transactions (customer_id, type, amount_cents, order_id, channel)
  values (p_customer, 'redeem', -p_amount_cents, p_order, p_channel);

  update orders set rewards_redeemed_cents = p_amount_cents where id = p_order;
  return p_amount_cents;
end; $$;
```

El monto canjeado se trata como descuento: reduce la base de IVA y el `total` de
la orden (ver fórmula de IVA en §1). En el e-commerce, el canje se aplica **antes**
de crear la Stripe Checkout Session (se cobra solo el remanente). En POS, se
registra como `payment` con `method = 'rewards'`.

El cliente consulta historial/saldo/movimientos desde `customer_rewards` y
`reward_transactions` (RLS: solo lo suyo).

---

## 16. Inventario omnicanal (doble almacén)

- **Un solo catálogo** (`products`/`product_variants`); el stock vive por almacén
  en `stock_levels` (`tienda` vs `ecommerce`).
- Venta POS descuenta de `tienda`; venta online descuenta de `ecommerce`.
- Reparto desde "lista principal": traspaso = dos `inventory_movements`
  (salida origen + entrada destino) atómicos.

Función transaccional para descontar con bloqueo (evita sobreventa):

```sql
create or replace function decrement_stock(p_variant uuid, p_location_key text,
  p_qty int, p_ref_type text, p_ref_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare loc uuid; avail int;
begin
  select id into loc from inventory_locations where key = p_location_key;

  select quantity - reserved into avail
  from stock_levels
  where variant_id = p_variant and location_id = loc
  for update;                                   -- bloquea la fila

  if avail is null or avail < p_qty then
    raise exception 'STOCK_INSUFICIENTE';
  end if;

  update stock_levels set quantity = quantity - p_qty, updated_at = now()
  where variant_id = p_variant and location_id = loc;

  insert into inventory_movements (variant_id, location_id, type, quantity, reference_type, reference_id)
  values (p_variant, loc, p_ref_type, -p_qty, p_ref_type, p_ref_id);
end; $$;
```

Trigger de alerta de stock bajo → inserta en `notifications` y dispara correo.

---

## 17. Sincronización Offline-First del POS

**Cliente (tablet):** PWA + Service Worker + IndexedDB (Dexie.js). Copia local de
`products`, `product_variants`, `stock_levels`, `customers`, `credit_accounts`,
`layaways`, configuración y `cash_sessions` activa.

**Cuando no hay internet** el POS sigue: vendiendo, cobrando, imprimiendo tickets
ESC/POS, consultando inventario local, registrando apartados, pagos a crédito y
clientes. Un indicador visual muestra "Sin conexión a la nube".

**Cola de salida:** cada operación offline crea un registro en la `sync_queue`
local con `client_op_id` idempotente, `operation_type`, `payload`, `client_created_at`,
`status='pending'`.

**Al volver internet** (Background Sync API): se envían las operaciones a la Edge
Function `sync-process`, que:

1. Valida idempotencia (`unique(device_id, client_op_id)`).
2. Aplica la operación contra Supabase (fuente de verdad).
3. Detecta conflictos. **Para joyería: Manual Review** (no auto-resolver).
   Ejemplo: dos tablets venden el mismo SKU-001 offline → la segunda queda
   `status='conflict'` y se notifica para revisión humana.
4. Marca cada item `synced` / `error` / `conflict` y escribe auditoría de sync.

```ts
// Cliente: Dexie + outbox
import Dexie from "dexie";
export const db = new Dexie("turkana_pos");
db.version(1).stores({
  products: "id, sku",
  variants: "id, product_id, sku",
  stock: "[variant_id+location_id]",
  customers: "id, phone, email",
  outbox: "++localId, client_op_id, status, client_created_at",
});

export async function enqueue(operation_type: string, payload: unknown) {
  await db.table("outbox").add({
    client_op_id: crypto.randomUUID(),
    operation_type, payload,
    status: "pending",
    client_created_at: new Date().toISOString(),
  });
  if ("serviceWorker" in navigator && "SyncManager" in window) {
    const reg = await navigator.serviceWorker.ready;
    await reg.sync.register("turkana-sync");
  }
}
```

```ts
// sync-process: procesa lote del outbox
Deno.serve(async (req) => {
  const { device_id, operations } = await req.json();
  const results = [];
  for (const op of operations) {
    // upsert en sync_queue por (device_id, client_op_id) -> idempotente
    // intentar aplicar: order.create -> crea order + decrement_stock + rewards...
    // si STOCK_INSUFICIENTE u otra colisión -> status 'conflict'
    results.push({ client_op_id: op.client_op_id, status });
  }
  return Response.json({ results });
});
```

**POS instalable (PWA):** `manifest.json` con `display: "fullscreen"`,
compatible Android/iPad/Windows. Cada dispositivo se registra en `devices` con su
`device_id`.

---

## 18. Auditoría

- Toda tabla: `created_at/updated_at/deleted_at/created_by`.
- Operaciones sensibles (cancelar venta, ajustar inventario, modificar crédito,
  corte de caja, resguardo, sync con conflicto) escriben en `audit_logs` con
  `before/after`, `actor_id`, `device_id`.
- Trigger genérico de auditoría opcional para tablas críticas:

```sql
create or replace function audit_trigger() returns trigger
language plpgsql security definer as $$
begin
  insert into audit_logs (actor_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), tg_op, tg_table_name,
          coalesce(new.id, old.id),
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end; $$;
```

---

## 19. Orden de implementación

1. **Supabase base**: `supabase init/link`, extensiones, helpers (`set_updated_at`).
2. **Auth/roles/permisos** + hook de custom claims + seed de roles/permisos/almacenes.
3. **Catálogo** (categorías, colecciones, productos, variantes, imágenes) + Storage.
4. **Inventario** (locations, stock_levels, movements) + `decrement_stock`.
5. **Clientes y Rewards** + `credit_rewards`.
6. **Órdenes/Pagos/Envíos** + generador de folios.
7. **Stripe**: `create-checkout` + `stripe-webhook` + conciliación + rewards.
8. **Resend**: `send-email` + plantillas + botones manuales en admin.
9. **POS / Caja**: sesiones, movimientos, resguardos, precorte, corte, tickets ESC/POS + PDF.
10. **Crédito / Apartados / Devoluciones / Servicios.**
11. **Offline-First**: PWA, Dexie, outbox, `sync-process`, conflictos (Manual Review).
12. **Notificaciones + Dashboard + Reportes.**
13. **RLS endurecido** en todas las tablas + pruebas.
14. **Auditoría** completa.

---

## 20. Seguridad y checklist de producción

- [ ] RLS habilitado en **todas** las tablas; probado con usuario anónimo, cliente y cada rol.
- [ ] `service_role` solo en Edge Functions / server-side; nunca en bundle del cliente.
- [ ] Webhooks de Stripe con verificación de firma e **idempotencia**.
- [ ] Nunca se guardan PAN/CVV; PCI delegado a Stripe.
- [ ] Montos en centavos (`bigint`); IVA y redondeos consistentes.
- [ ] Stock con bloqueo (`for update`) para evitar sobreventa.
- [ ] Backups automáticos de Supabase + PITR activado.
- [ ] Dominio de Resend verificado (SPF/DKIM/DMARC).
- [ ] Secrets en Vercel y Supabase, no en el repo.
- [ ] Rate limiting en endpoints públicos (checkout, registro).
- [ ] Auditoría escribe en operaciones sensibles.
- [ ] Conflictos de sync resueltos por **Manual Review** y registrados.
- [ ] Roles de DB: `anon`/`authenticated` con permisos mínimos.

---

### Decisiones tomadas

- **IVA:** precios sin IVA; se suma 16% en el checkout (ver §1).
- **Rewards:** canjeables como descuento en **POS y online**, con **tope
  configurable de $1,000 por operación** (`rewards_max_redeem_cents`, ver §15).
  Los puntos **vencen a los 12 meses** (`rewards_expiry_months`); un job diario
  `expire_rewards()` los caduca (FIFO).
- **Inventario:** **1 tienda física + e-commerce** (dos almacenes fijos). El modelo
  `inventory_locations` ya permite agregar sucursales más adelante sin migrar datos.
- **Folios:** `order_number` de **6 dígitos con ceros** (`000001`) y **prefijo
  configurable** (`order_folio_prefix`, default `TK-`). POS y online comparten la
  misma secuencia. Los **SKU de producto/variante se definen al crear el producto**.
- **Envíos:** **sin tracking de paquetería**; solo estados manuales
  (`preparing → ready → shipped → delivered`).
- **Notificaciones al cliente:** se envían **manualmente por correo** desde el admin.
- **Stripe:** tarjeta + **OXXO** (sin SPEI). OXXO es pago asíncrono (ver §13.2).

- **Rewards — caducidad:** los puntos **vencen a los 12 meses** de ganados.
- **Stripe:** cuenta aún no creada → ver `STRIPE_SETUP.md` para la configuración
  exacta (México, OXXO, webhooks, claves).
```
