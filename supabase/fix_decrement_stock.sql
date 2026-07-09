-- fix_decrement_stock.sql
-- Corrige el error: inventory_movements_type_check al cobrar (POS y e-commerce).
-- La función guardaba p_ref_type ('order') en la columna `type`, que sólo admite
-- entrada/salida/ajuste/traspaso/venta/devolucion. Ahora usa 'venta'.
-- Pega y ejecuta en: Supabase → SQL Editor.

create or replace function decrement_stock(p_variant uuid, p_location_key text,
  p_qty int, p_ref_type text, p_ref_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare loc uuid; avail int;
begin
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
