-- fix_coupons.sql — crea la tabla de cupones de Turkana Rewards.
-- Pega y ejecuta en: Supabase → SQL Editor.

create table if not exists coupons (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null,
  type           text not null check (type in ('order', 'product')),
  discount_kind  text not null default 'percent' check (discount_kind in ('percent', 'amount')),
  discount_value int not null,
  product_id     uuid references products(id),
  description    text,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id)
);

alter table coupons enable row level security;

drop policy if exists "coupons_staff" on coupons;
create policy "coupons_staff" on coupons for all using (is_staff()) with check (is_staff());

drop policy if exists "coupons_public_read" on coupons;
create policy "coupons_public_read" on coupons for select using (active);
