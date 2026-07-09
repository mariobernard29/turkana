// Base local (IndexedDB vía Dexie) para el POS offline-first.
// Guarda el catálogo en caché y la cola (outbox) de ventas hechas sin conexión.
import Dexie, { type Table } from "dexie";

export type CachedSize = { variantId: string; talla: string; priceCents: number; stock: number; lowThreshold: number };
export type CachedProduct = {
  productId: string;
  name: string;
  sku: string;
  image: string | null;
  categoryId: string | null;
  sizes: CachedSize[];
};

export type OutboxOp = {
  clientOpId: string;
  sessionId: string;
  items: { variantId: string; qty: number }[];
  services?: { concept: string; description?: string; amountCents: number }[];
  payments: { method: "cash" | "card" | "transfer" | "rewards"; amountCents: number }[];
  customerId?: string;
  discount?: { cents: number; authorizedBy?: string; concept?: string };
  createdAtIso: string;
  status: "pending" | "synced" | "conflict" | "error";
  error?: string;
};

class PosDB extends Dexie {
  products!: Table<CachedProduct, string>;
  outbox!: Table<OutboxOp, string>;

  constructor() {
    super("turkana_pos");
    this.version(1).stores({
      variants: "variantId, sku, name",
      outbox: "clientOpId, status",
    });
    this.version(2).stores({
      variants: null, // se reemplaza por products
      products: "productId, sku, name",
      outbox: "clientOpId, status",
    });
  }
}

let _db: PosDB | null = null;
function db(): PosDB {
  if (!_db) _db = new PosDB();
  return _db;
}

// ── Catálogo en caché ────────────────────────────────────────────────────────
export async function cacheProducts(ps: CachedProduct[]) {
  const d = db();
  await d.transaction("rw", d.products, async () => {
    await d.products.clear();
    await d.products.bulkPut(ps);
  });
}

export async function getCachedProducts(): Promise<CachedProduct[]> {
  return db().products.toArray();
}

// ── Outbox de ventas offline ─────────────────────────────────────────────────
export async function enqueueSale(op: Omit<OutboxOp, "status">) {
  await db().outbox.put({ ...op, status: "pending" });
  window.dispatchEvent(new Event("turkana-outbox"));
}

export async function getPendingOps(): Promise<OutboxOp[]> {
  return db().outbox.where("status").anyOf("pending", "error").toArray();
}

export async function markOp(clientOpId: string, status: OutboxOp["status"], error?: string) {
  await db().outbox.update(clientOpId, { status, error });
  window.dispatchEvent(new Event("turkana-outbox"));
}

export async function statusCounts(): Promise<{ pending: number; conflict: number }> {
  const d = db();
  const pending = await d.outbox.where("status").anyOf("pending", "error").count();
  const conflict = await d.outbox.where("status").equals("conflict").count();
  return { pending, conflict };
}
