import { withSupabase } from "npm:@supabase/server@1.4.1";

type Action = "START_TO_STORE" | "ARRIVED_STORE" | "CONFIRM_PICKUP" | "START_TO_CUSTOMER" | "ARRIVED_CUSTOMER" | "CONFIRM_DELIVERY";
type ActionBody = { deliveryId: string; action: Action; code?: string };

async function deriveCode(secret: string, deliveryId: string, kind: "PICKUP" | "DELIVERY") {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${kind}:${deliveryId}`));
  const bytes = new Uint8Array(signature);
  const value = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return String(value % 10000).padStart(4, "0");
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });

    let body: ActionBody;
    try { body = await req.json(); } catch { return Response.json({ error: "INVALID_JSON" }, { status: 400 }); }
    const validActions: Action[] = ["START_TO_STORE", "ARRIVED_STORE", "CONFIRM_PICKUP", "START_TO_CUSTOMER", "ARRIVED_CUSTOMER", "CONFIRM_DELIVERY"];
    if (!body.deliveryId || !validActions.includes(body.action)) return Response.json({ error: "INVALID_DELIVERY_ACTION" }, { status: 400 });

    const userId = ctx.userClaims!.id;
    const { data: driver, error: driverError } = await ctx.supabaseAdmin.from("drivers").select("id,status").eq("user_id", userId).maybeSingle();
    if (driverError) return Response.json({ error: "DRIVER_LOOKUP_FAILED" }, { status: 500 });
    if (!driver || driver.status !== "ACTIVE") return Response.json({ error: "DRIVER_NOT_ACTIVE" }, { status: 403 });

    const { data: delivery, error: deliveryError } = await ctx.supabaseAdmin.from("deliveries").select("id,driver_id,status").eq("id", body.deliveryId).maybeSingle();
    if (deliveryError) return Response.json({ error: "DELIVERY_LOOKUP_FAILED" }, { status: 500 });
    if (!delivery || delivery.driver_id !== driver.id) return Response.json({ error: "DELIVERY_ACCESS_DENIED" }, { status: 403 });

    if (body.action === "CONFIRM_PICKUP" || body.action === "CONFIRM_DELIVERY") {
      if (!/^\d{4}$/.test(body.code ?? "")) return Response.json({ error: "FOUR_DIGIT_CODE_REQUIRED" }, { status: 400 });
      const secret = Deno.env.get("DELIVERY_CODE_SECRET") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!secret || secret.length < 32) return Response.json({ error: "DELIVERY_CODE_SECRET_NOT_CONFIGURED" }, { status: 500 });
      const expected = await deriveCode(secret, delivery.id, body.action === "CONFIRM_PICKUP" ? "PICKUP" : "DELIVERY");
      if (body.code !== expected) {
        await ctx.supabaseAdmin.from("audit_logs").insert({ actor_id: userId, action: "DELIVERY_CODE_REJECTED", entity_type: "delivery", entity_id: delivery.id, after_data: { kind: body.action === "CONFIRM_PICKUP" ? "PICKUP" : "DELIVERY" } });
        return Response.json({ error: "INVALID_DELIVERY_CODE" }, { status: 422 });
      }
    }

    let rpcName: string;
    let params: Record<string, unknown>;
    if (body.action === "CONFIRM_PICKUP") {
      rpcName = "confirm_pickup_atomic"; params = { p_delivery_id: delivery.id, p_driver_id: driver.id };
    } else if (body.action === "START_TO_CUSTOMER") {
      rpcName = "start_customer_route_atomic"; params = { p_delivery_id: delivery.id, p_driver_id: driver.id };
    } else if (body.action === "CONFIRM_DELIVERY") {
      rpcName = "confirm_delivery_atomic"; params = { p_delivery_id: delivery.id, p_driver_id: driver.id };
    } else {
      const transition = body.action === "START_TO_STORE" ? ["DRIVER_ASSIGNED", "DRIVER_TO_STORE"] : body.action === "ARRIVED_STORE" ? ["DRIVER_TO_STORE", "DRIVER_AT_STORE"] : ["DRIVER_TO_CUSTOMER", "DRIVER_AT_CUSTOMER"];
      rpcName = "transition_delivery_atomic";
      params = { p_delivery_id: delivery.id, p_expected_status: transition[0], p_next_status: transition[1], p_driver_id: driver.id };
    }

    const { data: updated, error: actionError } = await ctx.supabaseAdmin.rpc(rpcName, params);
    if (actionError) {
      const conflict = /STATUS|TRANSITION|NOT_AT|NOT_CONFIRMED|MISMATCH/.test(actionError.message ?? "");
      return Response.json({ error: conflict ? "DELIVERY_STATUS_CHANGED" : "DELIVERY_ACTION_FAILED" }, { status: conflict ? 409 : 500 });
    }
    return Response.json({ delivery: updated });
  }),
};