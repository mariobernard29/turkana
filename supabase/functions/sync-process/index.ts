// sync-process
// Procesa el outbox del POS offline. Aplica operaciones contra Supabase
// (fuente de verdad) de forma idempotente y marca conflictos para Manual Review.
import { adminClient } from "../_shared/supabase.ts";
import { handleOptions, json } from "../_shared/cors.ts";

type Op = {
  client_op_id: string;
  operation_type: string;
  payload: Record<string, unknown>;
  client_created_at: string;
};

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const { device_id, operations } = await req.json() as {
      device_id: string;
      operations: Op[];
    };
    const db = adminClient();
    const results: { client_op_id: string; status: string; error?: string }[] = [];

    for (const op of operations) {
      // 1. Registrar en sync_queue (idempotente por device_id + client_op_id).
      const { error: qErr } = await db.from("sync_queue").upsert({
        device_id,
        client_op_id: op.client_op_id,
        operation_type: op.operation_type,
        payload: op.payload,
        client_created_at: op.client_created_at,
        status: "pending",
      }, { onConflict: "device_id,client_op_id", ignoreDuplicates: true });

      // Si ya existía y estaba procesada, no reprocesar.
      const { data: queued } = await db.from("sync_queue")
        .select("status").eq("device_id", device_id)
        .eq("client_op_id", op.client_op_id).single();
      if (queued && queued.status === "synced") {
        results.push({ client_op_id: op.client_op_id, status: "synced" });
        continue;
      }

      try {
        await applyOperation(db, op);
        await db.from("sync_queue").update({ status: "synced", processed_at: new Date().toISOString() })
          .eq("device_id", device_id).eq("client_op_id", op.client_op_id);
        results.push({ client_op_id: op.client_op_id, status: "synced" });
      } catch (e) {
        const msg = String(e);
        // Colisión de inventario u otra → conflicto para revisión manual.
        const status = msg.includes("STOCK_INSUFICIENTE") ? "conflict" : "error";
        await db.from("sync_queue").update({ status, error: msg })
          .eq("device_id", device_id).eq("client_op_id", op.client_op_id);
        if (status === "conflict") {
          await db.from("notifications").insert({
            type: "sync_conflict",
            title: "Conflicto de sincronización",
            body: `Operación ${op.operation_type} requiere revisión manual`,
            data: { client_op_id: op.client_op_id, device_id },
            target_role: "gerente",
          });
        }
        results.push({ client_op_id: op.client_op_id, status, error: msg });
      }
      if (qErr) { /* upsert duplicado ignorado: ok */ }
    }

    return json({ results });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

async function applyOperation(db: ReturnType<typeof adminClient>, op: Op) {
  switch (op.operation_type) {
    case "customer.create": {
      const p = op.payload;
      await db.from("customers").upsert({
        full_name: p.full_name, email: p.email, phone: p.phone,
      }, { onConflict: "email" });
      break;
    }
    case "order.create": {
      const p = op.payload as {
        order: Record<string, unknown>;
        items: { variant_id: string; quantity: number; is_service?: boolean }[];
      };
      // Crear la orden (folio se autollena por trigger).
      const { data: order, error } = await db.from("orders")
        .insert({ ...p.order, channel: "pos" }).select("id, customer_id, subtotal_cents").single();
      if (error) throw new Error(error.message);

      for (const it of p.items) {
        await db.from("order_items").insert({ order_id: order.id, ...it });
        if (!it.is_service && it.variant_id) {
          // Descuenta del almacén tienda; lanza STOCK_INSUFICIENTE si choca.
          const { error: sErr } = await db.rpc("decrement_stock", {
            p_variant: it.variant_id, p_location_key: "tienda",
            p_qty: it.quantity, p_ref_type: "order", p_ref_id: order.id,
          });
          if (sErr) throw new Error(sErr.message);
        }
      }
      if (order.customer_id) {
        await db.rpc("credit_rewards", {
          p_customer: order.customer_id, p_order: order.id,
          p_subtotal_cents: order.subtotal_cents, p_channel: "pos",
        });
      }
      break;
    }
    case "layaway.payment": {
      const p = op.payload as { layaway_id: string; amount_cents: number; method: string };
      await db.from("layaway_payments").insert(p);
      break;
    }
    case "credit.payment": {
      const p = op.payload as { account_id: string; amount_cents: number };
      await db.from("credit_transactions").insert({
        account_id: p.account_id, type: "payment", amount_cents: p.amount_cents,
      });
      break;
    }
    default:
      throw new Error(`operation_type no soportado: ${op.operation_type}`);
  }
}
