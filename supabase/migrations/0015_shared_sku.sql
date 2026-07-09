-- 0015_shared_sku.sql
-- Las tallas de un producto comparten el mismo SKU/código (no es único por variante).
-- Se quita la restricción de unicidad y se deja un índice normal para búsquedas.

alter table product_variants drop constraint if exists product_variants_sku_key;
create index if not exists idx_product_variants_sku on product_variants (sku);
