-- 0033_asistencia_pago.sql
-- Día de pago de cada persona, para saber cuánto hay que pagar en cada periodo.
--
-- pay_frequency:
--   'weekly'   → semanal: cobra cada `pay_weekday` (0 = domingo … 6 = sábado) por
--                los 7 días que terminan el día anterior (paga lunes = lun…dom previos).
--   'biweekly' → quincenal: periodos del 1 al 15 (paga el 15) y del 16 a fin de mes
--                (paga el último día).
-- pay_kind / pay_amount_cents (opcionales):
--   'hourly' → tarifa por hora; se paga horas trabajadas × tarifa.
--   'salary' → sueldo fijo por periodo (semana o quincena).
--
-- Pega y ejecuta en: Supabase → SQL Editor. Idempotente.

alter table attendance_employees
  add column if not exists pay_frequency text not null default 'weekly',
  add column if not exists pay_weekday smallint not null default 1,
  add column if not exists pay_kind text,
  add column if not exists pay_amount_cents integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'attendance_employees_pay_frequency_check') then
    alter table attendance_employees
      add constraint attendance_employees_pay_frequency_check check (pay_frequency in ('weekly', 'biweekly')),
      add constraint attendance_employees_pay_weekday_check check (pay_weekday between 0 and 6),
      add constraint attendance_employees_pay_kind_check check (pay_kind is null or pay_kind in ('hourly', 'salary')),
      add constraint attendance_employees_pay_amount_check check (pay_amount_cents is null or pay_amount_cents >= 0);
  end if;
end $$;
