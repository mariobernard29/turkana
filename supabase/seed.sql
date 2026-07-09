-- seed.sql
-- Datos iniciales: roles, permisos, almacenes, configuración, caja y Storage.
-- Idempotente: se puede correr varias veces (on conflict do nothing).

-- ── Roles ──────────────────────────────────────────────────────────────────
insert into roles (key, name) values
  ('super_admin','Super Admin'),
  ('admin','Administrador'),
  ('gerente','Gerente'),
  ('cajero','Cajero'),
  ('inventarios','Inventarios'),
  ('atencion','Atención al Cliente')
on conflict (key) do nothing;

-- ── Permisos ───────────────────────────────────────────────────────────────
insert into permissions (key, description) values
  ('ventas.cancelar','Cancelar venta'),
  ('credito.modificar','Modificar crédito'),
  ('inventario.ajustar','Ajustar inventario'),
  ('usuarios.crear','Crear usuarios'),
  ('caja.corte','Realizar corte de caja'),
  ('resguardo.crear','Crear resguardo')
on conflict (key) do nothing;

-- ── Asignación de permisos por rol ─────────────────────────────────────────
-- admin: todos los permisos (super_admin se resuelve por has_permission()).
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r cross join permissions p
where r.key = 'admin'
on conflict do nothing;

-- gerente
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p
  on p.key in ('ventas.cancelar','caja.corte','resguardo.crear','inventario.ajustar','credito.modificar')
where r.key = 'gerente'
on conflict do nothing;

-- cajero
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p
  on p.key in ('caja.corte','resguardo.crear')
where r.key = 'cajero'
on conflict do nothing;

-- inventarios
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p
  on p.key in ('inventario.ajustar')
where r.key = 'inventarios'
on conflict do nothing;

-- ── Almacenes (catálogo compartido, stock independiente) ───────────────────
insert into inventory_locations (key, name, type) values
  ('tienda','Tienda Física','physical'),
  ('ecommerce','E-commerce','online')
on conflict (key) do nothing;

-- ── Configuración global ───────────────────────────────────────────────────
insert into app_settings (key, value, description) values
  ('order_folio_prefix','TK-','Prefijo del folio de orden (6 dígitos)'),
  ('rewards_earn_rate','0.015','Tasa de acumulación de rewards sobre subtotal'),
  ('rewards_max_redeem_cents','100000','Tope de canje de rewards por operación ($1,000)'),
  ('rewards_expiry_months','12','Meses de vigencia de los puntos antes de vencer'),
  ('tax_rate','0.16','IVA que se suma en checkout'),
  ('free_shipping_threshold_cents','199900','Envío gratis desde $1,999'),
  ('shipping_standard_cents','11000','Envío estándar $110 (4-7 días)'),
  ('shipping_express_cents','15900','Envío express $159 (2-4 días)'),
  ('cash_drop_threshold_cents','1000000','Límite de efectivo en caja antes de resguardo ($10,000)'),
  ('admin_alert_email','','Correo de administración para alertas'),
  ('low_stock_threshold','5','Umbral de inventario bajo (piezas)')
on conflict (key) do nothing;

-- ── Caja inicial de la tienda física ───────────────────────────────────────
insert into cash_registers (name, location_id)
select 'Caja Principal', l.id from inventory_locations l where l.key = 'tienda'
on conflict do nothing;

-- ── Storage: buckets ───────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values
  ('product-images','product-images', true),
  ('collections','collections', true),
  ('tickets','tickets', false),
  ('brand','brand', true)
on conflict (id) do nothing;

-- ── Storage: políticas ─────────────────────────────────────────────────────
drop policy if exists "public read product-images" on storage.objects;
create policy "public read product-images" on storage.objects
  for select using (bucket_id in ('product-images','collections','brand'));

drop policy if exists "staff upload product-images" on storage.objects;
create policy "staff upload product-images" on storage.objects
  for insert with check (
    bucket_id in ('product-images','collections','brand')
    and has_permission('inventario.ajustar')
  );

drop policy if exists "staff manage product-images" on storage.objects;
create policy "staff manage product-images" on storage.objects
  for update using (has_permission('inventario.ajustar'));

drop policy if exists "staff delete images" on storage.objects;
create policy "staff delete images" on storage.objects
  for delete using (has_permission('inventario.ajustar'));

-- tickets (PDFs): solo staff lee.
drop policy if exists "staff read tickets" on storage.objects;
create policy "staff read tickets" on storage.objects
  for select using (bucket_id = 'tickets' and is_staff());
