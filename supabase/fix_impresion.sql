-- 0029_impresion.sql
-- Impresión directa de tickets: se acabó el diálogo del navegador.
--
-- El sistema vive en la nube y la impresora vive en la tienda, así que el
-- servidor no puede hablarle: no hay ruta de red entre Vercel y la IP local de
-- la POS895. Y desde el navegador tampoco —no existen sockets TCP crudos, y en
-- el iPad Safari bloquea cualquier llamada a http://192.168.x.x desde una página
-- https. La salida es invertir el sentido: la venta deja el ticket en una cola
-- aquí, y un agente que corre en la PC del mostrador —el único que sí alcanza la
-- impresora— lo recoge por Realtime y lo vuelca al puerto 9100.
--
-- Pega y ejecuta en: Supabase → SQL Editor. Idempotente: se puede correr varias veces.

-- ── Impresoras ──────────────────────────────────────────────────────────────
create table if not exists printers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  host         text not null,                    -- IP fija de la impresora en la tienda
  port         int  not null default 9100,       -- puerto de impresión cruda
  register_id  uuid references cash_registers(id), -- null = la usan todas las cajas
  is_default   boolean not null default false,
  last_seen_at timestamptz,                      -- latido del agente que la atiende
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ── Cola de impresión ───────────────────────────────────────────────────────
-- El payload son los bytes ESC/POS ya armados por la app, en base64. El agente
-- no sabe nada del diseño del ticket: sólo mueve bytes. Así, cambiar un ticket
-- se despliega con la app y no obliga a actualizar la PC de la tienda.
create table if not exists print_jobs (
  id          uuid primary key default gen_random_uuid(),
  printer_id  uuid not null references printers(id),
  doc_type    text not null,                     -- sale, corte, apartado, abono...
  label       text,                              -- 'Ticket A-000123', para la pantalla
  payload     text not null,                     -- ESC/POS en base64
  status      text not null default 'pending'
    check (status in ('pending','printing','done','error')),
  attempts    int  not null default 0,
  error       text,
  session_id  uuid,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  printed_at  timestamptz
);
create index if not exists print_jobs_queue_idx on print_jobs (printer_id, status, created_at);

-- ── Permisos ────────────────────────────────────────────────────────────────
-- El agente entra con un usuario de staff propio, no con la llave de servicio:
-- una PC de mostrador no es lugar para la service_role key.
alter table printers   enable row level security;
alter table print_jobs enable row level security;

drop policy if exists "printers_staff"   on printers;
drop policy if exists "print_jobs_staff" on print_jobs;
create policy "printers_staff"   on printers   for all using (is_staff()) with check (is_staff());
create policy "print_jobs_staff" on print_jobs for all using (is_staff()) with check (is_staff());

-- ── Realtime ────────────────────────────────────────────────────────────────
-- Sin esto el agente tendría que preguntar en bucle y el ticket saldría tarde.
do $$
begin
  alter publication supabase_realtime add table print_jobs;
exception when duplicate_object then null;
end $$;

-- ── La impresora del mostrador ──────────────────────────────────────────────
-- Se deja dada de alta con una IP de ejemplo; hay que corregirla en
-- Admin → Ajustes → Impresoras con la IP real de la POS895.
insert into printers (name, host, port, is_default)
select 'POS895 mostrador', '192.168.1.100', 9100, true
 where not exists (select 1 from printers);
