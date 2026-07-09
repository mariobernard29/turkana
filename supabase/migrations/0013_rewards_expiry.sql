-- 0013_rewards_expiry.sql
-- Caducidad de Turkana Rewards: los puntos vencen al año de ganados (configurable).

-- Fecha de vencimiento por transacción de acumulación (visible para el cliente).
alter table reward_transactions add column if not exists expires_at timestamptz;

-- credit_rewards ahora fija expires_at = now + rewards_expiry_months.
create or replace function credit_rewards(p_customer uuid, p_order uuid,
  p_subtotal_cents bigint, p_channel text)
returns void language plpgsql security definer set search_path = public as $$
declare rate numeric; months int; pts bigint;
begin
  select coalesce(value::numeric, 0.015) into rate
  from app_settings where key = 'rewards_earn_rate';
  select coalesce(value::int, 12) into months
  from app_settings where key = 'rewards_expiry_months';
  pts := floor(p_subtotal_cents * rate);

  insert into customer_rewards (customer_id, balance_cents, lifetime_earned_cents)
  values (p_customer, pts, pts)
  on conflict (customer_id) do update
    set balance_cents = customer_rewards.balance_cents + pts,
        lifetime_earned_cents = customer_rewards.lifetime_earned_cents + pts,
        updated_at = now();

  insert into reward_transactions (customer_id, type, amount_cents, order_id, channel, expires_at)
  values (p_customer, 'earn', pts, p_order, p_channel, now() + make_interval(months => months));

  update orders set rewards_earned_cents = pts where id = p_order;
end; $$;

-- Job de expiración (FIFO): el consumo (canjes/expiraciones) golpea primero los
-- puntos más antiguos, así que lo vencido-no-consumido =
--   sum(earn vencidos) - sum(canjeado) - sum(ya expirado), acotado por el saldo.
create or replace function expire_rewards()
returns int language plpgsql security definer set search_path = public as $$
declare c record; earned_expired bigint; consumed bigint; to_expire bigint; n int := 0;
begin
  for c in select customer_id from customer_rewards where balance_cents > 0 loop
    select coalesce(sum(amount_cents),0) into earned_expired
    from reward_transactions
    where customer_id = c.customer_id and type = 'earn' and expires_at <= now();

    select coalesce(sum(-amount_cents),0) into consumed
    from reward_transactions
    where customer_id = c.customer_id and type in ('redeem','expire');

    to_expire := greatest(0, earned_expired - consumed);

    -- nunca expirar más que el saldo actual
    select least(to_expire, balance_cents) into to_expire
    from customer_rewards where customer_id = c.customer_id;

    if to_expire > 0 then
      update customer_rewards
        set balance_cents = balance_cents - to_expire, updated_at = now()
      where customer_id = c.customer_id;

      insert into reward_transactions (customer_id, type, amount_cents, notes)
      values (c.customer_id, 'expire', -to_expire, 'Vencimiento automático de puntos');
      n := n + 1;
    end if;
  end loop;
  return n;  -- número de clientes afectados
end; $$;

-- Programar diariamente con pg_cron (habilitar extensión en el dashboard):
--   select cron.schedule('expire-rewards-daily', '0 5 * * *', $$select expire_rewards();$$);
