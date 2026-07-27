-- fix_layaway_folio.sql (= migración 0022_layaway_folio.sql)
-- Folio legible para los apartados (AP-000001), para poder identificar rápido la
-- pieza apartada entre el comprobante del cliente, el talón pegado a la pieza y
-- la lista del POS. Antes sólo existía el UUID.
-- Pega y ejecuta en: Supabase → SQL Editor. Idempotente.

create sequence if not exists layaway_folio_seq;

alter table layaways add column if not exists folio text;

create or replace function next_layaway_folio() returns text
language plpgsql as $$
declare prefix text; n bigint;
begin
  select value into prefix from app_settings where key = 'layaway_folio_prefix';
  prefix := coalesce(prefix, 'AP-');
  n := nextval('layaway_folio_seq');
  return prefix || lpad(n::text, 6, '0');
end; $$;

create or replace function set_layaway_folio() returns trigger
language plpgsql as $$
begin
  if new.folio is null then
    new.folio := next_layaway_folio();
  end if;
  return new;
end; $$;

drop trigger if exists trg_layaways_folio on layaways;
create trigger trg_layaways_folio before insert on layaways
  for each row execute function set_layaway_folio();

-- Backfill de apartados existentes (por antigüedad, para que el folio siga el orden real).
do $$
declare r record;
begin
  for r in select id from layaways where folio is null order by created_at loop
    update layaways set folio = next_layaway_folio() where id = r.id;
  end loop;
end $$;

create unique index if not exists layaways_folio_key on layaways (folio);

insert into app_settings (key, value, description) values
  ('layaway_folio_prefix','AP-','Prefijo del folio de apartado (6 dígitos)')
on conflict (key) do nothing;
