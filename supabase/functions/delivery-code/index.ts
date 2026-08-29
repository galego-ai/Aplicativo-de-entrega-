import { withSupabase } from "npm:@supabase/server@1.4.1";

type CodeRequest = {
  deliveryId: string;
  kind: "PICKUP" | "DELIVERY";
};

async function deriveCode(secret: string, deliveryId: string, kind: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${kind}:${deliveryId}`),
  );
  const bytes = new Uint8Array(signature);
  const value = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return String(value % 10000).padStart(4, "0");
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });

    let body: CodeRequest;
    try { body = await req.json(); } catch { return Response.json({ error: "INVALID_JSON" }, { status: 400 }); }
    if (!body.deliveryId || !["PICKUP", "DELIVERY"].includes(body.kind)) {
      return Response.json({ error: "INVALID_CODE_REQUEST" }, { status: 400 });
    }

    const secret = Deno.env.get("DELIVERY_CODE_SECRET");
    if (!secret || secret.length < 32) return Response.json({ error: "DELIVERY_CODE_SECRET_NOT_CONFIGURED" }, { status: 500 });

    const userId = ctx.userClaims!.id;
    const adminRole = String(ctx.userClaims!.appMetadata?.clickfood_role ?? "");
    const isAdmin = ["SUPER_ADMIN", "ADMIN", "SUPPORT"].includes(adminRole);

    const { data: delivery, error } = await ctx.supabaseAdmin
      .from("deliveries")
      .select("id,status,order_id,orders!inner(customer_id,store_id,status)")
      .eq("id", body.deliveryId)
      .maybeSingle();

    if (error) return Response.json({ error: "DELIVERY_LOOKUP_FAILED" }, { status: 500 });
    if (!delivery) return Response.json({ error: "DELIVERY_NOT_FOUND" }, { status: 404 });

    const order = Array.isArray(delivery.orders) ? delivery.orders[0] : delivery.orders;
    if (!order) return Response.json({ error: "ORDER_NOT_FOUND" }, { status: 404 });

    if (body.kind === "PICKUP") {
      if (!isAdmin) {
        const { data: membership } = await ctx.supabaseAdmin
          .from("store_memberships")
          .select("role")
          .eq("store_id", order.store_id)
          .eq("user_id", userId)
          .eq("active", true)
          .maybeSingle();
        if (!membership || !["OWNER", "MANAGER", "EXPEDITION"].includes(membership.role)) {
          return Response.json({ error: "PICKUP_CODE_ACCESS_DENIED" }, { status: 403 });
        }
      }
      if (!["DRIVER_ASSIGNED", "DRIVER_TO_STORE", "DRIVER_AT_STORE"].includes(delivery.status)) {
        return Response.json({ error: "PICKUP_CODE_NOT_AVAILABLE" }, { status: 409 });
      }
    } else {
      if (!isAdmin && order.customer_id !== userId) {
        return Response.json({ error: "DELIVERY_CODE_ACCESS_DENIED" }, { status: 403 });
      }
      if (!["PICKUP_CONFIRMED", "DRIVER_TO_CUSTOMER", "DRIVER_AT_CUSTOMER"].includes(delivery.status)) {
        return Response.json({ error: "DELIVERY_CODE_NOT_AVAILABLE" }, { status: 409 });
      }
    }

    const code = await deriveCode(secret, delivery.id, body.kind);
    return Response.json({ deliveryId: delivery.id, kind: body.kind, code });
  }),
};
