import { withSupabase } from "npm:@supabase/server@1.4.1";

type Ratings = { store: number; delivery: number; time: number; taste: number; temperature: number };
type Body = { orderId: string; ratings: Ratings; comment?: string };

function validRating(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });

    let body: Body;
    try { body = await req.json(); } catch { return Response.json({ error: "INVALID_JSON" }, { status: 400 }); }
    if (!body.orderId || !body.ratings) return Response.json({ error: "INVALID_REVIEW" }, { status: 400 });
    if (![body.ratings.store, body.ratings.delivery, body.ratings.time, body.ratings.taste, body.ratings.temperature].every(validRating)) {
      return Response.json({ error: "ALL_RATINGS_REQUIRED" }, { status: 400 });
    }

    const userId = ctx.userClaims!.id;
    const { data: order, error: orderError } = await ctx.supabaseAdmin
      .from("orders")
      .select("id,customer_id,store_id,status")
      .eq("id", body.orderId)
      .maybeSingle();
    if (orderError) return Response.json({ error: "ORDER_LOOKUP_FAILED" }, { status: 500 });
    if (!order || order.customer_id !== userId) return Response.json({ error: "ORDER_ACCESS_DENIED" }, { status: 403 });
    if (order.status !== "DELIVERED") return Response.json({ error: "ORDER_NOT_DELIVERED" }, { status: 409 });

    const { data: existing } = await ctx.supabaseAdmin.from("reviews").select("id").eq("order_id", order.id).maybeSingle();
    if (existing) return Response.json({ error: "ALREADY_REVIEWED" }, { status: 409 });

    const { data: delivery } = await ctx.supabaseAdmin.from("deliveries").select("driver_id").eq("order_id", order.id).maybeSingle();
    const comment = String(body.comment ?? "").trim().slice(0, 1200) || null;

    const { data: review, error: reviewError } = await ctx.supabaseAdmin.from("reviews").insert({
      order_id: order.id,
      customer_id: userId,
      store_id: order.store_id,
      driver_id: delivery?.driver_id ?? null,
      store_rating: Number(body.ratings.store),
      driver_rating: delivery?.driver_id ? Number(body.ratings.delivery) : null,
      delivery_rating: Number(body.ratings.delivery),
      delivery_time_rating: Number(body.ratings.time),
      taste_rating: Number(body.ratings.taste),
      temperature_rating: Number(body.ratings.temperature),
      comment,
    }).select("id,created_at").single();

    if (reviewError) {
      if (/duplicate|unique/i.test(reviewError.message ?? "")) return Response.json({ error: "ALREADY_REVIEWED" }, { status: 409 });
      return Response.json({ error: "REVIEW_CREATE_FAILED" }, { status: 500 });
    }

    if (delivery?.driver_id) {
      const { data: ratings } = await ctx.supabaseAdmin.from("reviews").select("driver_rating").eq("driver_id", delivery.driver_id).not("driver_rating", "is", null);
      const values = (ratings ?? []).map((item) => Number(item.driver_rating)).filter((value) => Number.isFinite(value) && value > 0);
      if (values.length) {
        const average = values.reduce((sum, value) => sum + value, 0) / values.length;
        await ctx.supabaseAdmin.from("drivers").update({ rating: Number(average.toFixed(2)) }).eq("id", delivery.driver_id);
      }
    }

    return Response.json({ review });
  }),
};
