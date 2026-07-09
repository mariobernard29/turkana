-- fix_people_served.sql — Personas atendidas en el corte de caja.
-- Pega y ejecuta en: Supabase → SQL Editor.

alter table cash_sessions add column if not exists people_served int;
