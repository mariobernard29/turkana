-- 0012_rls.sql
-- Row Level Security en todas las tablas + publicación Realtime.
-- Regla general: catálogo público de lectura; cliente ve solo lo suyo;
-- staff gestiona; las mutaciones sensibles van por funciones security definer.

-- Habilitar RLS en todas las tablas de negocio.
alter table app_settings        enable row level security;
alter table roles               enable row level security;
alter table permissions         enable row level security;
alter table role_permissions    enable row level security;
alter table profiles            enable row level security;
alter table categories          enable row level security;
alter table collections         enable row level security;
alter table products            enable row level security;
alter table product_variants    enable row level security;
alter table product_images      enable row level security;
alter table inventory_locations enable row level security;
alter table stock_levels        enable row level security;
alter table inventory_movements enable row level security;
alter table customers           enable row level security;
alter table customer_addresses  enable row level security;
alter table customer_rewards    enable row level security;
alter table reward_transactions enable row level security;
alter table orders              enable row level security;
alter table order_items         enable row level security;
alter table payments            enable row level security;
alter table shipments           enable row level security;
alter table cash_registers      enable row level security;
alter table cash_sessions       enable row level security;
alter table cash_movements      enable row level security;
alter table cash_drops          enable row level security;
alter table expenses            enable row level security;
alter table credit_accounts     enable row level security;
alter table credit_transactions enable row level security;
alter table layaways            enable row level security;
alter table layaway_payments    enable row level security;
alter table returns             enable row level security;
alter table service_sales       enable row level security;
alter table notifications       enable row level security;
alter table audit_logs          enable row level security;
alter table devices             enable row level security;
alter table sync_queue          enable row level security;

-- ── Catálogo público (lectura anónima de lo publicado) ─────────────────────
create policy "categories_public_read" on categories
  for select using (deleted_at is null);
create policy "collections_public_read" on collections
  for select using (is_active and deleted_at is null);
create policy "products_public_read" on products
  for select using (status = 'active' and deleted_at is null);
create policy "variants_public_read" on product_variants
  for select using (is_active and deleted_at is null);
create policy "images_public_read" on product_images
  for select using (true);

-- Staff con permiso de inventario gestiona el catálogo.
create policy "categories_staff_write" on categories
  for all using (has_permission('inventario.ajustar')) with check (has_permission('inventario.ajustar'));
create policy "collections_staff_write" on collections
  for all using (is_staff()) with check (is_staff());
create policy "products_staff_write" on products
  for all using (has_permission('inventario.ajustar')) with check (has_permission('inventario.ajustar'));
create policy "variants_staff_write" on product_variants
  for all using (has_permission('inventario.ajustar')) with check (has_permission('inventario.ajustar'));
create policy "images_staff_write" on product_images
  for all using (has_permission('inventario.ajustar')) with check (has_permission('inventario.ajustar'));

-- ── Clientes: cada quien ve lo suyo; staff ve todo ─────────────────────────
create policy "customers_self_or_staff" on customers
  for select using (auth_user_id = auth.uid() or is_staff());
create policy "customers_staff_write" on customers
  for all using (is_staff()) with check (is_staff());

create policy "addresses_self_or_staff" on customer_addresses
  for all using (
    is_staff() or customer_id in (select id from customers where auth_user_id = auth.uid())
  ) with check (
    is_staff() or customer_id in (select id from customers where auth_user_id = auth.uid())
  );

create policy "rewards_self_read" on customer_rewards
  for select using (
    is_staff() or customer_id in (select id from customers where auth_user_id = auth.uid())
  );
create policy "reward_tx_self_read" on reward_transactions
  for select using (
    is_staff() or customer_id in (select id from customers where auth_user_id = auth.uid())
  );

-- ── Órdenes: cliente ve las suyas; staff todas ─────────────────────────────
create policy "orders_owner_or_staff" on orders
  for select using (
    is_staff() or customer_id in (select id from customers where auth_user_id = auth.uid())
  );
create policy "orders_staff_write" on orders
  for all using (is_staff()) with check (is_staff());

create policy "order_items_read" on order_items
  for select using (
    is_staff() or order_id in (
      select o.id from orders o join customers c on c.id = o.customer_id
      where c.auth_user_id = auth.uid()
    )
  );
create policy "order_items_staff_write" on order_items
  for all using (is_staff()) with check (is_staff());

create policy "payments_read" on payments
  for select using (
    is_staff() or order_id in (
      select o.id from orders o join customers c on c.id = o.customer_id
      where c.auth_user_id = auth.uid()
    )
  );
create policy "shipments_read" on shipments
  for select using (
    is_staff() or order_id in (
      select o.id from orders o join customers c on c.id = o.customer_id
      where c.auth_user_id = auth.uid()
    )
  );
create policy "shipments_staff_write" on shipments
  for all using (is_staff()) with check (is_staff());

-- ── Lectura general de catálogo de soporte para staff ──────────────────────
create policy "locations_staff_read" on inventory_locations
  for select using (is_staff());

-- Stock y movimientos: staff lee; ajustes/traspasos manuales requieren permiso.
create policy "stock_staff_read" on stock_levels
  for select using (is_staff());
create policy "stock_staff_write" on stock_levels
  for all using (has_permission('inventario.ajustar')) with check (has_permission('inventario.ajustar'));
create policy "movements_staff_read" on inventory_movements
  for select using (is_staff());
create policy "movements_staff_write" on inventory_movements
  for insert with check (has_permission('inventario.ajustar'));

-- ── Tablas solo-staff (back-office / POS) ──────────────────────────────────
-- Lectura para staff; escritura preferente vía funciones security definer.
create policy "settings_staff" on app_settings for select using (is_staff());
create policy "roles_staff" on roles for select using (is_staff());
create policy "permissions_staff" on permissions for select using (is_staff());
create policy "role_permissions_staff" on role_permissions for select using (is_staff());
create policy "profiles_self_or_staff" on profiles
  for select using (id = auth.uid() or is_staff());
create policy "profiles_admin_write" on profiles
  for all using (has_permission('usuarios.crear')) with check (has_permission('usuarios.crear'));

create policy "cash_registers_staff" on cash_registers for all using (is_staff()) with check (is_staff());
create policy "cash_sessions_staff" on cash_sessions for all using (is_staff()) with check (is_staff());
create policy "cash_movements_staff" on cash_movements for all using (is_staff()) with check (is_staff());
create policy "cash_drops_staff" on cash_drops for all using (is_staff()) with check (is_staff());
create policy "expenses_staff" on expenses for all using (is_staff()) with check (is_staff());

create policy "credit_accounts_staff" on credit_accounts for all using (is_staff()) with check (is_staff());
create policy "credit_tx_staff" on credit_transactions for all using (is_staff()) with check (is_staff());
create policy "layaways_staff" on layaways for all using (is_staff()) with check (is_staff());
create policy "layaway_payments_staff" on layaway_payments for all using (is_staff()) with check (is_staff());
create policy "returns_staff" on returns for all using (is_staff()) with check (is_staff());
create policy "service_sales_staff" on service_sales for all using (is_staff()) with check (is_staff());

create policy "notifications_staff" on notifications
  for select using (is_staff());
create policy "audit_logs_staff_read" on audit_logs
  for select using (auth_role() in ('super_admin','admin'));
create policy "devices_staff" on devices for all using (is_staff()) with check (is_staff());
create policy "sync_queue_staff" on sync_queue for all using (is_staff()) with check (is_staff());

-- ── Auth Hook: el rol supabase_auth_admin debe poder leer profiles/roles ───
-- Sin esto el custom_access_token_hook falla y el login devuelve 500.
grant usage on schema public to supabase_auth_admin;
grant execute on function custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on profiles to supabase_auth_admin;
grant select on roles to supabase_auth_admin;

create policy "auth_admin_read_profiles" on profiles
  as permissive for select to supabase_auth_admin using (true);
create policy "auth_admin_read_roles" on roles
  as permissive for select to supabase_auth_admin using (true);

-- ── Realtime ───────────────────────────────────────────────────────────────
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table stock_levels;
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table cash_sessions;
