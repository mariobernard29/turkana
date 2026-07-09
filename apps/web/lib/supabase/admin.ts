// Cliente admin (service_role). USAR SOLO en el servidor (Route Handlers,
// Server Actions) para operaciones que deben saltar RLS de forma controlada.
// Nunca importar desde un componente de cliente.
//
// Sin el genérico <Database> a propósito: mientras los tipos no estén generados
// (placeholder), tiparlo colapsa insert/update a `never`. Las lecturas se castean
// en cada llamada. Cuando exista database.types real, se puede re-tipar.
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
