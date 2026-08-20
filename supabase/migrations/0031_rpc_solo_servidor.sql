-- 0031 · Las RPC de dinero e inventario dejan de ser públicas
--
-- Postgres concede EXECUTE a PUBLIC por omisión, así que estas funciones eran
-- llamables por cualquiera con la llave anon —que es pública: viaja dentro del
-- navegador en cada visita a la tienda— vía POST /rest/v1/rpc/<nombre>.
-- Y como son SECURITY DEFINER, se saltan RLS: desde fuera se podía vaciar el
-- inventario, falsificar abonos de apartado o revertir cargos de fiado.
--
-- Ninguna de ellas se llama nunca desde el navegador: las 16 llamadas `.rpc()`
-- del proyecto están en server actions con `createAdminClient()` (service_role)
-- y las Edge Functions usan SERVICE_ROLE_KEY. Por eso se puede cerrar sin más.
--
-- NO se tocan a propósito:
--   · has_permission(text) — la evalúan las POLÍTICAS RLS, o sea el rol que
--     consulta. Quitarle el permiso rompería hasta el catálogo público, porque
--     un SELECT anónimo sobre products/categories evalúa también la política de
--     escritura del personal.
--   · audit_trigger(), handle_new_customer(), rls_auto_enable() — devuelven
--     `trigger`/`event_trigger`: no se pueden invocar por RPC.
--   · custom_access_token_hook(jsonb) — ya estaba cerrada.
--
-- Para revertir: grant execute on function public.<nombre>(...) to anon, authenticated;

do $$
declare
  f text;
  firmas text[] := array[
    'charge_credit(p_account uuid, p_order uuid, p_amount bigint, p_due date, p_session uuid, p_by uuid, p_force boolean, p_notes text)',
    'credit_rewards(p_customer uuid, p_order uuid, p_subtotal_cents bigint, p_channel text)',
    'decrement_stock(p_variant uuid, p_location_key text, p_qty integer, p_ref_type text, p_ref_id uuid)',
    'expire_rewards()',
    'pay_credit(p_account uuid, p_amount bigint, p_method text, p_session uuid, p_by uuid)',
    'pay_layaway(p_layaway uuid, p_amount bigint, p_method text, p_session uuid, p_by uuid)',
    'redeem_rewards(p_customer uuid, p_order uuid, p_amount_cents bigint, p_channel text)',
    'release_reserved(p_variant uuid, p_location_key text, p_qty integer)',
    'reserve_stock(p_variant uuid, p_location_key text, p_qty integer)',
    'reverse_credit_charge(p_order uuid)'
  ];
begin
  foreach f in array firmas loop
    -- PUBLIC primero: sin esto, anon seguiría teniendo el permiso heredado.
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    -- El servidor sí las necesita, y con PUBLIC revocado hay que ser explícito.
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
