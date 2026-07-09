-- 0018_shipping_tracking.sql
-- Paquetería y número de guía en la tabla de envíos.

alter table shipments add column if not exists carrier         text;
alter table shipments add column if not exists tracking_number text;
