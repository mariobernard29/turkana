"use client";

// Refresco en vivo de una pantalla.
//
// Antes, cambiar un precio en el panel no llegaba al POS hasta que alguien
// recargaba a mano: la caja cobraba con el precio viejo. Este hook escucha los
// cambios de unas tablas por Realtime y vuelve a pedir los datos del servidor.
//
// Todas las pantallas que lo usan son `force-dynamic`, así que `router.refresh()`
// vuelve a ejecutar el Server Component y baja datos frescos. Es un refresco
// suave: React reconcilia y el estado del cliente (el carrito, por ejemplo) se
// conserva.
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Se agrupan los cambios: guardar un producto con cinco tallas dispara seis
// eventos y no tiene sentido recargar seis veces.
const DEBOUNCE_MS = 800;
// Red de seguridad, y corre SIEMPRE, no sólo si el websocket se cayó: Realtime
// aplica RLS al renglón NUEVO, así que un producto que se desactiva (deja de
// cumplir `status = 'active'`) no genera evento visible y sin esto se quedaría
// en pantalla del POS hasta que alguien recargara.
const FALLBACK_MS = 120_000;

export function useLiveRefresh(tables: string[], opts?: { enabled?: boolean }) {
  const router = useRouter();
  const enabled = opts?.enabled ?? true;
  // Se serializa para que el efecto no se reinicie en cada render por un array
  // literal nuevo.
  const key = tables.join(",");

  const subscribed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const list = key.split(",").filter(Boolean);
    if (!list.length) return;

    const refresh = () => {
      // En segundo plano no se recarga nada: se anota y se hace al volver.
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        pending.current = true;
        return;
      }
      pending.current = false;
      router.refresh();
    };

    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(refresh, DEBOUNCE_MS);
    };

    const supabase = createClient();
    const channel = supabase.channel(`live:${key}`);
    for (const table of list) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, schedule);
    }
    channel.subscribe((status) => {
      subscribed.current = status === "SUBSCRIBED";
    });

    // Al volver a la pestaña: si hubo cambios mientras no se veía, se aplican.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (pending.current || !subscribed.current) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    const poll = setInterval(refresh, FALLBACK_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [key, enabled, router]);
}
