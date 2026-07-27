-- reset_datos.sql — BORRA TODOS LOS DATOS para arrancar con información real.
-- Pega y ejecuta en: Supabase → SQL Editor.
--
-- ⚠️  ESTO NO SE PUEDE DESHACER. Saca un respaldo antes (Dashboard → Database →
--     Backups, o `pg_dump`). Al terminar no queda ninguna venta, cliente, pieza
--     ni corte de caja.
--
-- SE BORRA: ventas y sus pagos/envíos/servicios/devoluciones · cortes, sesiones y
--   movimientos de caja · resguardos y gastos · clientes, direcciones, Rewards y
--   cupones · crédito (fiado) y apartados con sus abonos · productos, variantes,
--   fotos, categorías y colecciones · inventario y sus movimientos · notificaciones,
--   bitácora, dispositivos y cola de sincronización · las cuentas de acceso de los
--   clientes de Rewards. Los archivos de Storage van aparte (paso 3).
--
-- SE CONSERVA: usuarios del staff (auth + profiles), roles, permisos y su matriz ·
--   ajustes del negocio (app_settings) · almacenes (tienda/ecommerce) · cajas.
--
-- DESPUÉS DE CORRER ESTO hay que:
--   1) Vaciar Storage (no se puede desde SQL, ver paso 3):
--      cd apps/web && node scripts/clear-storage.mjs
--   2) Correr `supabase/fix_extras.sql` para recrear la categoría Extras y el
--      producto "Bolsa de regalo" (el checkout los usa con un UUID fijo).
--   3) Volver a subir las imágenes de la home en Admin → Ajustes → Contenido.
--
-- ── PASO 0: REVISA ESTO ANTES (córrelo solo, en una consulta aparte) ─────────
-- El paso 4 borra las cuentas que NO tienen ficha en `profiles`, porque así se
-- distingue al staff de los clientes. Confirma que todo tu staff aparece como
-- es_staff = true; si alguien se creó directo en el dashboard de Supabase sin
-- perfil, saldría como false y se borraría.
--
--   select u.email, (p.id is not null) as es_staff, u.created_at
--     from auth.users u
--     left join profiles p on p.id = u.id
--    order by es_staff desc, u.created_at;
--
-- Si algún staff sale en false, dale de alta su perfil (Admin → Ajustes →
-- Usuarios) o quita el paso 4 antes de correr el script.
--
-- Desarmado a propósito: para ejecutarlo, cambia 'NO' por 'SI' en la línea de abajo.

do $$
declare confirmar text := 'NO';
begin
  if confirmar <> 'SI' then
    raise exception 'Borrado cancelado: edita el script y pon confirmar := ''SI'' para continuar.';
  end if;
end $$;

-- ── 1) Datos de la tienda ────────────────────────────────────────────────────
-- Un solo TRUNCATE: se vacían juntas y así no estorba el orden de las llaves.
truncate table
  -- ventas
  order_items, payments, service_sales, shipments, returns, orders,
  -- caja
  cash_movements, cash_drops, expenses, cash_sessions,
  -- clientes y Rewards
  customer_addresses, customer_rewards, reward_transactions, coupons, customers,
  -- crédito y apartados
  credit_transactions, credit_accounts, layaway_payments, layaway_items, layaways,
  -- catálogo
  product_images, product_variants, products, categories, collections,
  -- inventario
  inventory_movements, stock_levels,
  -- operación
  notifications, audit_logs, sync_queue, devices
restart identity cascade;

-- ── 2) Folios desde cero (TK-000001 y AP-000001) ─────────────────────────────
alter sequence if exists order_folio_seq   restart with 1;
alter sequence if exists layaway_folio_seq restart with 1;

-- ── 3) Archivos de Storage: NO se pueden borrar desde SQL ────────────────────
-- Supabase lo bloquea con el trigger storage.protect_delete() ("Direct deletion
-- from storage tables is not allowed"). Se hace con la Storage API:
--   cd apps/web && node scripts/clear-storage.mjs
-- o a mano en Dashboard → Storage, vaciando cada bucket.

-- ── 4) Cuentas de acceso de clientes (NO el staff) ───────────────────────────
-- El staff es el único que tiene ficha en `profiles`; los clientes de Rewards no.
delete from auth.users u
 where not exists (select 1 from profiles p where p.id = u.id);

-- ── 5) Verificación ──────────────────────────────────────────────────────────
select 'ventas'        as tabla, count(*) from orders
union all select 'clientes',        count(*) from customers
union all select 'productos',       count(*) from products
union all select 'categorias',      count(*) from categories
union all select 'colecciones',     count(*) from collections
union all select 'inventario',      count(*) from stock_levels
union all select 'cortes',          count(*) from cash_sessions
union all select 'apartados',       count(*) from layaways
union all select 'creditos',        count(*) from credit_accounts
union all select 'archivos (aparte)', count(*) from storage.objects
union all select '-- staff (debe quedar) --', count(*) from profiles
union all select '-- usuarios auth --',       count(*) from auth.users
union all select '-- ajustes --',             count(*) from app_settings
union all select '-- almacenes --',           count(*) from inventory_locations
union all select '-- cajas --',               count(*) from cash_registers;
