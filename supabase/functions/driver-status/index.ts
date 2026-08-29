import { withSupabase } from "npm:@supabase/server@1.4.1";

type StatusRequest = { online: boolean };

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });

    let body: StatusRequest;
    try { body = await req.json(); } catch { return Response.json({ error: "INVALID_JSON" }, { status: 400 }); }
    if (typeof body.online !== "boolean") return Response.json({ error: "ONLINE_BOOLEAN_REQUIRED" }, { status: 400 });

    const userId = ctx.userClaims!.id;
    const { data: driver, error: driverError } = await ctx.supabaseAdmin
      .from("drivers")
      .select("id,status,online")
      .eq("user_id", userId)
      .maybeSingle();

    if (driverError) return Response.json({ error: "DRIVER_LOOKUP_FAILED" }, { status: 500 });
    if (!driver) return Response.json({ error: "DRIVER_NOT_REGISTERED" }, { status: 404 });
    if (driver.status !== "ACTIVE") return Response.json({ error: "DRIVER_NOT_ACTIVE", status: driver.status }, { status: 409 });

    if (!body.online) {
      const { count, error: deliveryError } = await ctx.supabaseAdmin
        .from("deliveries")
        .select("id", { count: "exact", head: true })
        .eq("driver_id", driver.id)
        .not("status", "in", "(DELIVERED,DELIVERY_CANCELLED)");
      if (deliveryError) return Response.json({ error: "ACTIVE_DELIVERY_LOOKUP_FAILED" }, { status: 500 });
      if ((count ?? 0) > 0) return Response.json({ error: "ACTIVE_DELIVERY_PREVENTS_OFFLINE" }, { status: 409 });
    }

    const { data: updated, error: updateError } = await ctx.supabaseAdmin
      .from("drivers")
      .update({ online: body.online })
      .eq("id", driver.id)
      .select("id,status,online,rating,acceptance_rate")
      .single();

    if (updateError) return Response.json({ error: "DRIVER_STATUS_UPDATE_FAILED" }, { status: 500 });
    return Response.json({ driver: updated });
  }),
};