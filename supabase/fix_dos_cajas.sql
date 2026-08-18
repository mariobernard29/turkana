-- 0028_dos_cajas.sql
-- Dos cajas cobrando al mismo tiempo: la PC del mostrador y un iPad.
--
-- La migración 0023 puso un candado global —a lo más UN turno abierto en toda la
-- tienda— porque el turno era por cajero y el corte de uno no veía el dinero del
-- otro. Ese candado resolvió aquello pero impide lo que ahora hace falta: dos
-- cajones, dos fondos y dos cortes independientes. La regla correcta no es "un
-- turno en la tienda" sino "un turno POR CAJA", y eso es lo que se cambia aquí.
--
-- Pega y ejecuta en: Supabase → SQL Editor. Idempotente: se puede correr varias veces.

-- ── 1) Cajas: nombre único y bandera de activa ──────────────────────────────
-- El alta de cajas pasa a hacerse desde el admin, así que el nombre tiene que
-- ser único (si no, "Caja iPad" duplicada y nadie sabe cuál es cuál). Antes de
-- crear el índice se borran duplicados que nunca se usaron.
alter table cash_registers add column if not exists is_active boolean not null default true;

delete from cash_registers r
 where not exists (select 1 from cash_sessions s where s.register_id = r.id)
   and exists (
     select 1 from cash_registers otra
      where otra.name = r.name and otra.id <> r.id and otra.created_at < r.created_at
   );

create unique index if not exists cash_registers_name_key on cash_registers (name);

-- ── 2) El candado pasa de la tienda a la caja ───────────────────────────────
drop index if exists cash_sessions_one_open;

create unique index if not exists cash_sessions_one_open_per_register
  on cash_sessions (register_id) where status = 'open';

-- ── 3) La segunda caja ──────────────────────────────────────────────────────
insert into cash_registers (name, location_id)
select 'Caja iPad', l.id
  from inventory_locations l
 where l.key = 'tienda'
   and not exists (select 1 from cash_registers r where r.name = 'Caja iPad');

-- ── 4) Gastos e ingresos de caja: el CHECK los estaba tirando ───────────────
-- registerCashEntry inserta cash_movements con reference_type = 'manual', que no
-- estaba en la lista permitida por 0021. El insert fallaba sin que nadie lo
-- revisara: el gasto quedaba en la tabla `expenses` pero jamás llegaba al corte,
-- así que el efectivo esperado salía más alto que el contado.
alter table cash_movements drop constraint if exists cash_movements_reference_type_check;
alter table cash_movements add constraint cash_movements_reference_type_check
  check (reference_type is null or reference_type in ('order','layaway','credit','other','manual'));

-- ── 5) Índice que faltaba ───────────────────────────────────────────────────
-- Todos los reportes de corte filtran orders por cash_session_id y no había
-- índice. Con dos cajas se consulta el doble.
create index if not exists orders_cash_session_idx on orders (cash_session_id);
