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
