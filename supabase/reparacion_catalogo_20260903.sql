-- reparacion_catalogo_20260903.sql
-- Arregla dos daños heredados de la importación del 18 de agosto, en la que
-- varias celdas llegaron como objetos de JavaScript convertidos a texto.
--
-- 1) ARETES RECTANGULARES MINI TURMALINA tenía por código la fecha
--    "SUN FEB 01 2026 17:00:00 GMT-0700 (...)": Excel leyó la celda como fecha.
--    Con ese código la pieza no se podía escanear en el mostrador. Pasa a AR544
--    (el mayor de la serie AR era 543).
--
-- 2) Nueve piezas distintas quedaron pegadas como "tallas" de un mismo producto:
--    sus nueve filas traían el slug corrupto "[object Object]", y el importador
--    agrupa por slug. La primera fila era C266, así que su nombre —COLLAR 2
--    GOTAS DORADO— es el único que sobrevivió; los otros ocho se perdieron y no
--    están en ninguna parte del sistema (ni en bitácora, ni en ventas, ni en el
--    respaldo del 2 de septiembre).
--
--    C266 se queda en el producto original, ya limpio. Las otras ocho salen cada
--    una a su propio producto con un nombre provisional que dice justo lo que se
--    sabe de ellas: su código. Así el mostrador cobra el precio correcto y no
--    enseña un nombre que no les corresponde.
--
--    Los productos nuevos llevan sku nulo a propósito: el código de A-01 ya lo
--    ocupa ANILLO CORAZON TURMALINA a nivel producto, y el código que de verdad
--    importa —el que se escanea— vive en la talla, no aquí.
--
-- Va como una sola sentencia: o entra todo o no entra nada.

with
fix_producto_turmalina as (
  update public.products set sku = 'AR544'
  where id = '15225fab-a83f-4de7-9cd4-450f400cc41c'
  returning id
),
fix_talla_turmalina as (
  update public.product_variants set sku = 'AR544'
  where id = '3fa17712-6eda-4a46-8454-730bd68bf8b3'
  returning id
),
-- El producto que conserva C266: se le quita la basura y se le da una liga real.
fix_collar as (
  update public.products
  set slug = 'collar-2-gotas-dorado-c266',
      short_description = null,
      tags = '{}'
  where id = 'fc59c7d5-4e50-4a86-9ff2-4588c5b65bdd'
  returning id
),
nuevas (variant_id, codigo, nombre, slug) as (
  values
    ('750c27c8-0b78-4890-9ede-4d9e4e3a2782'::uuid, 'A333',  'PIEZA A333 - POR IDENTIFICAR',  'pieza-a333-por-identificar'),
    ('71b818b4-c0f2-4217-9e85-d75960a78275'::uuid, 'A336',  'PIEZA A336 - POR IDENTIFICAR',  'pieza-a336-por-identificar'),
    ('5f0a7bcf-503c-46ae-b6a2-5d3163d69a97'::uuid, 'A-64',  'PIEZA A-64 - POR IDENTIFICAR',  'pieza-a-64-por-identificar'),
    ('7ca49a46-5bfc-4cd8-b204-5207ed36ef92'::uuid, 'A-01',  'PIEZA A-01 - POR IDENTIFICAR',  'pieza-a-01-por-identificar'),
    ('899d9a61-d6fd-4c25-b69c-2bd61c14b693'::uuid, 'AR267', 'PIEZA AR267 - POR IDENTIFICAR', 'pieza-ar267-por-identificar'),
    ('9d5e852e-d6c1-437c-8baf-313fec9e18f9'::uuid, 'AR297', 'PIEZA AR297 - POR IDENTIFICAR', 'pieza-ar297-por-identificar'),
    ('68056cd7-5f11-4369-82f3-57ebb66aead9'::uuid, 'AR430', 'PIEZA AR430 - POR IDENTIFICAR', 'pieza-ar430-por-identificar'),
    ('da894248-0d40-4644-a05f-01571449c8e4'::uuid, 'AR28',  'PIEZA AR28 - POR IDENTIFICAR',  'pieza-ar28-por-identificar')
),
-- Activos (se cobran ya en el mostrador) y ocultos en la web, igual que los que
-- da de alta el importador. Sin categoría: no se sabe qué son todavía.
creados as (
  insert into public.products (name, slug, sku, status, hidden_online, track_inventory, is_featured)
  select nombre, slug, null, 'active', true, true, false from nuevas
  returning id, slug
),
mudadas as (
  update public.product_variants v
  set product_id = c.id, position = 0
  from creados c
  join nuevas n on n.slug = c.slug
  where v.id = n.variant_id
  returning v.id
)
select (select count(*) from creados)  as productos_creados,
       (select count(*) from mudadas)  as tallas_mudadas,
       (select count(*) from fix_talla_turmalina) as codigo_corrupto_arreglado,
       (select count(*) from fix_collar) as collar_limpiado;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3) La misma importación del 18 de agosto dejó "[object Object]" como texto en
--    54 productos más: descripción corta, descripción larga, etiquetas y los dos
--    campos de SEO. Los nombres y los códigos de esos productos están bien; sólo
--    el texto descriptivo es basura.
--
--    Se comprobó antes de tocar nada que el campo trae EXACTAMENTE esa cadena y
--    nada más —ningún caso mezcla texto real con la basura—, así que vaciarlo no
--    pierde información. En las etiquetas se quita sólo ese elemento, por si
--    alguna trajera además una etiqueta buena.
-- ─────────────────────────────────────────────────────────────────────────────
update public.products
set short_description = nullif(short_description, '[object Object]'),
    long_description  = nullif(long_description,  '[object Object]'),
    seo_title         = nullif(seo_title,         '[object Object]'),
    seo_description   = nullif(seo_description,   '[object Object]'),
    tags              = array_remove(tags, '[object Object]')
where deleted_at is null
  and (short_description = '[object Object]'
    or long_description  = '[object Object]'
    or seo_title         = '[object Object]'
    or seo_description   = '[object Object]'
    or '[object Object]' = any(tags));
