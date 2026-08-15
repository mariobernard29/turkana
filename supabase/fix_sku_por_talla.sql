-- 0025_sku_por_talla.sql
-- Da marcha atrás a 0015: las tallas ya no comparten el código del producto, cada
-- una lleva el suyo. El código vuelve a ser la identidad de la talla, que es lo
-- que permite buscarla en el POS y emparejarla al reimportar el Excel.
--
-- El índice es parcial: al borrar una talla se le pone deleted_at, y su código
-- debe poder reusarse en otra pieza.

-- Aborta con un mensaje claro si hay códigos repetidos en vivo, en vez de dejar
-- que falle la creación del índice sin decir cuáles son.
do $$
declare dup text;
begin
  select string_agg(sku, ', ') into dup
  from (
    select sku from product_variants
    where deleted_at is null
    group by sku having count(*) > 1
    limit 20
  ) d;
  if dup is not null then
    raise exception 'Hay tallas con el mismo código: %. Dales un código distinto antes de correr esta migración.', dup;
  end if;
end $$;

drop index if exists idx_product_variants_sku;

create unique index if not exists product_variants_sku_key
  on product_variants (sku) where deleted_at is null;
