import { withSupabase } from "npm:@supabase/server@1.4.1";

type ReviewRow = {
  id: string;
  order_id: string;
  customer_id: string;
  store_id: string;
  driver_id: string | null;
  store_rating: number;
  driver_rating: number | null;
  delivery_rating: number | null;
  delivery_time_rating: number | null;
  taste_rating: number | null;
  temperature_rating: number | null;
  comment: string | null;
  created_at: string;
};

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });

    const role = String(ctx.userClaims!.appMetadata?.clickfood_role ?? "");
    if (!["SUPER_ADMIN", "ADMIN", "SUPPORT"].includes(role)) {
      return Response.json({ error: "ADMIN_REQUIRED" }, { status: 403 });
    }

    let body: { from?: string; to?: string } = {};
    try { body = await req.json(); } catch {}

    const from = body.from && !Number.isNaN(Date.parse(body.from)) ? body.from : null;
    const to = body.to && !Number.isNaN(Date.parse(body.to)) ? body.to : null;

    const pageSize = 1000;
    const reviews: ReviewRow[] = [];
    for (let offset = 0; ; offset += pageSize) {
      let query = ctx.supabaseAdmin
        .from("reviews")
        .select("id,order_id,customer_id,store_id,driver_id,store_rating,driver_rating,delivery_rating,delivery_time_rating,taste_rating,temperature_rating,comment,created_at")
        .order("created_at", { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (from) query = query.gte("created_at", from);
      if (to) query = query.lt("created_at", to);
      const { data, error } = await query;
      if (error) return Response.json({ error: "REVIEWS_READ_FAILED" }, { status: 500 });
      const batch = (data ?? []) as ReviewRow[];
      reviews.push(...batch);
      if (batch.length < pageSize) break;
    }

    if (!reviews.length) return Response.json({ reviews: [] });

    const storeIds = [...new Set(reviews.map((item) => item.store_id))];
    const orderIds = [...new Set(reviews.map((item) => item.order_id))];
    const customerIds = [...new Set(reviews.map((item) => item.customer_id))];
    const driverIds = [...new Set(reviews.map((item) => item.driver_id).filter((id): id is string => Boolean(id)))];
    const profileIds = [...new Set([...customerIds, ...driverIds])];

    const [storesResult, ordersResult, profilesResult] = await Promise.all([
      ctx.supabaseAdmin.from("stores").select("id,name").in("id", storeIds),
      ctx.supabaseAdmin.from("orders").select("id,order_number").in("id", orderIds),
      ctx.supabaseAdmin.from("profiles").select("id,full_name").in("id", profileIds),
    ]);

    if (storesResult.error || ordersResult.error || profilesResult.error) {
      return Response.json({ error: "REVIEWS_RELATIONS_READ_FAILED" }, { status: 500 });
    }

    const storeNames = new Map((storesResult.data ?? []).map((row) => [String(row.id), String(row.name ?? "Loja")]));
    const orderNumbers = new Map((ordersResult.data ?? []).map((row) => [String(row.id), Number(row.order_number ?? 0)]));
    const profileNames = new Map((profilesResult.data ?? []).map((row) => [String(row.id), String(row.full_name ?? "Usuário")]));

    return Response.json({
      reviews: reviews.map((item) => ({
        ...item,
        storeName: storeNames.get(item.store_id) ?? "Loja",
        orderNumber: orderNumbers.get(item.order_id) || null,
        customerName: profileNames.get(item.customer_id) ?? "Cliente",
        driverName: item.driver_id ? profileNames.get(item.driver_id) ?? "Entregador" : null,
      })),
    });
  }),
};
