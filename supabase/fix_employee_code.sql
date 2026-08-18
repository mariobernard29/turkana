-- 0026_employee_code.sql
-- Número de empleado: cuatro dígitos que sustituyen al correo para entrar al POS.
-- Teclear "brisruizborbolla04@gmail.com" en la tablet del mostrador, con prisa y
-- un cliente enfrente, es la parte lenta del inicio de sesión; el código no.
-- La contraseña sigue siendo la que autentica: el código sólo identifica a quién.

alter table profiles add column if not exists employee_code text;

alter table profiles drop constraint if exists profiles_employee_code_format;
alter table profiles add constraint profiles_employee_code_format
  check (employee_code is null or employee_code ~ '^[0-9]{4}$');

-- Único entre el personal vivo; el código de alguien dado de baja se puede reusar.
create unique index if not exists profiles_employee_code_key
  on profiles (employee_code) where employee_code is not null and deleted_at is null;

-- A quien ya existe se le asigna uno libre. Al azar y no secuencial: con 1001,
-- 1002, 1003… basta ver un código para adivinar los demás.
do $$
declare r record; c text;
begin
  for r in select id from profiles where employee_code is null and deleted_at is null loop
    loop
      c := (1000 + floor(random() * 9000))::int::text;
      exit when not exists (select 1 from profiles where employee_code = c);
    end loop;
    update profiles set employee_code = c where id = r.id;
  end loop;
end $$;
