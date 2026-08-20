"use client";

// Envoltorio para poder pedir refresco en vivo desde un Server Component:
// se monta y no pinta nada, sólo escucha los cambios de esas tablas.
import { useLiveRefresh } from "@/lib/use-live-refresh";

export function LiveRefresh({ tables }: { tables: string[] }) {
  useLiveRefresh(tables);
  return null;
}
