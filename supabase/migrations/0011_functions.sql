-- 0011_functions.sql
-- Funciones de negocio y helpers de seguridad.

-- ── Helpers de roles/permisos ──────────────────────────────────────────────
create or replace function auth_role() returns text
language sql stable as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb->>'user_role','customer')
$$;

create or replace function is_staff() returns boolean
language sql stable as $$
  select auth_role() in ('super_admin','admin','gerente','cajero','inventarios','atencion')
$$;

create or replace function has_permission(perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    join role_permissions rp on rp.role_id = p.role_id
    join permissions pm on pm.id = rp.permission_id
    where p.id = auth.uid() and pm.key = perm
  ) or auth_role() = 'super_admin'
$$;

-- Hook que inyecta el rol en el JWT (Authentication → Hooks → Custom Access Token).
-- SECURITY DEFINER: lo ejecuta GoTrue como supabase_auth_admin, pero corre como
-- el dueño (postgres) y así omite RLS al leer profiles/roles. Sin esto, el login da 500.
create or replace function custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare claims jsonb; user_role text;
begin
  select r.key into user_role
  from profiles p join roles r on r.id = p.role_id
  where p.id = (event->>'user_id')::uuid;

  claims := event->'claims';
  claims := jsonb_set(claims, '{user_role}', to_jsonb(coalesce(user_role,'customer')));
  return jsonb_set(event, '{claims}', claims);
end; $$;

-- Permite que Auth ejecute el hook (además hay que habilitarlo en config/dashboard).
grant execute on function custom_access_token_hook(jsonb) to supabase_auth_admin;

-- ── Folio de orden: 6 dígitos + prefijo configurable ───────────────────────
create or replace function next_order_number() returns text
language plpgsql as $$
declare prefix text; n bigint;
begin
  select value into prefix from app_settings where key = 'order_folio_prefix';
  prefix := coalesce(prefix, 'TK-');
  n := nextval('order_folio_seq');
  return prefix || lpad(n::text, 6, '0');
end; $$;

create or replace function set_order_number() returns trigger
language plpgsql as $$
begin
  if new.order_number is null then
    new.order_number := next_order_number();
  end if;
  return new;
end; $$;

create trigger trg_orders_folio before insert on orders
  for each row execute function set_order_number();

-- ── Inventario: descuento con bloqueo (evita sobreventa) ───────────────────
create or replace function decrement_stock(p_variant uuid, p_location_key text,
  p_qty int, p_ref_type text, p_ref_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare loc uuid; avail int;
begin
  select id into loc from inventory_locations where key = p_location_key;

  select quantity - reserved into avail
  from stock_levels
  where variant_id = p_variant and location_id = loc
  for update;

  if avail is null or avail < p_qty then
    raise exception 'STOCK_INSUFICIENTE';
  end if;

  update stock_levels set quantity = quantity - p_qty, updated_at = now()
  where variant_id = p_variant and location_id = loc;

  -- 'venta' es el tipo de movimiento; p_ref_type ('order') va en reference_type.
  insert into inventory_movements (variant_id, location_id, type, quantity, reference_type, reference_id)
  values (p_variant, loc, 'venta', -p_qty, p_ref_type, p_ref_id);
end; $$;

-- ── Rewards: acreditación 1.5% (sin envío ni impuestos) ────────────────────
create or replace function credit_rewards(p_customer uuid, p_order uuid,
  p_subtotal_cents bigint, p_channel text)
returns void language plpgsql security definer set search_path = public as $$
declare rate numeric; pts bigint;
begin
  select coalesce(value::numeric, 0.015) into rate
  from app_settings where key = 'rewards_earn_rate';
  pts := floor(p_subtotal_cents * rate);

  insert into customer_rewards (customer_id, balance_cents, lifetime_earned_cents)
  values (p_customer, pts, pts)
  on conflict (customer_id) do update
    set balance_cents = customer_rewards.balance_cents + pts,
        lifetime_earned_cents = customer_rewards.lifetime_earned_cents + pts,
        updated_at = now();

  insert into reward_transactions (customer_id, type, amount_cents, order_id, channel)
  values (p_customer, 'earn', pts, p_order, p_channel);

  update orders set rewards_earned_cents = pts where id = p_order;
end; $$;

-- ── Rewards: canje con tope configurable (default $1,000) ───────────────────
create or replace function redeem_rewards(p_customer uuid, p_order uuid,
  p_amount_cents bigint, p_channel text)
returns bigint language plpgsql security definer set search_path = public as $$
declare bal bigint; cap bigint;
begin
  select coalesce(value::bigint, 100000) into cap
  from app_settings where key = 'rewards_max_redeem_cents';
  if p_amount_cents > cap then
    raise exception 'CANJE_EXCEDE_TOPE';
  end if;

  select balance_cents into bal from customer_rewards
  where customer_id = p_customer for update;

  if bal is null or bal < p_amount_cents then
    raise exception 'SALDO_INSUFICIENTE';
  end if;

  update customer_rewards
    set balance_cents = balance_cents - p_amount_cents, updated_at = now()
  where customer_id = p_customer;

  insert into reward_transactions (customer_id, type, amount_cents, order_id, channel)
  values (p_customer, 'redeem', -p_amount_cents, p_order, p_channel);

  update orders set rewards_redeemed_cents = p_amount_cents where id = p_order;
  return p_amount_cents;
end; $$;

-- ── Auditoría genérica (opcional por tabla) ────────────────────────────────
create or replace function audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_logs (actor_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), tg_op, tg_table_name,
          coalesce((new).id, (old).id),
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end; $$;
