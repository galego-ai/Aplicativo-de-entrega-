import { withSupabase } from "npm:@supabase/server@1.4.1";

type ChatType = "CUSTOMER_STORE" | "CUSTOMER_DRIVER" | "STORE_DRIVER";
type Body = { orderId: string; type: ChatType };

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
    let body: Body;
    try { body = await req.json(); } catch { return Response.json({ error: "INVALID_JSON" }, { status: 400 }); }
    if (!body.orderId || !["CUSTOMER_STORE", "CUSTOMER_DRIVER", "STORE_DRIVER"].includes(body.type)) return Response.json({ error: "INVALID_CHAT_REQUEST" }, { status: 400 });

    const userId = ctx.userClaims!.id;
    const platformRole = String(ctx.userClaims!.appMetadata?.clickfood_role ?? "");
    const isAdmin = ["SUPER_ADMIN", "ADMIN", "SUPPORT"].includes(platformRole);

    const { data: order, error: orderError } = await ctx.supabaseAdmin
      .from("orders")
      .select("id,customer_id,store_id,status")
      .eq("id", body.orderId)
      .maybeSingle();
    if (orderError) return Response.json({ error: "ORDER_LOOKUP_FAILED" }, { status: 500 });
    if (!order) return Response.json({ error: "ORDER_NOT_FOUND" }, { status: 404 });

    const [{ data: memberships }, { data: delivery }] = await Promise.all([
      ctx.supabaseAdmin.from("store_memberships").select("user_id,role").eq("store_id", order.store_id).eq("active", true),
      ctx.supabaseAdmin.from("deliveries").select("driver_id,status").eq("order_id", order.id).maybeSingle(),
    ]);
    const storeUserIds = (memberships ?? []).filter((m) => ["OWNER", "MANAGER", "EXPEDITION"].includes(m.role)).map((m) => m.user_id);
    let driverUserId: string | null = null;
    if (delivery?.driver_id) {
      const { data: driver } = await ctx.supabaseAdmin.from("drivers").select("user_id").eq("id", delivery.driver_id).maybeSingle();
      driverUserId = driver?.user_id ?? null;
    }

    const isCustomer = order.customer_id === userId;
    const isStore = storeUserIds.includes(userId);
    const isDriver = driverUserId === userId;
    const allowed = body.type === "CUSTOMER_STORE" ? (isCustomer || isStore || isAdmin)
      : body.type === "CUSTOMER_DRIVER" ? (isCustomer || isDriver || isAdmin)
      : (isStore || isDriver || isAdmin);
    if (!allowed) return Response.json({ error: "CHAT_ACCESS_DENIED" }, { status: 403 });
    if ((body.type === "CUSTOMER_DRIVER" || body.type === "STORE_DRIVER") && !driverUserId) return Response.json({ error: "DRIVER_NOT_ASSIGNED" }, { status: 409 });
    if (!order.customer_id && body.type !== "STORE_DRIVER") return Response.json({ error: "CUSTOMER_NOT_AVAILABLE" }, { status: 409 });

    let { data: conversation, error: conversationError } = await ctx.supabaseAdmin
      .from("conversations")
      .select("id,order_id,conversation_type,status")
      .eq("order_id", order.id)
      .eq("conversation_type", body.type)
      .maybeSingle();
    if (conversationError) return Response.json({ error: "CHAT_LOOKUP_FAILED" }, { status: 500 });

    if (!conversation) {
      const created = await ctx.supabaseAdmin.from("conversations").insert({ order_id: order.id, conversation_type: body.type, status: "OPEN" }).select("id,order_id,conversation_type,status").single();
      if (created.error) {
        const existing = await ctx.supabaseAdmin.from("conversations").select("id,order_id,conversation_type,status").eq("order_id", order.id).eq("conversation_type", body.type).maybeSingle();
        if (!existing.data) return Response.json({ error: "CHAT_CREATE_FAILED" }, { status: 500 });
        conversation = existing.data;
      } else conversation = created.data;
    }

    const participantIds = body.type === "CUSTOMER_STORE"
      ? [order.customer_id, ...storeUserIds]
      : body.type === "CUSTOMER_DRIVER"
        ? [order.customer_id, driverUserId]
        : [...storeUserIds, driverUserId];
    const uniqueParticipants = [...new Set(participantIds.filter(Boolean) as string[])];
    if (uniqueParticipants.length) {
      const { error: participantError } = await ctx.supabaseAdmin.from("conversation_participants").upsert(uniqueParticipants.map((id) => ({ conversation_id: conversation!.id, user_id: id })), { onConflict: "conversation_id,user_id" });
      if (participantError) return Response.json({ error: "CHAT_PARTICIPANT_FAILED" }, { status: 500 });
    }

    return Response.json({ conversation, driverAvailable: Boolean(driverUserId) });
  }),
};
