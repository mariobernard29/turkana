-- restaurar_respaldo_20260902.sql
-- Marcha atrás de la carga masiva por Excel del 2026-09-02.
-- Pega y ejecuta en: Supabase → SQL Editor. NO se corre solo: cada bloque es
-- aparte y se ejecuta a mano, el que haga falta.
--
-- El respaldo vive en el esquema `respaldos` (fuera de `public`, así que la API
-- no lo alcanza):
--   respaldos.products_20260902         1 179 filas
--   respaldos.product_variants_20260902 1 192 filas
--   respaldos.stock_levels_20260902     1 192 filas
--
-- Sólo se revierten las columnas que toca la importación. Fotos, precio antes,
-- material, publicación en la web y demás no se tocan: la importación tampoco.
--
-- Por qué los códigos se revierten en DOS pasos: los índices únicos de sku y
-- slug se revisan fila por fila, no al final. Si el respaldo quiere devolver el
-- código A a una pieza y A todavía lo trae otra, la actualización truena a la
-- mitad. El primer paso aparta los códigos que estorban con un valor temporal y
-- el segundo ya pone los buenos.


-- ─────────────────────────────────────────────────────────────────────────────
-- 0) REVISAR (no cambia nada). Corre esto primero para ver qué movió la carga.
-- ─────────────────────────────────────────────────────────────────────────────
select 'productos nuevos'          as que, count(*) from public.products p
  where p.deleted_at is null and not exists (select 1 from respaldos.products_20260902 b where b.id = p.id)
union all
select 'tallas nuevas',             count(*) from public.product_variants v
  where v.deleted_at is null and not exists (select 1 from respaldos.product_variants_20260902 b where b.id = v.id)
union all
select 'tallas con código cambiado', count(*) from public.product_variants v
  join respaldos.product_variants_20260902 b on b.id = v.id where v.sku is distinct from b.sku
union all
select 'tallas con precio cambiado', count(*) from public.product_variants v
  join respaldos.product_variants_20260902 b on b.id = v.id where v.price_cents is distinct from b.price_cents
union all
select 'existencias cambiadas',      count(*) from public.stock_levels s
  join respaldos.stock_levels_20260902 b on b.id = s.id where s.quantity is distinct from b.quantity
union all
select 'productos que perdieron categoría', count(*) from public.products p
  join respaldos.products_20260902 b on b.id = p.id where b.category_id is not null and p.category_id is null
union all
select 'productos que perdieron descripción', count(*) from public.products p
  join respaldos.products_20260902 b on b.id = p.id
  where b.short_description is not null and p.short_description is null;

-- El detalle, pieza por pieza (cambia el límite si quieres verlo todo):
select p.name, b.sku as codigo_antes, v.sku as codigo_ahora,
       b.price_cents/100.0 as precio_antes, v.price_cents/100.0 as precio_ahora
from public.product_variants v
join respaldos.product_variants_20260902 b on b.id = v.id
join public.products p on p.id = v.product_id
where v.sku is distinct from b.sku or v.price_cents is distinct from b.price_cents
order by p.name
limit 200;


-- ─────────────────────────────────────────────────────────────────────────────
-- 1) REVERTIR EL CATÁLOGO: códigos, precios, nombres, textos, categoría, SEO.
--    No toca inventarios (eso es el bloque 2) ni borra lo nuevo (bloque 3).
-- ─────────────────────────────────────────────────────────────────────────────
begin;

-- Paso 1: apartar códigos y ligas que estorban (incluye los de las piezas
-- nuevas, que no están en el respaldo y pueden estar ocupando un código viejo).
update public.products p set sku = 'TMP-' || p.id::text
where p.sku is distinct from (select b.sku from respaldos.products_20260902 b where b.id = p.id);

update public.products p set slug = 'tmp-' || p.id::text
where p.slug is distinct from (select b.slug from respaldos.products_20260902 b where b.id = p.id);

update public.product_variants v set sku = 'TMP-' || v.id::text
where v.deleted_at is null
  and v.sku is distinct from (select b.sku from respaldos.product_variants_20260902 b where b.id = v.id);

-- Paso 2: devolver los valores del respaldo.
update public.products p set
  name              = b.name,
  slug              = b.slug,
  sku               = b.sku,
  short_description = b.short_description,
  long_description  = b.long_description,
  category_id       = b.category_id,
  tags              = b.tags,
  seo_title         = b.seo_title,
  seo_description   = b.seo_description
from respaldos.products_20260902 b
where b.id = p.id;

update public.product_variants v set
  sku         = b.sku,
  price_cents = b.price_cents,
  attributes  = b.attributes,
  position    = b.position
from respaldos.product_variants_20260902 b
where b.id = v.id;

-- Revisa el resultado ANTES de confirmar. Debe dar 0 en las dos columnas.
select
  (select count(*) from public.product_variants v join respaldos.product_variants_20260902 b on b.id=v.id
     where v.sku is distinct from b.sku) as tallas_sin_revertir,
  (select count(*) from public.products p where p.sku like 'TMP-%' or p.slug like 'tmp-%') as temporales_pendientes;

commit;   -- o: rollback;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2) REVERTIR INVENTARIOS.
--    ⚠️ CUIDADO: esto devuelve las existencias al momento del respaldo, así que
--    también borra las ventas del POS hechas después. Córrelo sólo si la carga
--    dejó el inventario mal Y no se ha vendido nada desde entonces, o fuera de
--    horario. Si ya hubo ventas, mejor corrige a mano las piezas afectadas.
-- ─────────────────────────────────────────────────────────────────────────────
begin;

update public.stock_levels s
set quantity = b.quantity, updated_at = now()
from respaldos.stock_levels_20260902 b
where b.id = s.id and s.quantity is distinct from b.quantity;

-- Las existencias de tallas nuevas (que no existían en el respaldo) se dejan en
-- cero en vez de borrarlas, para no romper la fila del almacén.
update public.stock_levels s
set quantity = 0, updated_at = now()
where not exists (select 1 from respaldos.stock_levels_20260902 b where b.id = s.id);

commit;   -- o: rollback;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3) QUITAR LO QUE CREÓ LA IMPORTACIÓN (opcional).
--    Archiva —no borra de verdad— los productos y tallas que no existían antes,
--    igual que el botón de eliminar del admin. Se les vacía el código para que
--    quede libre y lo puedas reusar: el índice único de products.sku no
--    distingue archivados, y si no se vacía ese código queda ocupado para
--    siempre.
-- ─────────────────────────────────────────────────────────────────────────────
begin;

update public.product_variants v
set is_active = false, deleted_at = now()
where v.deleted_at is null
  and not exists (select 1 from respaldos.product_variants_20260902 b where b.id = v.id);

update public.products p
set status = 'archived', deleted_at = now(), sku = null, slug = 'archivado-' || p.id::text
where p.deleted_at is null
  and not exists (select 1 from respaldos.products_20260902 b where b.id = p.id);

commit;   -- o: rollback;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4) LIMPIAR el respaldo cuando ya no lo necesites (semanas después, no hoy).
-- ─────────────────────────────────────────────────────────────────────────────
-- drop table respaldos.products_20260902;
-- drop table respaldos.product_variants_20260902;
-- drop table respaldos.stock_levels_20260902;
