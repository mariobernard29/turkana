-- 0024_piercings.sql
-- Registro de las perforaciones de oreja hechas en tienda: quién, cuándo, con qué lote
-- de arete y en qué punto de qué oreja. Además guarda cuándo se le mandaron al cliente
-- las instrucciones de cuidado y los dos seguimientos (1ª semana / 1er mes), que es lo
-- que alimenta el filtro de "seguimiento pendiente" del admin.
-- Pega y ejecuta en: Supabase → SQL Editor. Idempotente.

create sequence if not exists piercing_folio_seq;

create table if not exists piercings (
  id            uuid primary key default gen_random_uuid(),
  folio         text,
  customer_id   uuid not null references customers(id),
  performed_at  date not null default current_date,
  batch_number  text,                          -- número de lote del arete
  spots         text[] not null default '{}',  -- ['izq_lobulo','der_alta', ...]
  notes         text,
  care_email_sent_at  timestamptz,             -- instrucciones de cuidado
  week_email_sent_at  timestamptz,             -- seguimiento 1ª semana
  month_email_sent_at timestamptz,             -- seguimiento 1er mes
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  -- Catálogo cerrado de 6 puntos. Red de seguridad: la validación de UX está en
  -- app/admin/perforaciones/actions.ts. Si algún día cada punto necesita su propio
  -- lote o precio, entonces sí conviene migrar a una tabla hija piercing_spots.
  constraint piercings_spots_valid check (
    spots <@ array['izq_alta','izq_medio','izq_lobulo',
                   'der_alta','der_medio','der_lobulo']::text[]
  ),
  -- cardinality y no array_length: array_length('{}',1) es NULL y el check pasaría.
  constraint piercings_spots_not_empty check (cardinality(spots) >= 1)
);

create index if not exists piercings_customer_idx on piercings (customer_id);
create index if not exists piercings_performed_idx on piercings (performed_at desc);
-- Índices parciales para el filtro de "seguimiento pendiente" (el caso frecuente).
create index if not exists piercings_week_pending_idx on piercings (performed_at)
  where week_email_sent_at is null and deleted_at is null;
create index if not exists piercings_month_pending_idx on piercings (performed_at)
  where month_email_sent_at is null and deleted_at is null;

-- ── Folio legible PF-000001 (mismo patrón que ventas y apartados) ───────────
create or replace function next_piercing_folio() returns text
language plpgsql as $$
declare prefix text; n bigint;
begin
  select value into prefix from app_settings where key = 'piercing_folio_prefix';
  prefix := coalesce(prefix, 'PF-');
  n := nextval('piercing_folio_seq');
  return prefix || lpad(n::text, 6, '0');
end; $$;

create or replace function set_piercing_folio() returns trigger
language plpgsql as $$
begin
  if new.folio is null then
    new.folio := next_piercing_folio();
  end if;
  return new;
end; $$;

drop trigger if exists trg_piercings_folio on piercings;
create trigger trg_piercings_folio before insert on piercings
  for each row execute function set_piercing_folio();

drop trigger if exists trg_piercings_updated on piercings;
create trigger trg_piercings_updated before update on piercings
  for each row execute function set_updated_at();

create unique index if not exists piercings_folio_key on piercings (folio);

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table piercings enable row level security;
drop policy if exists "piercings_staff" on piercings;
create policy "piercings_staff" on piercings for all using (is_staff()) with check (is_staff());

insert into app_settings (key, value, description) values
  ('piercing_folio_prefix','PF-','Prefijo del folio de perforación (6 dígitos)')
on conflict (key) do nothing;

-- ── Búsqueda por teléfono ───────────────────────────────────────────────────
-- customers.phone se guarda tal como se teclea ("668 123 4567"), así que buscar
-- "6681234567" no encontraba nada. Columna generada con sólo los dígitos, para
-- que el buscador de perforaciones (y el de clientes) encuentre de las dos formas.
alter table customers add column if not exists phone_digits text
  generated always as (regexp_replace(coalesce(phone,''), '\D', '', 'g')) stored;
create index if not exists customers_phone_digits_idx on customers (phone_digits);
