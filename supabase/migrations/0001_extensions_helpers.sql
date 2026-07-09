-- 0001_extensions_helpers.sql
-- Extensiones y helpers reutilizables.

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";     -- búsqueda por similitud

-- Mantiene updated_at en cada UPDATE.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;
