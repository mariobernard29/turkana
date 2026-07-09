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
