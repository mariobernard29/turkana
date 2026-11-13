-- 0035_catalogo_publico_solo_publicado.sql
-- APLICADA el 13/11/2026.
--
-- El catálogo público sólo debe dejar ver lo que está publicado en la tienda.
--
-- Hasta ahora "oculto en tienda" sólo escondía la pieza en las páginas: la API
-- pública (con la llave anon, que viaja en el navegador de cualquiera que abra
-- la tienda) seguía devolviendo las 1,144 piezas con nombre, SKU y precio.
-- Cualquiera que supiera pedirlo podía bajarse el catálogo completo:
--
--   GET https://<ref>.supabase.co/rest/v1/products?select=name,sku&apikey=<anon>
--
-- Ahora el filtro vive en la base: sin sesión de personal sólo se ven las piezas
-- activas y publicadas. Comprobado después de aplicarla: esa llamada devuelve 0
-- filas en products, product_variants y product_images.
--
-- El admin y el POS leen con la llave de servicio (service_role), que se salta
-- RLS, así que no cambian — siguen viendo las 1,431 piezas. El personal con
-- sesión sigue viendo todo por is_staff().
--
-- Se usa ALTER POLICY (no DROP + CREATE) para cambiar la regla en su lugar: si
-- algo falla a media migración, la tabla nunca se queda un instante sin política
-- de lectura.

alter policy products_public_read on public.products
  using (
    (status = 'active' and deleted_at is null and hidden_online = false)
    or is_staff()
  );

alter policy variants_public_read on public.product_variants
  using (
    (
      is_active and deleted_at is null
      and exists (
        select 1 from public.products p
         where p.id = product_variants.product_id
           and p.status = 'active' and p.deleted_at is null and p.hidden_online = false
      )
    )
    or is_staff()
  );

alter policy images_public_read on public.product_images
  using (
    exists (
      select 1 from public.products p
       where p.id = product_images.product_id
         and p.status = 'active' and p.deleted_at is null and p.hidden_online = false
    )
    or is_staff()
  );
