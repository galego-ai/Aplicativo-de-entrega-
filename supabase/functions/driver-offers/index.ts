import { withSupabase } from "npm:@supabase/server@1.4.1";

const toRad = (value: number) => (value * Math.PI) / 180;
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round((2 * r * Math.asin(Math.sqrt(h))) * 100) / 100;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "GET" && req.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });

    const userId = ctx.userClaims!.id;
    const { data: driver, error: driverError } = await ctx.supabaseAdmin
      .from("drivers")
      .select("id,status,online")
      .eq("user_id", userId)
      .maybeSingle();
    if (driverError) return Response.json({ error: "DRIVER_LOOKUP_FAILED" }, { status: 500 });
    if (!driver || driver.status !== "ACTIVE") return Response.json({ offers: [] });

    const { data: offers, error: offerError } = await ctx.supabaseAdmin
      .from("delivery_offers")
      .select("id,delivery_id,offered_earning,expires_at,status")
      .eq("driver_id", driver.id)
      .eq("status", "PENDING")
      .gt("expires_at", new Date().toISOString())
      .order("offered_at", { ascending: false });
    if (offerError) return Response.json({ error: "OFFERS_LOOKUP_FAILED" }, { status: 500 });
    if (!offers?.length) return Response.json({ offers: [] });

    const deliveryIds = offers.map((offer) => offer.delivery_id);
    const { data: deliveries, error: deliveryError } = await ctx.supabaseAdmin
      .from("deliveries")
      .select("id,order_id")
      .in("id", deliveryIds);
    if (deliveryError) return Response.json({ error: "DELIVERY_LOOKUP_FAILED" }, { status: 500 });

    const orderIds = (deliveries ?? []).map((delivery) => delivery.order_id);
    const { data: orders, error: orderError } = await ctx.supabaseAdmin
      .from("orders")
      .select("id,store_id,address_id")
      .in("id", orderIds);
    if (orderError) return Response.json({ error: "ORDER_LOOKUP_FAILED" }, { status: 500 });

    const storeIds = [...new Set((orders ?? []).map((order) => order.store_id))];
    const addressIds = [...new Set((orders ?? []).map((order) => order.address_id).filter(Boolean))];
    const [{ data: stores }, { data: addresses }, { data: location }] = await Promise.all([
      ctx.supabaseAdmin.from("stores").select("id,name,latitude,longitude").in("id", storeIds),
      addressIds.length ? ctx.supabaseAdmin.from("customer_addresses").select("id,latitude,longitude").in("id", addressIds) : Promise.resolve({ data: [] }),
      ctx.supabaseAdmin.from("driver_locations").select("latitude,longitude").eq("driver_id", driver.id).maybeSingle(),
    ]);

    const deliveryMap = new Map((deliveries ?? []).map((delivery) => [delivery.id, delivery]));
    const orderMap = new Map((orders ?? []).map((order) => [order.id, order]));
    const storeMap = new Map((stores ?? []).map((store) => [store.id, store]));
    const addressMap = new Map((addresses ?? []).map((address) => [address.id, address]));

    const result = offers.map((offer) => {
      const delivery = deliveryMap.get(offer.delivery_id);
      const order = delivery ? orderMap.get(delivery.order_id) : null;
      const store = order ? storeMap.get(order.store_id) : null;
      const address = order?.address_id ? addressMap.get(order.address_id) : null;
      const storePoint = store?.latitude != null && store?.longitude != null ? { lat: Number(store.latitude), lng: Number(store.longitude) } : null;
      const customerPoint = address?.latitude != null && address?.longitude != null ? { lat: Number(address.latitude), lng: Number(address.longitude) } : null;
      const driverPoint = location?.latitude != null && location?.longitude != null ? { lat: Number(location.latitude), lng: Number(location.longitude) } : null;
      return {
        id: offer.id,
        deliveryId: offer.delivery_id,
        storeName: store?.name ?? "Loja CLICK-FOOD",
        pickupDistanceKm: storePoint && driverPoint ? haversineKm(driverPoint, storePoint) : null,
        deliveryDistanceKm: storePoint && customerPoint ? haversineKm(storePoint, customerPoint) : null,
        earning: Number(offer.offered_earning),
        expiresAt: offer.expires_at,
      };
    });

    return Response.json({ offers: result });
  }),
};