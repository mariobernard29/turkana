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
