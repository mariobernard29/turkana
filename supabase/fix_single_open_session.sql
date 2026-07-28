-- fix_single_open_session.sql (= migración 0023_single_open_session.sql)
-- Un solo turno de caja abierto a la vez en toda la tienda, sin importar el cajero.
-- Antes el turno era por cajero: si dos personas usaban el POS, cada cobro caía
-- en el turno de quien lo hizo y el corte de uno no veía el dinero del otro.
-- Pega y ejecuta en: Supabase → SQL Editor. Idempotente.

-- 1) Limpieza: se borran los turnos abiertos que nunca se usaron (sin movimientos
--    ni ventas), conservando el más antiguo con actividad. Sin esto el índice de
--    abajo no se puede crear si hay varios abiertos.
delete from cash_sessions s
 where s.status = 'open'
   and not exists (select 1 from cash_movements m where m.session_id = s.id)
   and not exists (select 1 from orders o where o.cash_session_id = s.id)
   and exists (
     select 1 from cash_sessions otro
      where otro.status = 'open' and otro.id <> s.id and otro.opened_at < s.opened_at
   );

-- 2) Si quedó más de un turno CON movimientos, no se puede continuar: hay que
--    cerrar los sobrantes desde el POS para no perder su corte.
do $$
declare abiertos int;
begin
  select count(*) into abiertos from cash_sessions where status = 'open';
  if abiertos > 1 then
    raise exception
      'Hay % turnos abiertos con movimientos. Ciérralos desde el POS (queda sólo uno) y vuelve a correr este script.', abiertos;
  end if;
end $$;

-- 3) La regla, a nivel de base: a lo más una fila con status = 'open'.
--    El índice parcial sobre status hace imposible una segunda fila abierta.
create unique index if not exists cash_sessions_one_open
  on cash_sessions (status) where status = 'open';
