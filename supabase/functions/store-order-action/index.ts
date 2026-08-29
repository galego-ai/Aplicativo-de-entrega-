import { withSupabase } from "npm:@supabase/server@1.4.1";

type ActionBody = {
  orderId: string;
  action: "ACCEPT" | "REJECT" | "START_PREPARING" | "MARK_READY" | "CANCEL";
  reason?: string;
};

const transitionByAction = {
  ACCEPT: ["WAITING_STORE", "ACCEPTED"],
  REJECT: ["WAITING_STORE", "REJECTED"],
  START_PREPARING: ["ACCEPTED", "PREPARING"],
  MARK_READY: ["PREPARING", "READY"],
} as const;

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });

    let body: ActionBody;
    try { body = await req.json(); } catch { return Response.json({ error: "INVALID_JSON" }, { status: 400 }); }
    if (!body.orderId || !body.action) return Response.json({ error: "ORDER_AND_ACTION_REQUIRED" }, { status: 400 });

    const userId = ctx.userClaims!.id;
    const role = String(ctx.userClaims!.appMetadata?.clickfood_role ?? "");
    const isAdmin = ["SUPER_ADMIN", "ADMIN", "SUPPORT"].includes(role);

    const { data: order, error: orderError } = await ctx.supabaseAdmin
      .from("orders")
      .select("id,store_id,status,payment_status,delivery_type")
      .eq("id", body.orderId)
      .maybeSingle();

    if (orderError) return Response.json({ error: "ORDER_LOOKUP_FAILED" }, { status: 500 });
    if (!order) return Response.json({ error: "ORDER_NOT_FOUND" }, { status: 404 });

    if (!isAdmin) {
      const { data: membership } = await ctx.supabaseAdmin
        .from("store_memberships")
        .select("role")
        .eq("store_id", order.store_id)
        .eq("user_id", userId)
        .eq("active", true)
        .maybeSingle();
      if (!membership || !["OWNER", "MANAGER", "KITCHEN", "EXPEDITION"].includes(membership.role)) {
        return Response.json({ error: "STORE_ACTION_DENIED" }, { status: 403 });
      }
    }

    if (["REJECT", "CANCEL"].includes(body.action) && !body.reason?.trim()) {
      return Response.json({ error: "REASON_REQUIRED" }, { status: 400 });
    }

    let expected: string;
    let next: string;
    if (body.action === "CANCEL") {
      expected = order.status;
      next = "CANCELLED";
      if (!["WAITING_STORE", "ACCEPTED", "PREPARING", "READY", "WAITING_DRIVER", "DRIVER_ASSIGNED"].includes(expected)) {
        return Response.json({ error: "ORDER_CANNOT_BE_CANCELLED" }, { status: 409 });
      }
    } else {
      [expected, next] = transitionByAction[body.action];
      if (order.status !== expected) return Response.json({ error: "ORDER_STATUS_CHANGED", currentStatus: order.status }, { status: 409 });
    }

    const { data: updatedOrder, error: transitionError } = await ctx.supabaseAdmin.rpc("transition_order_atomic", {
      p_order_id: order.id,
      p_expected_status: expected,
      p_next_status: next,
      p_actor_id: userId,
      p_reason: body.reason?.trim() ?? null,
    });

    if (transitionError) {
      const conflict = transitionError.message?.includes("STATUS") || transitionError.message?.includes("TRANSITION");
      return Response.json({ error: conflict ? "ORDER_STATUS_CHANGED" : "ORDER_ACTION_FAILED" }, { status: conflict ? 409 : 500 });
    }

    if (next === "READY" && order.delivery_type === "DELIVERY") {
      await ctx.supabaseAdmin.from("notifications").insert({
        user_id: null,
        notification_type: "INTERNAL_DISPATCH_REQUIRED",
        title: "Pedido pronto para despacho",
        body: `Pedido ${order.id} pronto`,
        data: { orderId: order.id },
      }).then(() => undefined).catch(() => undefined);
    }

    return Response.json({ order: updatedOrder });
  }),
};
