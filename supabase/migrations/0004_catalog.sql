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
