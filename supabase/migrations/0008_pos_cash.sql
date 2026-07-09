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
