-- fix_shipping_tracking.sql — Paquetería y número de guía en envíos.
-- Pega y ejecuta en: Supabase → SQL Editor.

alter table shipments add column if not exists carrier         text;
alter table shipments add column if not exists tracking_number text;
