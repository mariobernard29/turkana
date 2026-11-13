-- 0034_tienda_oculta_por_defecto.sql
-- La tienda en línea se llena a mano: una pieza solo sale a la web cuando
-- alguien la publica desde el admin.
--
-- Antes, una pieza nueva nacía visible (default false). Con mil y pico de
-- artículos cargados por Excel, eso significaba que cualquier alta por formulario
-- se iba a la web sin foto ni descripción.
--
-- Ahora nacen ocultas y se publican una por una desde Productos.

alter table public.products alter column hidden_online set default true;

-- Punto de partida limpio para el lanzamiento: todo oculto.
-- (El 13/11/2026 se ocultaron las 15 piezas que quedaban visibles, ninguna
--  tenía foto.)
update public.products
   set hidden_online = true
 where hidden_online = false
   and deleted_at is null;
