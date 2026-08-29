import { withSupabase } from "npm:@supabase/server@1.4.1";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "GET" && req.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });

    const userId = ctx.userClaims!.id;
    const { data: driver, error: driverError } = await ctx.supabaseAdmin
      .from("drivers")
      .select("id,status")
      .eq("user_id", userId)
      .maybeSingle();
    if (driverError) return Response.json({ error: "DRIVER_LOOKUP_FAILED" }, { status: 500 });
    if (!driver) return Response.json({ delivery: null });

    const { data: delivery, error: deliveryError } = await ctx.supabaseAdmin
      .from("deliveries")
      .select("id,order_id,status,driver_earning,pickup_at,delivered_at")
      .eq("driver_id", driver.id)
      .not("status", "in", "(DELIVERED,DELIVERY_CANCELLED)")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (deliveryError) return Response.json({ error: "DELIVERY_LOOKUP_FAILED" }, { status: 500 });
    if (!delivery) return Response.json({ delivery: null });

    const { data: order, error: orderError } = await ctx.supabaseAdmin
      .from("orders")
      .select("id,order_number,store_id,address_id,status")
      .eq("id", delivery.order_id)
      .single();
    if (orderError) return Response.json({ error: "ORDER_LOOKUP_FAILED" }, { status: 500 });

    const [{ data: store }, { data: address }] = await Promise.all([
      ctx.supabaseAdmin.from("stores").select("id,name,latitude,longitude").eq("id", order.store_id).single(),
      order.address_id
        ? ctx.supabaseAdmin.from("customer_addresses").select("id,street,number,complement,district,reference,latitude,longitude").eq("id", order.address_id).single()
        : Promise.resolve({ data: null }),
    ]);

    return Response.json({
      delivery: {
        id: delivery.id,
        status: delivery.status,
        earning: Number(delivery.driver_earning),
        orderNumber: order.order_number,
        orderStatus: order.status,
        pickup: {
          storeName: store?.name ?? "Loja CLICK-FOOD",
          latitude: store?.latitude == null ? null : Number(store.latitude),
          longitude: store?.longitude == null ? null : Number(store.longitude),
        },
        destination: address ? {
          street: address.street,
          number: address.number,
          complement: address.complement,
          district: address.district,
          reference: address.reference,
          latitude: address.latitude == null ? null : Number(address.latitude),
          longitude: address.longitude == null ? null : Number(address.longitude),
        } : null,
      },
    });
  }),
};