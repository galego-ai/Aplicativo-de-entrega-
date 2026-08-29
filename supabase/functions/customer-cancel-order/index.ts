import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body = { orderId: string; reason: string };

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
    let body: Body;
    try { body = await req.json(); } catch { return Response.json({ error: "INVALID_JSON" }, { status: 400 }); }
    const reason = body.reason?.trim();
    if (!body.orderId || !reason) return Response.json({ error: "ORDER_AND_REASON_REQUIRED" }, { status: 400 });
    const userId = ctx.userClaims!.id;

    const { data: order, error: lookupError } = await ctx.supabaseAdmin
      .from("orders")
      .select("id,customer_id,store_id,status,payment_status")
      .eq("id", body.orderId)
      .maybeSingle();
    if (lookupError) return Response.json({ error: "ORDER_LOOKUP_FAILED" }, { status: 500 });
    if (!order || order.customer_id !== userId) return Response.json({ error: "ORDER_NOT_FOUND" }, { status: 404 });

    const cancellable = ["PENDING_PAYMENT", "WAITING_STORE", "ACCEPTED", "PREPARING", "READY", "WAITING_DRIVER"];
    if (!cancellable.includes(order.status)) {
      return Response.json({ error: "CANCELLATION_REQUIRES_SUPPORT", currentStatus: order.status }, { status: 409 });
    }
    if (["PAID", "PARTIALLY_REFUNDED"].includes(order.payment_status)) {
      return Response.json({ error: "PAID_ORDER_REQUIRES_REFUND_FLOW" }, { status: 409 });
    }

    const { data: updatedOrder, error: transitionError } = await ctx.supabaseAdmin.rpc("transition_order_atomic", {
      p_order_id: order.id,
      p_expected_status: order.status,
      p_next_status: "CANCELLED",
      p_actor_id: userId,
      p_reason: reason.slice(0, 500),
    });
    if (transitionError) return Response.json({ error: "ORDER_STATUS_CHANGED" }, { status: 409 });

    const { data: delivery } = await ctx.supabaseAdmin.from("deliveries").select("id,driver_id,status").eq("order_id", order.id).maybeSingle();
    if (delivery && !delivery.driver_id && !["DELIVERED", "DELIVERY_CANCELLED"].includes(delivery.status)) {
      await Promise.all([
        ctx.supabaseAdmin.from("deliveries").update({ status: "DELIVERY_CANCELLED", updated_at: new Date().toISOString() }).eq("id", delivery.id),
        ctx.supabaseAdmin.from("delivery_offers").update({ status: "EXPIRED", responded_at: new Date().toISOString() }).eq("delivery_id", delivery.id).eq("status", "PENDING"),
      ]);
    }

    const { data: members } = await ctx.supabaseAdmin.from("store_memberships").select("user_id").eq("store_id", order.store_id).eq("active", true);
    const recipients = [...new Set((members ?? []).map((m) => m.user_id))];
    if (recipients.length) await ctx.supabaseAdmin.from("notifications").insert(recipients.map((memberId) => ({ user_id: memberId, notification_type: "ORDER_CANCELLED", title: "Pedido cancelado pelo cliente", body: reason.slice(0, 160), data: { orderId: order.id } })));

    return Response.json({ order: updatedOrder });
  }),
};
