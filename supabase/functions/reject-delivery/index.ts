import { withSupabase } from "npm:@supabase/server@1.4.1";

type RejectRequest = { offerId: string; reason?: string };

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
    let body: RejectRequest;
    try { body = await req.json(); } catch { return Response.json({ error: "INVALID_JSON" }, { status: 400 }); }
    if (!body.offerId) return Response.json({ error: "OFFER_ID_REQUIRED" }, { status: 400 });

    const userId = ctx.userClaims!.id;
    const { data: driver, error: driverError } = await ctx.supabaseAdmin.from("drivers").select("id").eq("user_id", userId).maybeSingle();
    if (driverError) return Response.json({ error: "DRIVER_LOOKUP_FAILED" }, { status: 500 });
    if (!driver) return Response.json({ error: "DRIVER_NOT_REGISTERED" }, { status: 404 });

    const { data: offer, error: offerError } = await ctx.supabaseAdmin
      .from("delivery_offers")
      .select("id,status,expires_at")
      .eq("id", body.offerId)
      .eq("driver_id", driver.id)
      .maybeSingle();
    if (offerError) return Response.json({ error: "OFFER_LOOKUP_FAILED" }, { status: 500 });
    if (!offer) return Response.json({ error: "OFFER_NOT_FOUND" }, { status: 404 });
    if (offer.status !== "PENDING") return Response.json({ error: "OFFER_NOT_PENDING" }, { status: 409 });

    const { error: updateError } = await ctx.supabaseAdmin
      .from("delivery_offers")
      .update({ status: "REJECTED", responded_at: new Date().toISOString() })
      .eq("id", offer.id)
      .eq("status", "PENDING");
    if (updateError) return Response.json({ error: "OFFER_REJECT_FAILED" }, { status: 500 });

    if (body.reason?.trim()) {
      await ctx.supabaseAdmin.from("audit_logs").insert({
        actor_id: userId,
        action: "DELIVERY_OFFER_REJECTED",
        entity_type: "delivery_offer",
        entity_id: offer.id,
        after_data: { reason: body.reason.trim().slice(0, 250) },
      });
    }
    return Response.json({ rejected: true });
  }),
};