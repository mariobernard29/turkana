import { createAdminClient } from "@/lib/supabase/admin";

export type ShippingSettings = { freeThresholdCents: number; standardCents: number; expressCents: number };

export const SHIPPING_DEFAULTS: ShippingSettings = {
  freeThresholdCents: 199900,
  standardCents: 11000,
  expressCents: 15900,
};

const KEYS = {
  free: "free_shipping_threshold_cents",
  standard: "shipping_standard_cents",
  express: "shipping_express_cents",
} as const;

export async function getShippingSettings(): Promise<ShippingSettings> {
  try {
    const db = createAdminClient();
    const { data } = await db.from("app_settings").select("key, value").in("key", [KEYS.free, KEYS.standard, KEYS.express]);
    const map = new Map(((data as unknown as { key: string; value: string }[]) ?? []).map((r) => [r.key, parseInt(r.value, 10)]));
    return {
      freeThresholdCents: map.get(KEYS.free) ?? SHIPPING_DEFAULTS.freeThresholdCents,
      standardCents: map.get(KEYS.standard) ?? SHIPPING_DEFAULTS.standardCents,
      expressCents: map.get(KEYS.express) ?? SHIPPING_DEFAULTS.expressCents,
    };
  } catch {
    return SHIPPING_DEFAULTS;
  }
}
