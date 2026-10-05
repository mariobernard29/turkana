-- 0032_asistencia.sql
-- Asistencia del personal: entrada y salida desde el POS con código + PIN.
--
-- El personal que checa es una lista PROPIA, independiente de los usuarios del
-- sistema: la persona de limpieza o la perforadora checan aunque no tengan cuenta.
-- El PIN se guarda con hash (scrypt, lo calcula la app) y nunca viaja al navegador.
--
-- RLS activado SIN políticas: anon y authenticated no ven nada. Todo pasa por
-- server actions con service_role, que validan el rol (sólo super_admin administra).
--
-- Pega y ejecuta en: Supabase → SQL Editor. Idempotente: se puede correr varias veces.

-- ── Personal ────────────────────────────────────────────────────────────────
create table if not exists attendance_employees (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null,
  code            text not null unique check (code ~ '^[0-9]{1,6}$'),
  pin_hash        text not null,
  active          boolean not null default true,
  failed_attempts int not null default 0,      -- PIN equivocados seguidos
  locked_until    timestamptz,                 -- bloqueo temporal tras 5 fallos
  created_at      timestamptz not null default now()
);

-- ── Horario semanal ─────────────────────────────────────────────────────────
-- Un renglón por día que trabaja; sin renglón = descanso. weekday: 0=domingo.
create table if not exists attendance_schedules (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references attendance_employees(id) on delete cascade,
  weekday     smallint not null check (weekday between 0 and 6),
  start_time  time not null,
  end_time    time not null,
  unique (employee_id, weekday)
);

-- ── Marcajes ────────────────────────────────────────────────────────────────
-- scheduled_start/end son la FOTO del horario al checar: cambiar el horario
-- después no reescribe los reportes de semanas pasadas.
create table if not exists attendance_records (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references attendance_employees(id) on delete cascade,
  clock_in        timestamptz not null,
  clock_out       timestamptz,
  scheduled_start timestamptz,
  scheduled_end   timestamptz,
  register_id     uuid references cash_registers(id) on delete set null,
  device_id       text,
  auto_closed     boolean not null default false, -- se quedó sin salida (>16 h abierto)
  edited_by       uuid references profiles(id) on delete set null,
  notes           text,
  created_at      timestamptz not null default now(),
  check (clock_out is null or clock_out >= clock_in)
);

create index if not exists attendance_records_employee_in_idx on attendance_records (employee_id, clock_in);
create index if not exists attendance_records_in_idx on attendance_records (clock_in);
create index if not exists attendance_records_register_idx on attendance_records (register_id);
create index if not exists attendance_records_edited_by_idx on attendance_records (edited_by);
-- Una sola entrada abierta por persona: dos toques simultáneos no abren dos.
create unique index if not exists attendance_records_one_open
  on attendance_records (employee_id) where clock_out is null and not auto_closed;

alter table attendance_employees enable row level security;
alter table attendance_schedules enable row level security;
alter table attendance_records   enable row level security;
