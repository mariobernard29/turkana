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
