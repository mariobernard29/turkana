-- fix_auth_hook.sql  (DEFINITIVO)
-- El login da 500 porque el Auth Hook se ejecuta como supabase_auth_admin y RLS
-- bloquea la lectura de profiles/roles. Solución: recrear la función como
-- SECURITY DEFINER (corre como el dueño y omite RLS).
-- Pega y ejecuta TODO en: Supabase → SQL Editor.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claims jsonb;
  user_role text;
begin
  select r.key into user_role
  from profiles p
  join roles r on r.id = p.role_id
  where p.id = (event->>'user_id')::uuid;

  claims := event->'claims';
  claims := jsonb_set(claims, '{user_role}', to_jsonb(coalesce(user_role, 'customer')));
  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- Permitir que GoTrue (supabase_auth_admin) ejecute el hook; nadie más.
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
