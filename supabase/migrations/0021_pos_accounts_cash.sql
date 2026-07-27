-- 0021_pos_accounts_cash.sql
-- Fiado (crédito de cuenta) y apartados nacidos del carrito del POS, con abonos
-- trazables por turno para que el corte de caja cuadre por método de pago.
-- Pega y ejecuta en: Supabase → SQL Editor. Idempotente: se puede correr varias veces.
--
-- OJO: el SQL Editor corre todo en una sola transacción; si un statement falla no se
-- aplica nada. Por eso todo va con IF NOT EXISTS / DROP ... IF EXISTS y sin índices
-- únicos nuevos sobre datos existentes.

-- ── 1) cash_movements: métodos nuevos y tipo de referencia ──────────────────
-- 'credit' = fiado (venta sin dinero), 'layaway' = apartado.
-- reference_type dice a qué apunta reference_id (antes era imposible saberlo).
alter table cash_movements add column if not exists reference_type text;

do $$
declare c text;
begin
  select conname into c
    from pg_constraint
   where conrelid = 'cash_movements'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%method%'
   limit 1;
  if c is not null then execute format('alter table cash_movements drop constraint %I', c); end if;
end $$;

alter table cash_movements add constraint cash_movements_method_check
  check (method is null or method in
    ('cash','card','debit','credit_card','amex','transfer','credit','layaway'));

alter table cash_movements drop constraint if exists cash_movements_reference_type_check;
alter table cash_movements add constraint cash_movements_reference_type_check
  check (reference_type is null or reference_type in ('order','layaway','credit','other'));

create index if not exists cash_movements_session_type_idx on cash_movements (session_id, type);

-- Backfill: se deduce el tipo de referencia de los movimientos históricos para que
-- los cortes viejos se recalculen bien con la nueva función de totales.
update cash_movements m set reference_type = 'layaway'
 where m.reference_type is null and m.type = 'in'
   and exists (select 1 from layaways l where l.id = m.reference_id);

update cash_movements m set reference_type = 'credit'
 where m.reference_type is null and m.type = 'in'
   and exists (select 1 from credit_accounts a where a.id = m.reference_id);

update cash_movements m set reference_type = 'order'
 where m.reference_type is null and m.type = 'sale' and m.reference_id is not null;

-- ── 2) Abonos ligados al turno de caja ──────────────────────────────────────
alter table layaway_payments    add column if not exists cash_session_id uuid references cash_sessions(id);
alter table credit_transactions add column if not exists cash_session_id uuid references cash_sessions(id);
alter table credit_transactions add column if not exists method          text;
alter table credit_transactions add column if not exists notes           text;

alter table credit_transactions drop constraint if exists credit_transactions_method_check;
alter table credit_transactions add constraint credit_transactions_method_check
  check (method is null or method in ('cash','card','debit','credit_card','amex','transfer'));

create index if not exists credit_transactions_account_idx on credit_transactions (account_id, created_at desc);
create index if not exists credit_accounts_customer_idx    on credit_accounts (customer_id);
create index if not exists layaway_payments_layaway_idx    on layaway_payments (layaway_id);

-- ── 3) Apartados con varias piezas ──────────────────────────────────────────
-- layaways.variant_id SE CONSERVA (apartados viejos y compatibilidad de queries).
create table if not exists layaway_items (
  id               uuid primary key default gen_random_uuid(),
  layaway_id       uuid not null references layaways(id) on delete cascade,
  variant_id       uuid references product_variants(id),
  sku              text not null,
  name             text not null,
  unit_price_cents bigint not null,
  quantity         int    not null default 1,
  total_cents      bigint not null,
  created_at       timestamptz not null default now()
);
create index if not exists layaway_items_layaway_idx on layaway_items (layaway_id);

alter table layaway_items enable row level security;
drop policy if exists "layaway_items_staff" on layaway_items;
create policy "layaway_items_staff" on layaway_items
  for all using (is_staff()) with check (is_staff());

-- Backfill: una partida por apartado viejo, así el código siempre lee items.
insert into layaway_items (layaway_id, variant_id, sku, name, unit_price_cents, quantity, total_cents)
select l.id, l.variant_id,
       coalesce(v.sku, 'APARTADO'),
       coalesce(p.name, v.sku, 'Apartado'),
       l.total_cents, 1, l.total_cents
  from layaways l
  left join product_variants v on v.id = l.variant_id
  left join products p         on p.id = v.product_id
 where not exists (select 1 from layaway_items li where li.layaway_id = l.id);

-- ── 4) Reserva de inventario para apartados (atómica) ───────────────────────
-- Antes se hacía con un update a mano de stock_levels.reserved, siempre ±1 y sin
-- bloqueo: podía dejar disponible negativo.
create or replace function reserve_stock(p_variant uuid, p_location_key text, p_qty int)
returns void language plpgsql security definer set search_path = public as $$
declare loc uuid; avail int;
begin
  if p_qty <= 0 then raise exception 'CANTIDAD_INVALIDA'; end if;

  select id into loc from inventory_locations where key = p_location_key;
  if loc is null then raise exception 'ALMACEN_NO_CONFIGURADO'; end if;

  select quantity - reserved into avail
    from stock_levels
   where variant_id = p_variant and location_id = loc
   for update;

  if avail is null then
    insert into stock_levels (variant_id, location_id, quantity, reserved)
    values (p_variant, loc, 0, 0);
    avail := 0;
  end if;

  if avail < p_qty then raise exception 'STOCK_INSUFICIENTE'; end if;

  update stock_levels set reserved = reserved + p_qty, updated_at = now()
   where variant_id = p_variant and location_id = loc;
end; $$;

create or replace function release_reserved(p_variant uuid, p_location_key text, p_qty int)
returns void language plpgsql security definer set search_path = public as $$
declare loc uuid;
begin
  select id into loc from inventory_locations where key = p_location_key;
  if loc is null then return; end if;

  update stock_levels set reserved = greatest(0, reserved - p_qty), updated_at = now()
   where variant_id = p_variant and location_id = loc;
end; $$;

-- ── 5) Crédito de cuenta (fiado), atómico ───────────────────────────────────
-- charge_credit: cargo de una venta a crédito. p_force permite pasar el límite
-- cuando un supervisor lo autoriza (queda en audit_logs desde la app).
create or replace function charge_credit(
  p_account uuid, p_order uuid, p_amount bigint, p_due date,
  p_session uuid, p_by uuid, p_force boolean default false, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare lim bigint; bal bigint; st text; tx uuid;
begin
  if p_amount <= 0 then raise exception 'IMPORTE_INVALIDO'; end if;

  select limit_cents, balance_cents, status into lim, bal, st
    from credit_accounts where id = p_account for update;
  if lim is null then raise exception 'CUENTA_NO_ENCONTRADA'; end if;
  if st <> 'active' then raise exception 'CUENTA_SUSPENDIDA'; end if;
  if bal + p_amount > lim and not p_force then raise exception 'LIMITE_EXCEDIDO'; end if;

  insert into credit_transactions
    (account_id, order_id, type, amount_cents, due_date, status, cash_session_id, created_by, notes)
  values (p_account, p_order, 'charge', p_amount, p_due, 'vigente', p_session, p_by, p_notes)
  returning id into tx;

  update credit_accounts set balance_cents = bal + p_amount where id = p_account;
  return tx;
end; $$;

-- Rollback del cargo si la venta se cae después (p.ej. falla el descuento de stock).
create or replace function reverse_credit_charge(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id, account_id, amount_cents from credit_transactions
            where order_id = p_order and type = 'charge' loop
    update credit_accounts set balance_cents = greatest(0, balance_cents - r.amount_cents)
     where id = r.account_id;
    delete from credit_transactions where id = r.id;
  end loop;
end; $$;

-- pay_credit / pay_layaway devuelven lo APLICADO (topado al saldo pendiente), así
-- la app nunca registra en caja más de lo que realmente abonó.
create or replace function pay_credit(
  p_account uuid, p_amount bigint, p_method text, p_session uuid, p_by uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare bal bigint; applied bigint;
begin
  select balance_cents into bal from credit_accounts where id = p_account for update;
  if bal is null then raise exception 'CUENTA_NO_ENCONTRADA'; end if;

  applied := least(greatest(p_amount, 0), bal);
  if applied <= 0 then raise exception 'SIN_SALDO'; end if;

  insert into credit_transactions
    (account_id, type, amount_cents, status, method, cash_session_id, created_by)
  values (p_account, 'payment', applied, 'pagado', p_method, p_session, p_by);

  update credit_accounts set balance_cents = bal - applied where id = p_account;

  -- Cuenta liquidada: los cargos vigentes pasan a pagados.
  if bal - applied = 0 then
    update credit_transactions set status = 'pagado'
     where account_id = p_account and type = 'charge' and coalesce(status, '') <> 'pagado';
  end if;

  return applied;
end; $$;

create or replace function pay_layaway(
  p_layaway uuid, p_amount bigint, p_method text, p_session uuid, p_by uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare tot bigint; paid bigint; st text; applied bigint;
begin
  select total_cents, paid_cents, status into tot, paid, st
    from layaways where id = p_layaway for update;
  if tot is null then raise exception 'APARTADO_NO_ENCONTRADO'; end if;
  if st <> 'active' then raise exception 'APARTADO_NO_ACTIVO'; end if;

  applied := least(greatest(p_amount, 0), tot - paid);
  if applied <= 0 then raise exception 'APARTADO_LIQUIDADO'; end if;

  insert into layaway_payments (layaway_id, amount_cents, method, cash_session_id, created_by)
  values (p_layaway, applied, p_method, p_session, p_by);

  update layaways set paid_cents = paid + applied where id = p_layaway;
  return applied;
end; $$;

-- ── 6) Ajustes: límite de crédito por defecto ($5,000) ──────────────────────
insert into app_settings (key, value, description) values
  ('credit_default_limit_cents','500000','Límite de crédito (fiado) por defecto, en centavos')
on conflict (key) do nothing;
