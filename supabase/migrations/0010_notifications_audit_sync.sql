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
