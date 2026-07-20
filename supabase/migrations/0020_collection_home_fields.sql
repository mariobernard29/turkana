-- 0020_collection_home_fields.sql
-- Campos para mostrar una colección destacada en la home (imagen vertical + título/subtítulo),
-- independientes del banner ancho de la página propia de la colección (hero_image_url, ya existente).

alter table collections
  add column if not exists home_title text,
  add column if not exists home_subtitle text,
  add column if not exists home_image_url text;
