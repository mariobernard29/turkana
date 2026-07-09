-- 0003_auth_roles.sql
-- Roles, permisos y perfil de staff ligado a auth.users.

create table roles (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,   -- super_admin, admin, gerente, cajero, inventarios, atencion
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

create table permissions (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,   -- ventas.cancelar, credito.modificar, inventario.ajustar...
  description text
);

create table role_permissions (
  role_id       uuid references roles(id) on delete cascade,
  permission_id uuid references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role_id     uuid references roles(id),
  full_name   text not null,
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  created_by  uuid references auth.users(id)
);

create trigger trg_profiles_updated before update on profiles
  for each row execute function set_updated_at();
