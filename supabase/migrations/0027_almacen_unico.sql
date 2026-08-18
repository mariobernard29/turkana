-- 0027_almacen_unico.sql
-- Un solo almacén para el mostrador y la tienda en línea.
--
-- Había dos, 'tienda' y 'ecommerce', con existencias separadas: cada pieza que
-- se quería vender en la web había que traspasarla a mano, y mientras tanto se
-- veía agotada en línea aunque estuviera en el mostrador. Con una sola bolsa de
-- existencias eso se acaba: lo que se carga se ve en los dos lados.
--
-- Se conserva 'tienda' como clave —es la que ya usan el POS, los apartados y la
-- importación por Excel— y sólo cambia de nombre. Las existencias del almacén
-- de e-commerce se le suman, no se tiran.

do $$
declare principal_id uuid; ecom_id uuid;
begin
  select id into principal_id from inventory_locations where key = 'tienda';
  select id into ecom_id from inventory_locations where key = 'ecommerce';

  if ecom_id is null then
    -- Ya se corrió antes, o la instalación nunca tuvo almacén de e-commerce.
    null;
  elsif principal_id is null then
    -- Sin almacén principal, el de e-commerce pasa a serlo.
    update inventory_locations
      set key = 'tienda', name = 'Almacén principal', type = 'physical'
      where id = ecom_id;
  else
    -- Las existencias se suman en el principal. Lo reservado también: son piezas
    -- comprometidas en apartados y pedidos que siguen sin poder venderse.
    insert into stock_levels (variant_id, location_id, quantity, reserved, low_stock_threshold)
    select s.variant_id, principal_id, s.quantity, s.reserved, s.low_stock_threshold
    from stock_levels s
    where s.location_id = ecom_id
    on conflict (variant_id, location_id) do update
      set quantity   = stock_levels.quantity + excluded.quantity,
          reserved   = stock_levels.reserved + excluded.reserved,
          updated_at = now();

    -- El histórico de movimientos se conserva, apuntando al almacén que queda:
    -- borrarlo dejaría cortes y reportes viejos sin respaldo.
    update inventory_movements set location_id = principal_id where location_id = ecom_id;

    delete from stock_levels where location_id = ecom_id;
    delete from inventory_locations where id = ecom_id;
  end if;
end $$;

update inventory_locations set name = 'Almacén principal', type = 'physical'
  where key = 'tienda' and name <> 'Almacén principal';
