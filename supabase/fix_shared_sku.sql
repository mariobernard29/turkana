-- fix_shared_sku.sql
-- Permite que las tallas de un producto compartan el mismo SKU.
-- Pega y ejecuta en: Supabase → SQL Editor.

alter table product_variants drop constraint if exists product_variants_sku_key;
create index if not exists idx_product_variants_sku on product_variants (sku);
