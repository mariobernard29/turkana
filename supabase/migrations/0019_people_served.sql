-- 0019_people_served.sql
-- Personas atendidas durante el turno, capturadas al hacer el corte de caja.

alter table cash_sessions add column if not exists people_served int;
