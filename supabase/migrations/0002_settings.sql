-- 0002_settings.sql
-- Configuración global key/value (folios, rewards, envíos, IVA, resguardos).

create table app_settings (
  key         text primary key,
  value       text,
  description text,
  updated_at  timestamptz not null default now()
);

create trigger trg_app_settings_updated before update on app_settings
  for each row execute function set_updated_at();
