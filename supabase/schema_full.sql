-- Turkana Jewelry - esquema completo (migraciones + seed) para el SQL Editor de Supabase.
-- Ejecutar una sola vez en un proyecto nuevo.


-- ====================================================================
-- migrations/0001_extensions_helpers.sql
-- ====================================================================

-- 0001_extensions_helpers.sql
-- Extensiones y helpers reutilizables.

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";     -- búsqueda por similitud

-- Mantiene updated_at en cada UPDATE.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;


-- ====================================================================
-- migrations/0002_settings.sql
-- ====================================================================

-- 0002_settings.sql
-- Configuración global key/value (folios, rewards, envíos, IVA, resguardos).

create table app_settings (
  key         text primary key,
  value       text,
  description text,
  updated_at  timestamptz not null default now()
);

create trigger trg_app_settings_updated before update on app_settings
  for each row execute function set_updated_at();


-- ====================================================================
-- migrations/0003_auth_roles.sql
-- ====================================================================

-- 0003_auth_roles.sql
-- Roles, permisos y perfil de staff ligado a auth.users.

create table roles (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,   -- super_admin, admin, gerente, cajero, inventarios, atencion
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

create table permissions (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,   -- ventas.cancelar, credito.modificar, inventario.ajustar...
  description text
);

create table role_permissions (
  role_id       uuid references roles(id) on delete cascade,
  permission_id uuid references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

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


-- ====================================================================
-- migrations/0004_catalog.sql
-- ====================================================================

-- 0004_catalog.sql
-- Catálogo: categorías, colecciones, productos, variantes e imágenes.

create table categories (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references categories(id),
  name       text not null,
  slug       text unique not null,
  position   int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger trg_categories_updated before update on categories
  for each row execute function set_updated_at();

create table collections (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,         -- Primavera, Navidad, San Valentín...
  slug           text unique not null,
  description    text,
  hero_image_url text,
  is_active      boolean not null default true,
  starts_at      timestamptz,
  ends_at        timestamptz,
  position       int default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create trigger trg_collections_updated before update on collections
  for each row execute function set_updated_at();

create table products (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  slug             text unique not null,
  sku              text unique,         -- SKU base (las variantes tienen el suyo)
  short_description text,
  long_description text,
  material         text,                -- oro, plata, oro rosa...
  stone            text,
  weight_grams     numeric(10,2),
  category_id      uuid references categories(id),
  collection_id    uuid references collections(id),
  tags             text[] default '{}',
  seo_title        text,
  seo_description  text,
  status           text not null default 'draft' check (status in ('draft','active','archived')),
  is_featured      boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  created_by       uuid references auth.users(id)
);
create index on products using gin (tags);
create index on products using gin (name gin_trgm_ops);
create trigger trg_products_updated before update on products
  for each row execute function set_updated_at();

create table product_variants (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references products(id) on delete cascade,
  sku              text unique not null,
  attributes       jsonb not null default '{}',   -- {"metal":"oro","talla":"7"}
  price_cents      bigint not null,               -- SIN IVA
  compare_at_cents bigint,
  barcode          text,
  is_active        boolean not null default true,
  position         int default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index on product_variants (product_id);
create trigger trg_variants_updated before update on product_variants
  for each row execute function set_updated_at();

create table product_images (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references products(id) on delete cascade,
  variant_id   uuid references product_variants(id) on delete cascade,
  storage_path text not null,
  alt          text,
  type         text not null default 'image' check (type in ('image','video')),
  position     int default 0,
  created_at   timestamptz not null default now()
);
create index on product_images (product_id);


-- ====================================================================
-- migrations/0005_inventory.sql
-- ====================================================================

-- 0005_inventory.sql
-- Inventario omnicanal: almacenes, stock por almacén y movimientos auditables.

create table inventory_locations (
  id         uuid primary key default gen_random_uuid(),
  key        text unique not null,   -- 'tienda' | 'ecommerce'
  name       text not null,
  type       text not null check (type in ('physical','online')),
  created_at timestamptz not null default now()
);

create table stock_levels (
  id                  uuid primary key default gen_random_uuid(),
  variant_id          uuid not null references product_variants(id) on delete cascade,
  location_id         uuid not null references inventory_locations(id),
  quantity            int not null default 0,
  reserved            int not null default 0,
  low_stock_threshold int default 2,
  updated_at          timestamptz not null default now(),
  unique (variant_id, location_id)
);

create table inventory_movements (
  id             uuid primary key default gen_random_uuid(),
  variant_id     uuid not null references product_variants(id),
  location_id    uuid not null references inventory_locations(id),
  type           text not null check (type in ('entrada','salida','ajuste','traspaso','venta','devolucion')),
  quantity       int not null,         -- positivo o negativo
  reference_type text,                 -- 'order','return','transfer','manual'
  reference_id   uuid,
  notes          text,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id)
);
create index on inventory_movements (variant_id, created_at);


-- ====================================================================
-- migrations/0006_customers_rewards.sql
-- ====================================================================

-- 0006_customers_rewards.sql
-- Clientes, direcciones y programa de lealtad Turkana Rewards.

create table customers (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id),  -- null si es cliente solo-físico
  full_name    text not null,
  email        text,
  phone        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create unique index on customers (email) where email is not null;
create trigger trg_customers_updated before update on customers
  for each row execute function set_updated_at();

create table customer_addresses (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references customers(id) on delete cascade,
  street          text,
  ext_number      text,
  int_number      text,
  postal_code     text,
  neighborhood    text,
  city            text,
  state           text,
  references_note text,
  lat             numeric,
  lng             numeric,
  is_default      boolean default false,
  created_at      timestamptz not null default now()
);

create table customer_rewards (
  customer_id           uuid primary key references customers(id) on delete cascade,
  balance_cents         bigint not null default 0,
  lifetime_earned_cents bigint not null default 0,
  updated_at            timestamptz not null default now()
);

create table reward_transactions (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  type        text not null check (type in ('earn','redeem','adjust','expire')),
  amount_cents bigint not null,        -- +gana / -canjea
  order_id    uuid,
  channel     text check (channel in ('pos','ecommerce')),
  notes       text,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id)
);
create index on reward_transactions (customer_id, created_at);


-- ====================================================================
-- migrations/0007_orders_payments.sql
-- ====================================================================

-- 0007_orders_payments.sql
-- Órdenes, partidas, pagos y envíos. Folio de 6 dígitos con prefijo configurable.

create sequence if not exists order_folio_seq;

create table orders (
  id                     uuid primary key default gen_random_uuid(),
  order_number           text unique,            -- se autollena por trigger (TK-000001)
  channel                text not null check (channel in ('pos','ecommerce')),
  customer_id            uuid references customers(id),
  status                 text not null default 'pending'
    check (status in ('pending','paid','preparing','shipped','delivered','completed','cancelled')),
  subtotal_cents         bigint not null default 0,   -- SIN IVA
  discount_cents         bigint not null default 0,
  shipping_cents         bigint not null default 0,
  tax_cents              bigint not null default 0,    -- IVA 16% (se suma en checkout)
  total_cents            bigint not null default 0,
  rewards_earned_cents   bigint not null default 0,
  rewards_redeemed_cents bigint not null default 0,
  cash_session_id        uuid,
  device_id              uuid,
  shipping_method        text,                   -- 'standard','express','free'
  shipping_address_id    uuid references customer_addresses(id),
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz,
  created_by             uuid references auth.users(id)
);
create index on orders (status, created_at);
create index on orders (customer_id);
create trigger trg_orders_updated before update on orders
  for each row execute function set_updated_at();

create table order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references orders(id) on delete cascade,
  variant_id       uuid references product_variants(id),
  sku              text not null,        -- snapshot al momento de la venta
  name             text not null,
  unit_price_cents bigint not null,
  quantity         int not null,
  total_cents      bigint not null,
  is_service       boolean not null default false
);
create index on order_items (order_id);

create table payments (
  id                       uuid primary key default gen_random_uuid(),
  order_id                 uuid references orders(id),
  method                   text not null
    check (method in ('cash','card','transfer','stripe','oxxo','rewards','credit','layaway')),
  amount_cents             bigint not null,
  status                   text not null default 'completed'
    check (status in ('pending','completed','failed','refunded')),
  stripe_payment_intent_id text,
  stripe_charge_id         text,
  stripe_session_id        text,
  raw                      jsonb,        -- conciliación
  created_at               timestamptz not null default now()
);
create index on payments (order_id);
create unique index on payments (stripe_session_id) where stripe_session_id is not null;
create unique index on payments (stripe_payment_intent_id) where stripe_payment_intent_id is not null;

create table shipments (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id),
  status       text not null default 'preparing'
    check (status in ('preparing','ready','shipped','delivered')),
  -- sin tracking de paquetería: solo estados manuales
  shipped_at   timestamptz,
  delivered_at timestamptz,
  created_at   timestamptz not null default now()
);


-- ====================================================================
-- migrations/0008_pos_cash.sql
-- ====================================================================

-- 0008_pos_cash.sql
-- Caja del POS: cajas, sesiones (turnos por lote), movimientos, resguardos y gastos.

create table cash_registers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  location_id uuid references inventory_locations(id),
  created_at  timestamptz not null default now()
);

create table cash_sessions (
  id                     uuid primary key default gen_random_uuid(),
  register_id            uuid not null references cash_registers(id),
  cashier_id             uuid not null references auth.users(id),
  device_id              uuid,
  opening_float_cents    bigint not null,        -- fondo inicial
  status                 text not null default 'open' check (status in ('open','closed')),
  counted_cash_cents     bigint,
  counted_card_cents     bigint,
  counted_transfer_cents bigint,
  expected_cash_cents    bigint,
  difference_cents       bigint,
  opened_at              timestamptz not null default now(),
  closed_at              timestamptz,
  closed_by              uuid references auth.users(id)
);
create index on cash_sessions (register_id, status);

create table cash_movements (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references cash_sessions(id),
  type       text not null check (type in ('sale','refund','expense','drop','in','out','precut')),
  method     text check (method in ('cash','card','transfer')),
  amount_cents bigint not null,
  reference_id uuid,
  notes      text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on cash_movements (session_id);

create table cash_drops (             -- resguardos a caja fuerte
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references cash_sessions(id),
  amount_cents    bigint not null,
  responsible_id  uuid not null references auth.users(id),
  threshold_cents bigint,            -- límite configurado que disparó la alerta
  notes           text,
  created_at      timestamptz not null default now()
);

create table expenses (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid references cash_sessions(id),
  concept     text not null,
  amount_cents bigint not null,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);


-- ====================================================================
-- migrations/0009_credit_layaway_returns_services.sql
-- ====================================================================

-- 0009_credit_layaway_returns_services.sql
-- Crédito a clientes, apartados, devoluciones/cambios y venta de servicios.

create table credit_accounts (        -- solo tienda física
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references customers(id),
  limit_cents   bigint not null default 0,
  balance_cents bigint not null default 0,    -- saldo deudor
  status        text not null default 'active' check (status in ('active','suspended')),
  created_at    timestamptz not null default now()
);

create table credit_transactions (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references credit_accounts(id),
  order_id    uuid references orders(id),
  type        text not null check (type in ('charge','payment')),
  amount_cents bigint not null,
  due_date    date,
  status      text check (status in ('vigente','vencido','pagado')),
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id)
);

create table layaways (               -- apartados
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  variant_id  uuid references product_variants(id),
  total_cents bigint not null,
  paid_cents  bigint not null default 0,
  status      text not null default 'active' check (status in ('active','completed','cancelled','expired')),
  due_date    date,
  order_id    uuid references orders(id),     -- al convertir a venta
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id)
);

create table layaway_payments (
  id          uuid primary key default gen_random_uuid(),
  layaway_id  uuid not null references layaways(id) on delete cascade,
  amount_cents bigint not null,
  method      text check (method in ('cash','card','transfer')),
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create table returns (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid references orders(id),
  variant_id          uuid references product_variants(id),
  quantity            int not null,
  reason              text,
  type                text not null check (type in ('return','exchange')),
  exchange_variant_id uuid references product_variants(id),
  refund_cents        bigint default 0,
  responsible_id      uuid references auth.users(id),
  created_at          timestamptz not null default now()
);

create table service_sales (          -- venta rápida sin inventario
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid references orders(id),
  concept     text not null,          -- limpieza, reparación, ajuste de anillo...
  description text,
  amount_cents bigint not null,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);


-- ====================================================================
-- migrations/0010_notifications_audit_sync.sql
-- ====================================================================

-- 0010_notifications_audit_sync.sql
-- Notificaciones de dashboard, auditoría, dispositivos y cola de sincronización offline.

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  type        text not null,   -- new_order, low_stock, out_of_stock, credit_due, layaway_due, cash_difference, big_sale, cash_cut
  title       text not null,
  body        text,
  data        jsonb,
  target_role text,            -- a qué rol dirigir en el dashboard
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index on notifications (target_role, read_at);

create table audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users(id),
  action      text not null,   -- 'order.cancel', 'inventory.adjust', 'credit.update'...
  entity_type text,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  ip          text,
  device_id   uuid,
  created_at  timestamptz not null default now()
);
create index on audit_logs (entity_type, entity_id);

create table devices (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  platform    text,            -- android, ipad, windows
  register_id uuid references cash_registers(id),
  last_seen_at timestamptz,
  is_active   boolean default true,
  created_at  timestamptz not null default now()
);

create table sync_queue (
  id                uuid primary key default gen_random_uuid(),
  device_id         uuid references devices(id),
  client_op_id      text not null,    -- id idempotente generado en el cliente
  operation_type    text not null,    -- 'order.create','layaway.payment','customer.create'...
  payload           jsonb not null,
  status            text not null default 'pending'
    check (status in ('pending','synced','error','conflict')),
  error             text,
  client_created_at timestamptz not null,
  processed_at      timestamptz,
  created_at        timestamptz not null default now(),
  unique (device_id, client_op_id)    -- idempotencia
);
create index on sync_queue (status);


-- ====================================================================
-- migrations/0011_functions.sql
-- ====================================================================

-- 0011_functions.sql
-- Funciones de negocio y helpers de seguridad.

-- ── Helpers de roles/permisos ──────────────────────────────────────────────
create or replace function auth_role() returns text
language sql stable as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb->>'user_role','customer')
$$;

create or replace function is_staff() returns boolean
language sql stable as $$
  select auth_role() in ('super_admin','admin','gerente','cajero','inventarios','atencion')
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

-- Hook que inyecta el rol en el JWT (Authentication → Hooks → Custom Access Token).
-- SECURITY DEFINER: lo ejecuta GoTrue como supabase_auth_admin, pero corre como
-- el dueño (postgres) y así omite RLS al leer profiles/roles. Sin esto, el login da 500.
create or replace function custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare claims jsonb; user_role text;
begin
  select r.key into user_role
  from profiles p join roles r on r.id = p.role_id
  where p.id = (event->>'user_id')::uuid;

  claims := event->'claims';
  claims := jsonb_set(claims, '{user_role}', to_jsonb(coalesce(user_role,'customer')));
  return jsonb_set(event, '{claims}', claims);
end; $$;

-- Permite que Auth ejecute el hook (además hay que habilitarlo en config/dashboard).
grant execute on function custom_access_token_hook(jsonb) to supabase_auth_admin;

-- ── Folio de orden: 6 dígitos + prefijo configurable ───────────────────────
create or replace function next_order_number() returns text
language plpgsql as $$
declare prefix text; n bigint;
begin
  select value into prefix from app_settings where key = 'order_folio_prefix';
  prefix := coalesce(prefix, 'TK-');
  n := nextval('order_folio_seq');
  return prefix || lpad(n::text, 6, '0');
end; $$;

create or replace function set_order_number() returns trigger
language plpgsql as $$
begin
  if new.order_number is null then
    new.order_number := next_order_number();
  end if;
  return new;
end; $$;

create trigger trg_orders_folio before insert on orders
  for each row execute function set_order_number();

-- ── Inventario: descuento con bloqueo (evita sobreventa) ───────────────────
create or replace function decrement_stock(p_variant uuid, p_location_key text,
  p_qty int, p_ref_type text, p_ref_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare loc uuid; avail int;
begin
  select id into loc from inventory_locations where key = p_location_key;

  select quantity - reserved into avail
  from stock_levels
  where variant_id = p_variant and location_id = loc
  for update;

  if avail is null or avail < p_qty then
    raise exception 'STOCK_INSUFICIENTE';
  end if;

  update stock_levels set quantity = quantity - p_qty, updated_at = now()
  where variant_id = p_variant and location_id = loc;

  -- 'venta' es el tipo de movimiento; p_ref_type ('order') va en reference_type.
  insert into inventory_movements (variant_id, location_id, type, quantity, reference_type, reference_id)
  values (p_variant, loc, 'venta', -p_qty, p_ref_type, p_ref_id);
end; $$;

-- ── Rewards: acreditación 1.5% (sin envío ni impuestos) ────────────────────
create or replace function credit_rewards(p_customer uuid, p_order uuid,
  p_subtotal_cents bigint, p_channel text)
returns void language plpgsql security definer set search_path = public as $$
declare rate numeric; pts bigint;
begin
  select coalesce(value::numeric, 0.015) into rate
  from app_settings where key = 'rewards_earn_rate';
  pts := floor(p_subtotal_cents * rate);

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

-- ── Rewards: canje con tope configurable (default $1,000) ───────────────────
create or replace function redeem_rewards(p_customer uuid, p_order uuid,
  p_amount_cents bigint, p_channel text)
returns bigint language plpgsql security definer set search_path = public as $$
declare bal bigint; cap bigint;
begin
  select coalesce(value::bigint, 100000) into cap
  from app_settings where key = 'rewards_max_redeem_cents';
  if p_amount_cents > cap then
    raise exception 'CANJE_EXCEDE_TOPE';
  end if;

  select balance_cents into bal from customer_rewards
  where customer_id = p_customer for update;

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

-- ── Auditoría genérica (opcional por tabla) ────────────────────────────────
create or replace function audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_logs (actor_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), tg_op, tg_table_name,
          coalesce((new).id, (old).id),
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end; $$;


-- ====================================================================
-- migrations/0012_rls.sql
-- ====================================================================

-- 0012_rls.sql
-- Row Level Security en todas las tablas + publicación Realtime.
-- Regla general: catálogo público de lectura; cliente ve solo lo suyo;
-- staff gestiona; las mutaciones sensibles van por funciones security definer.

-- Habilitar RLS en todas las tablas de negocio.
alter table app_settings        enable row level security;
alter table roles               enable row level security;
alter table permissions         enable row level security;
alter table role_permissions    enable row level security;
alter table profiles            enable row level security;
alter table categories          enable row level security;
alter table collections         enable row level security;
alter table products            enable row level security;
alter table product_variants    enable row level security;
alter table product_images      enable row level security;
alter table inventory_locations enable row level security;
alter table stock_levels        enable row level security;
alter table inventory_movements enable row level security;
alter table customers           enable row level security;
alter table customer_addresses  enable row level security;
alter table customer_rewards    enable row level security;
alter table reward_transactions enable row level security;
alter table orders              enable row level security;
alter table order_items         enable row level security;
alter table payments            enable row level security;
alter table shipments           enable row level security;
alter table cash_registers      enable row level security;
alter table cash_sessions       enable row level security;
alter table cash_movements      enable row level security;
alter table cash_drops          enable row level security;
alter table expenses            enable row level security;
alter table credit_accounts     enable row level security;
alter table credit_transactions enable row level security;
alter table layaways            enable row level security;
alter table layaway_payments    enable row level security;
alter table returns             enable row level security;
alter table service_sales       enable row level security;
alter table notifications       enable row level security;
alter table audit_logs          enable row level security;
alter table devices             enable row level security;
alter table sync_queue          enable row level security;

-- ── Catálogo público (lectura anónima de lo publicado) ─────────────────────
create policy "categories_public_read" on categories
  for select using (deleted_at is null);
create policy "collections_public_read" on collections
  for select using (is_active and deleted_at is null);
create policy "products_public_read" on products
  for select using (status = 'active' and deleted_at is null);
create policy "variants_public_read" on product_variants
  for select using (is_active and deleted_at is null);
create policy "images_public_read" on product_images
  for select using (true);

-- Staff con permiso de inventario gestiona el catálogo.
create policy "categories_staff_write" on categories
  for all using (has_permission('inventario.ajustar')) with check (has_permission('inventario.ajustar'));
create policy "collections_staff_write" on collections
  for all using (is_staff()) with check (is_staff());
create policy "products_staff_write" on products
  for all using (has_permission('inventario.ajustar')) with check (has_permission('inventario.ajustar'));
create policy "variants_staff_write" on product_variants
  for all using (has_permission('inventario.ajustar')) with check (has_permission('inventario.ajustar'));
create policy "images_staff_write" on product_images
  for all using (has_permission('inventario.ajustar')) with check (has_permission('inventario.ajustar'));

-- ── Clientes: cada quien ve lo suyo; staff ve todo ─────────────────────────
create policy "customers_self_or_staff" on customers
  for select using (auth_user_id = auth.uid() or is_staff());
create policy "customers_staff_write" on customers
  for all using (is_staff()) with check (is_staff());

create policy "addresses_self_or_staff" on customer_addresses
  for all using (
    is_staff() or customer_id in (select id from customers where auth_user_id = auth.uid())
  ) with check (
    is_staff() or customer_id in (select id from customers where auth_user_id = auth.uid())
  );

create policy "rewards_self_read" on customer_rewards
  for select using (
    is_staff() or customer_id in (select id from customers where auth_user_id = auth.uid())
  );
create policy "reward_tx_self_read" on reward_transactions
  for select using (
    is_staff() or customer_id in (select id from customers where auth_user_id = auth.uid())
  );

-- ── Órdenes: cliente ve las suyas; staff todas ─────────────────────────────
create policy "orders_owner_or_staff" on orders
  for select using (
    is_staff() or customer_id in (select id from customers where auth_user_id = auth.uid())
  );
create policy "orders_staff_write" on orders
  for all using (is_staff()) with check (is_staff());

create policy "order_items_read" on order_items
  for select using (
    is_staff() or order_id in (
      select o.id from orders o join customers c on c.id = o.customer_id
      where c.auth_user_id = auth.uid()
    )
  );
create policy "order_items_staff_write" on order_items
  for all using (is_staff()) with check (is_staff());

create policy "payments_read" on payments
  for select using (
    is_staff() or order_id in (
      select o.id from orders o join customers c on c.id = o.customer_id
      where c.auth_user_id = auth.uid()
    )
  );
create policy "shipments_read" on shipments
  for select using (
    is_staff() or order_id in (
      select o.id from orders o join customers c on c.id = o.customer_id
      where c.auth_user_id = auth.uid()
    )
  );
create policy "shipments_staff_write" on shipments
  for all using (is_staff()) with check (is_staff());

-- ── Lectura general de catálogo de soporte para staff ──────────────────────
create policy "locations_staff_read" on inventory_locations
  for select using (is_staff());

-- Stock y movimientos: staff lee; ajustes/traspasos manuales requieren permiso.
create policy "stock_staff_read" on stock_levels
  for select using (is_staff());
create policy "stock_staff_write" on stock_levels
  for all using (has_permission('inventario.ajustar')) with check (has_permission('inventario.ajustar'));
create policy "movements_staff_read" on inventory_movements
  for select using (is_staff());
create policy "movements_staff_write" on inventory_movements
  for insert with check (has_permission('inventario.ajustar'));

-- ── Tablas solo-staff (back-office / POS) ──────────────────────────────────
-- Lectura para staff; escritura preferente vía funciones security definer.
create policy "settings_staff" on app_settings for select using (is_staff());
create policy "roles_staff" on roles for select using (is_staff());
create policy "permissions_staff" on permissions for select using (is_staff());
create policy "role_permissions_staff" on role_permissions for select using (is_staff());
create policy "profiles_self_or_staff" on profiles
  for select using (id = auth.uid() or is_staff());
create policy "profiles_admin_write" on profiles
  for all using (has_permission('usuarios.crear')) with check (has_permission('usuarios.crear'));

create policy "cash_registers_staff" on cash_registers for all using (is_staff()) with check (is_staff());
create policy "cash_sessions_staff" on cash_sessions for all using (is_staff()) with check (is_staff());
create policy "cash_movements_staff" on cash_movements for all using (is_staff()) with check (is_staff());
create policy "cash_drops_staff" on cash_drops for all using (is_staff()) with check (is_staff());
create policy "expenses_staff" on expenses for all using (is_staff()) with check (is_staff());

create policy "credit_accounts_staff" on credit_accounts for all using (is_staff()) with check (is_staff());
create policy "credit_tx_staff" on credit_transactions for all using (is_staff()) with check (is_staff());
create policy "layaways_staff" on layaways for all using (is_staff()) with check (is_staff());
create policy "layaway_payments_staff" on layaway_payments for all using (is_staff()) with check (is_staff());
create policy "returns_staff" on returns for all using (is_staff()) with check (is_staff());
create policy "service_sales_staff" on service_sales for all using (is_staff()) with check (is_staff());

create policy "notifications_staff" on notifications
  for select using (is_staff());
create policy "audit_logs_staff_read" on audit_logs
  for select using (auth_role() in ('super_admin','admin'));
create policy "devices_staff" on devices for all using (is_staff()) with check (is_staff());
create policy "sync_queue_staff" on sync_queue for all using (is_staff()) with check (is_staff());

-- ── Auth Hook: el rol supabase_auth_admin debe poder leer profiles/roles ───
-- Sin esto el custom_access_token_hook falla y el login devuelve 500.
grant usage on schema public to supabase_auth_admin;
grant execute on function custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on profiles to supabase_auth_admin;
grant select on roles to supabase_auth_admin;

create policy "auth_admin_read_profiles" on profiles
  as permissive for select to supabase_auth_admin using (true);
create policy "auth_admin_read_roles" on roles
  as permissive for select to supabase_auth_admin using (true);

-- ── Realtime ───────────────────────────────────────────────────────────────
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table stock_levels;
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table cash_sessions;


-- ====================================================================
-- migrations/0013_rewards_expiry.sql
-- ====================================================================

-- 0013_rewards_expiry.sql
-- Caducidad de Turkana Rewards: los puntos vencen al año de ganados (configurable).

-- Fecha de vencimiento por transacción de acumulación (visible para el cliente).
alter table reward_transactions add column if not exists expires_at timestamptz;

-- credit_rewards ahora fija expires_at = now + rewards_expiry_months.
create or replace function credit_rewards(p_customer uuid, p_order uuid,
  p_subtotal_cents bigint, p_channel text)
returns void language plpgsql security definer set search_path = public as $$
declare rate numeric; months int; pts bigint;
begin
  select coalesce(value::numeric, 0.015) into rate
  from app_settings where key = 'rewards_earn_rate';
  select coalesce(value::int, 12) into months
  from app_settings where key = 'rewards_expiry_months';
  pts := floor(p_subtotal_cents * rate);

  insert into customer_rewards (customer_id, balance_cents, lifetime_earned_cents)
  values (p_customer, pts, pts)
  on conflict (customer_id) do update
    set balance_cents = customer_rewards.balance_cents + pts,
        lifetime_earned_cents = customer_rewards.lifetime_earned_cents + pts,
        updated_at = now();

  insert into reward_transactions (customer_id, type, amount_cents, order_id, channel, expires_at)
  values (p_customer, 'earn', pts, p_order, p_channel, now() + make_interval(months => months));

  update orders set rewards_earned_cents = pts where id = p_order;
end; $$;

-- Job de expiración (FIFO): el consumo (canjes/expiraciones) golpea primero los
-- puntos más antiguos, así que lo vencido-no-consumido =
--   sum(earn vencidos) - sum(canjeado) - sum(ya expirado), acotado por el saldo.
create or replace function expire_rewards()
returns int language plpgsql security definer set search_path = public as $$
declare c record; earned_expired bigint; consumed bigint; to_expire bigint; n int := 0;
begin
  for c in select customer_id from customer_rewards where balance_cents > 0 loop
    select coalesce(sum(amount_cents),0) into earned_expired
    from reward_transactions
    where customer_id = c.customer_id and type = 'earn' and expires_at <= now();

    select coalesce(sum(-amount_cents),0) into consumed
    from reward_transactions
    where customer_id = c.customer_id and type in ('redeem','expire');

    to_expire := greatest(0, earned_expired - consumed);

    -- nunca expirar más que el saldo actual
    select least(to_expire, balance_cents) into to_expire
    from customer_rewards where customer_id = c.customer_id;

    if to_expire > 0 then
      update customer_rewards
        set balance_cents = balance_cents - to_expire, updated_at = now()
      where customer_id = c.customer_id;

      insert into reward_transactions (customer_id, type, amount_cents, notes)
      values (c.customer_id, 'expire', -to_expire, 'Vencimiento automático de puntos');
      n := n + 1;
    end if;
  end loop;
  return n;  -- número de clientes afectados
end; $$;

-- Programar diariamente con pg_cron (habilitar extensión en el dashboard):
--   select cron.schedule('expire-rewards-daily', '0 5 * * *', $$select expire_rewards();$$);


-- ====================================================================
-- migrations/0014_rewards_customer_trigger.sql
-- ====================================================================

-- 0014_rewards_customer_trigger.sql
-- Vincula/crea customers + customer_rewards al registrarse en Turkana Rewards.

create or replace function public.handle_new_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare cid uuid;
begin
  if coalesce(new.raw_user_meta_data->>'rewards', '') <> 'true' then
    return new;
  end if;

  select id into cid from customers where email = new.email;
  if cid is not null then
    update customers set
      auth_user_id = new.id,
      full_name = coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), full_name),
      phone = coalesce(nullif(new.raw_user_meta_data->>'phone', ''), phone),
      updated_at = now()
    where id = cid;
  else
    insert into customers (auth_user_id, full_name, email, phone)
    values (
      new.id,
      coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), new.email),
      new.email,
      nullif(new.raw_user_meta_data->>'phone', '')
    )
    returning id into cid;
  end if;

  insert into customer_rewards (customer_id) values (cid)
  on conflict (customer_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_customer on auth.users;
create trigger on_auth_user_created_customer
  after insert on auth.users
  for each row execute function public.handle_new_customer();


-- ====================================================================
-- migrations/0015_shared_sku.sql
-- ====================================================================

-- 0015_shared_sku.sql
-- Las tallas de un producto comparten el mismo SKU/código (no es único por variante).
-- Se quita la restricción de unicidad y se deja un índice normal para búsquedas.

alter table product_variants drop constraint if exists product_variants_sku_key;
create index if not exists idx_product_variants_sku on product_variants (sku);


-- ====================================================================
-- migrations/0016_coupons.sql
-- ====================================================================

-- 0016_coupons.sql
-- Cupones de descuento de Turkana Rewards: sobre el total de compra o sobre un producto.

create table coupons (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null,
  type           text not null check (type in ('order', 'product')),
  discount_kind  text not null default 'percent' check (discount_kind in ('percent', 'amount')),
  discount_value int not null,                 -- porcentaje (1-100) o centavos
  product_id     uuid references products(id), -- solo para cupones de producto
  description    text,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id)
);

alter table coupons enable row level security;

-- Staff gestiona; cualquiera puede leer los cupones activos (para mostrarlos al miembro).
create policy "coupons_staff" on coupons for all using (is_staff()) with check (is_staff());
create policy "coupons_public_read" on coupons for select using (active);


-- ====================================================================
-- migrations/0017_extras_hidden_inventory.sql
-- ====================================================================

-- 0017_extras_hidden_inventory.sql
-- Ocultar en tienda web, productos sin control de inventario, categoría Extras y Bolsa de regalo.

alter table products   add column if not exists hidden_online   boolean not null default false;
alter table products   add column if not exists track_inventory boolean not null default true;
alter table categories add column if not exists hidden_online   boolean not null default false;

-- decrement_stock ignora productos sin control de inventario.
create or replace function decrement_stock(p_variant uuid, p_location_key text,
  p_qty int, p_ref_type text, p_ref_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare loc uuid; avail int; tracks boolean;
begin
  select p.track_inventory into tracks
  from product_variants pv join products p on p.id = pv.product_id
  where pv.id = p_variant;
  if tracks is false then return; end if;

  select id into loc from inventory_locations where key = p_location_key;

  select quantity - reserved into avail
  from stock_levels
  where variant_id = p_variant and location_id = loc
  for update;

  if avail is null or avail < p_qty then
    raise exception 'STOCK_INSUFICIENTE';
  end if;

  update stock_levels set quantity = quantity - p_qty, updated_at = now()
  where variant_id = p_variant and location_id = loc;

  insert into inventory_movements (variant_id, location_id, type, quantity, reference_type, reference_id)
  values (p_variant, loc, 'venta', -p_qty, p_ref_type, p_ref_id);
end; $$;

insert into categories (id, name, slug, hidden_online)
values ('a0e10000-0000-4000-8000-000000000001', 'Extras', 'extras', true)
on conflict (id) do nothing;

insert into products (id, name, slug, sku, status, category_id, hidden_online, track_inventory, short_description)
values ('a0b00000-0000-4000-8000-000000000001', 'Bolsa de regalo', 'bolsa-de-regalo', 'EXTRA-BOLSA', 'active',
        'a0e10000-0000-4000-8000-000000000001', true, false, 'Bolsa de regalo Turkana')
on conflict (id) do nothing;

insert into product_variants (id, product_id, sku, price_cents, is_active)
values ('a0b10000-0000-4000-8000-000000000001', 'a0b00000-0000-4000-8000-000000000001', 'EXTRA-BOLSA', 1500, true)
on conflict (id) do nothing;


-- ====================================================================
-- migrations/0018_shipping_tracking.sql
-- ====================================================================

-- 0018_shipping_tracking.sql
-- Paquetería y número de guía en la tabla de envíos.

alter table shipments add column if not exists carrier         text;
alter table shipments add column if not exists tracking_number text;


-- ====================================================================
-- migrations/0019_people_served.sql
-- ====================================================================

-- 0019_people_served.sql
-- Personas atendidas durante el turno, capturadas al hacer el corte de caja.

alter table cash_sessions add column if not exists people_served int;


-- ====================================================================
-- seed.sql
-- ====================================================================

-- seed.sql
-- Datos iniciales: roles, permisos, almacenes, configuración, caja y Storage.
-- Idempotente: se puede correr varias veces (on conflict do nothing).

-- ── Roles ──────────────────────────────────────────────────────────────────
insert into roles (key, name) values
  ('super_admin','Super Admin'),
  ('admin','Administrador'),
  ('gerente','Gerente'),
  ('cajero','Cajero'),
  ('inventarios','Inventarios'),
  ('atencion','Atención al Cliente')
on conflict (key) do nothing;

-- ── Permisos ───────────────────────────────────────────────────────────────
insert into permissions (key, description) values
  ('ventas.cancelar','Cancelar venta'),
  ('credito.modificar','Modificar crédito'),
  ('inventario.ajustar','Ajustar inventario'),
  ('usuarios.crear','Crear usuarios'),
  ('caja.corte','Realizar corte de caja'),
  ('resguardo.crear','Crear resguardo')
on conflict (key) do nothing;

-- ── Asignación de permisos por rol ─────────────────────────────────────────
-- admin: todos los permisos (super_admin se resuelve por has_permission()).
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r cross join permissions p
where r.key = 'admin'
on conflict do nothing;

-- gerente
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p
  on p.key in ('ventas.cancelar','caja.corte','resguardo.crear','inventario.ajustar','credito.modificar')
where r.key = 'gerente'
on conflict do nothing;

-- cajero
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p
  on p.key in ('caja.corte','resguardo.crear')
where r.key = 'cajero'
on conflict do nothing;

-- inventarios
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p
  on p.key in ('inventario.ajustar')
where r.key = 'inventarios'
on conflict do nothing;

-- ── Almacenes (catálogo compartido, stock independiente) ───────────────────
insert into inventory_locations (key, name, type) values
  ('tienda','Tienda Física','physical'),
  ('ecommerce','E-commerce','online')
on conflict (key) do nothing;

-- ── Configuración global ───────────────────────────────────────────────────
insert into app_settings (key, value, description) values
  ('order_folio_prefix','TK-','Prefijo del folio de orden (6 dígitos)'),
  ('rewards_earn_rate','0.015','Tasa de acumulación de rewards sobre subtotal'),
  ('rewards_max_redeem_cents','100000','Tope de canje de rewards por operación ($1,000)'),
  ('rewards_expiry_months','12','Meses de vigencia de los puntos antes de vencer'),
  ('tax_rate','0.16','IVA que se suma en checkout'),
  ('free_shipping_threshold_cents','199900','Envío gratis desde $1,999'),
  ('shipping_standard_cents','11000','Envío estándar $110 (4-7 días)'),
  ('shipping_express_cents','15900','Envío express $159 (2-4 días)'),
  ('cash_drop_threshold_cents','1000000','Límite de efectivo en caja antes de resguardo ($10,000)'),
  ('admin_alert_email','','Correo de administración para alertas'),
  ('low_stock_threshold','5','Umbral de inventario bajo (piezas)')
on conflict (key) do nothing;

-- ── Caja inicial de la tienda física ───────────────────────────────────────
insert into cash_registers (name, location_id)
select 'Caja Principal', l.id from inventory_locations l where l.key = 'tienda'
on conflict do nothing;

-- ── Storage: buckets ───────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values
  ('product-images','product-images', true),
  ('collections','collections', true),
  ('tickets','tickets', false),
  ('brand','brand', true)
on conflict (id) do nothing;

-- ── Storage: políticas ─────────────────────────────────────────────────────
drop policy if exists "public read product-images" on storage.objects;
create policy "public read product-images" on storage.objects
  for select using (bucket_id in ('product-images','collections','brand'));

drop policy if exists "staff upload product-images" on storage.objects;
create policy "staff upload product-images" on storage.objects
  for insert with check (
    bucket_id in ('product-images','collections','brand')
    and has_permission('inventario.ajustar')
  );

drop policy if exists "staff manage product-images" on storage.objects;
create policy "staff manage product-images" on storage.objects
  for update using (has_permission('inventario.ajustar'));

drop policy if exists "staff delete images" on storage.objects;
create policy "staff delete images" on storage.objects
  for delete using (has_permission('inventario.ajustar'));

-- tickets (PDFs): solo staff lee.
drop policy if exists "staff read tickets" on storage.objects;
create policy "staff read tickets" on storage.objects
  for select using (bucket_id = 'tickets' and is_staff());

