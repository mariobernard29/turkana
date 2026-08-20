-- 0030 · El catálogo en tiempo real
--
-- Hasta ahora el POS sólo se enteraba de un cambio de precio al cobrar o al
-- recargar la página a mano: la caja podía estar cobrando con el precio viejo
-- minutos después de haberlo cambiado en el panel.
--
-- `orders`, `stock_levels`, `cash_sessions`, `notifications` y `print_jobs` ya
-- estaban en la publicación (migraciones 0012 y 0029); aquí se agregan las tablas
-- del catálogo para que el navegador pueda escucharlas.
--
-- Los tres tienen policy de lectura pública (products/variants activos,
-- categorías no borradas), así que el personal recibe los eventos sin tocar RLS.

do $$
begin
  alter publication supabase_realtime add table products;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table product_variants;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table categories;
exception when duplicate_object then null;
end $$;
