-- fix_payment_methods.sql — Separar la "Tarjeta" presencial (POS) en Débito / Crédito / American Express.
-- Pega y ejecuta en: Supabase → SQL Editor. No modifica datos existentes.
--   claves nuevas: 'debit' (Débito), 'credit_card' (Crédito), 'amex' (American Express).
--   se conservan 'card' (histórico presencial) y 'stripe' (en línea).
--   OJO: 'credit' ya existe y significa CRÉDITO DE CUENTA/FIADO (no es tarjeta).

-- 1) Quitar los CHECK actuales de method (nombre por defecto <tabla>_method_check; se detecta por seguridad)
do $$
declare t text; c text;
begin
  foreach t in array array['payments','cash_movements','layaway_payments'] loop
    select conname into c
      from pg_constraint
     where conrelid = t::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%method%'
     limit 1;
    if c is not null then execute format('alter table %I drop constraint %I', t, c); end if;
  end loop;
end $$;

-- 2) Recrear los CHECK con las claves nuevas
alter table payments add constraint payments_method_check
  check (method in ('cash','card','debit','credit_card','amex','transfer','stripe','oxxo','rewards','credit','layaway'));

alter table cash_movements add constraint cash_movements_method_check
  check (method in ('cash','card','debit','credit_card','amex','transfer'));

alter table layaway_payments add constraint layaway_payments_method_check
  check (method in ('cash','card','debit','credit_card','amex','transfer'));

-- 3) Corte de caja: contado por tipo de tarjeta (se conserva counted_card_cents para históricos)
alter table cash_sessions
  add column if not exists counted_debit_cents  bigint,
  add column if not exists counted_credit_cents bigint,
  add column if not exists counted_amex_cents   bigint;
