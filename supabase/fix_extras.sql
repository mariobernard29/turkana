-- fix_extras.sql — Ocultar en tienda web, productos sin inventario, categoría Extras y Bolsa de regalo.
-- Pega y ejecuta en: Supabase → SQL Editor.

-- 1) Columnas nuevas
alter table products   add column if not exists hidden_online   boolean not null default false;
alter table products   add column if not exists track_inventory boolean not null default true;
alter table categories add column if not exists hidden_online   boolean not null default false;

-- 2) decrement_stock ignora productos sin control de inventario (bolsas, kits)
create or replace function decrement_stock(p_variant uuid, p_location_key text,
  p_qty int, p_ref_type text, p_ref_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare loc uuid; avail int; tracks boolean;
begin
  select p.track_inventory into tracks
  from product_variants pv join products p on p.id = pv.product_id
  where pv.id = p_variant;
  if tracks is false then return; end if;  -- sin inventario: no descontar

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

-- 3) Categoría Extras (oculta en tienda online)
insert into categories (id, name, slug, hidden_online)
values ('a0e10000-0000-4000-8000-000000000001', 'Extras', 'extras', true)
on conflict (id) do nothing;

-- 4) Bolsa de regalo: producto sin inventario, oculto online (se agrega solo por la casilla del checkout)
insert into products (id, name, slug, sku, status, category_id, hidden_online, track_inventory, short_description)
values ('a0b00000-0000-4000-8000-000000000001', 'Bolsa de regalo', 'bolsa-de-regalo', 'EXTRA-BOLSA', 'active',
        'a0e10000-0000-4000-8000-000000000001', true, false, 'Bolsa de regalo Turkana')
on conflict (id) do nothing;

insert into product_variants (id, product_id, sku, price_cents, is_active)
values ('a0b10000-0000-4000-8000-000000000001', 'a0b00000-0000-4000-8000-000000000001', 'EXTRA-BOLSA', 1500, true)
on conflict (id) do nothing;
