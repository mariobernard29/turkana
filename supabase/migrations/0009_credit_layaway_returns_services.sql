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
