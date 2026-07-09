-- seed_demo.sql
-- Datos de DEMOSTRACIÓN (opcional). Ejecutar DESPUÉS de schema_full.sql.
-- Crea categorías, una colección, productos con variantes y stock en ambos almacenes.

-- ── Categorías ─────────────────────────────────────────────────────────────
insert into categories (name, slug) values
  ('Anillos','anillos'),
  ('Collares','collares'),
  ('Pulseras','pulseras')
on conflict (slug) do nothing;

-- ── Colección ──────────────────────────────────────────────────────────────
insert into collections (name, slug, description, is_active) values
  ('San Valentín','san-valentin','Piezas para regalar amor', true)
on conflict (slug) do nothing;

-- ── Producto 1: Anillo Solitario (variantes por talla/metal) ───────────────
with p as (
  insert into products (name, slug, sku, status, is_featured, material, stone, short_description, long_description, category_id, collection_id)
  values ('Anillo Solitario','anillo-solitario','TKR-SOL','active', true,'Oro 14k','Diamante',
          'Anillo solitario clásico en oro de 14k.',
          'Un solitario atemporal que celebra los momentos importantes. Oro de 14k con diamante de talla brillante.',
          (select id from categories where slug='anillos'),
          (select id from collections where slug='san-valentin'))
  on conflict (slug) do nothing
  returning id
)
insert into product_variants (product_id, sku, attributes, price_cents)
select p.id, v.sku, v.attrs::jsonb, v.price from p cross join (values
  ('TKR-SOL-6-ORO','{"talla":"6","metal":"oro"}', 1899900),
  ('TKR-SOL-7-ORO','{"talla":"7","metal":"oro"}', 1899900),
  ('TKR-SOL-7-ORB','{"talla":"7","metal":"oro blanco"}', 1999900)
) as v(sku, attrs, price)
on conflict (sku) do nothing;

-- ── Producto 2: Collar Cadena Veneciana ────────────────────────────────────
with p as (
  insert into products (name, slug, sku, status, is_featured, material, short_description, long_description, category_id)
  values ('Collar Veneciano','collar-veneciano','TKN-VEN','active', true,'Plata .925',
          'Cadena veneciana en plata .925.',
          'Cadena veneciana ligera y elegante, ideal para el día a día.',
          (select id from categories where slug='collares'))
  on conflict (slug) do nothing
  returning id
)
insert into product_variants (product_id, sku, attributes, price_cents)
select p.id, v.sku, v.attrs::jsonb, v.price from p cross join (values
  ('TKN-VEN-40','{"largo":"40cm"}', 89900),
  ('TKN-VEN-45','{"largo":"45cm"}', 99900)
) as v(sku, attrs, price)
on conflict (sku) do nothing;

-- ── Producto 3: Pulsera Tennis ─────────────────────────────────────────────
with p as (
  insert into products (name, slug, sku, status, material, stone, short_description, category_id)
  values ('Pulsera Tennis','pulsera-tennis','TKB-TEN','active','Oro rosa 14k','Zirconia',
          'Pulsera tennis en oro rosa.',
          (select id from categories where slug='pulseras'))
  on conflict (slug) do nothing
  returning id
)
insert into product_variants (product_id, sku, attributes, price_cents)
select p.id, v.sku, v.attrs::jsonb, v.price from p cross join (values
  ('TKB-TEN-17','{"largo":"17cm","metal":"oro rosa"}', 2499900),
  ('TKB-TEN-18','{"largo":"18cm","metal":"oro rosa"}', 2499900)
) as v(sku, attrs, price)
on conflict (sku) do nothing;

-- ── Stock inicial: 5 piezas de cada variante en cada almacén ───────────────
insert into stock_levels (variant_id, location_id, quantity, low_stock_threshold)
select v.id, l.id, 5, 2
from product_variants v cross join inventory_locations l
on conflict (variant_id, location_id) do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- BOOTSTRAP DE USUARIO ADMIN
-- 1) En Supabase → Authentication → Users → "Add user", crea tu correo+contraseña.
-- 2) Copia su UUID y córrelo aquí para volverte Super Admin:
--
-- insert into profiles (id, role_id, full_name)
-- values ('UUID_DEL_USUARIO', (select id from roles where key='super_admin'), 'Tu Nombre')
-- on conflict (id) do update set role_id = excluded.role_id;
-- ════════════════════════════════════════════════════════════════════════════
