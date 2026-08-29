import { withSupabase } from "npm:@supabase/server@1.4.1";

type AcceptRequest = { offerId: string };

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
    }

    let body: AcceptRequest;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "INVALID_JSON" }, { status: 400 });
    }

    if (!body.offerId) {
      return Response.json({ error: "OFFER_ID_REQUIRED" }, { status: 400 });
    }

    const userId = ctx.userClaims!.id;
    const { data: driver, error: driverError } = await ctx.supabaseAdmin
      .from("drivers")
      .select("id,status,online")
      .eq("user_id", userId)
      .maybeSingle();

    if (driverError) return Response.json({ error: "DRIVER_LOOKUP_FAILED" }, { status: 500 });
    if (!driver || driver.status !== "ACTIVE" || !driver.online) {
      return Response.json({ error: "DRIVER_NOT_AVAILABLE" }, { status: 409 });
    }

    const { data: deliveryId, error } = await ctx.supabaseAdmin.rpc("accept_delivery_offer_atomic", {
      p_offer_id: body.offerId,
      p_driver_id: driver.id,
    });

    if (error) {
      const message = error.message ?? "";
      const conflict = [
        "OFFER_NOT_PENDING",
        "OFFER_EXPIRED",
        "DELIVERY_ALREADY_ASSIGNED",
        "OFFER_DRIVER_MISMATCH",
      ].some((code) => message.includes(code));
      return Response.json({ error: conflict ? "DELIVERY_NO_LONGER_AVAILABLE" : "ACCEPT_DELIVERY_FAILED" }, { status: conflict ? 409 : 500 });
    }

    const { data: delivery } = await ctx.supabaseAdmin
      .from("deliveries")
      .select("id,order_id,status,driver_id,delivery_fee,driver_earning")
      .eq("id", deliveryId)
      .single();

    return Response.json({ delivery });
  }),
};
