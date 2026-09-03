import { withSupabase } from "npm:@supabase/server@1.4.1";

type DispatchRequest = { orderId: string };
type Candidate = {
  driverId: string;
  distanceToStoreKm: number;
  activeDeliveries: number;
  rating: number;
  acceptanceRate: number;
  score: number;
};

const toRad = (value: number) => (value * Math.PI) / 180;
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function scoreCandidate(input: Omit<Candidate, "score">) {
  const proximity = Math.max(0, 100 - input.distanceToStoreKm * 12);
  const workload = Math.max(0, 100 - input.activeDeliveries * 35);
  const rating = input.rating * 20;
  return proximity * 0.55 + workload * 0.2 + rating * 0.15 + input.acceptanceRate * 0.1;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });

    let body: DispatchRequest;
    try { body = await req.json(); } catch { return Response.json({ error: "INVALID_JSON" }, { status: 400 }); }
    if (!body.orderId) return Response.json({ error: "ORDER_ID_REQUIRED" }, { status: 400 });

    const userId = ctx.userClaims!.id;
    const role = String(ctx.userClaims!.appMetadata?.clickfood_role ?? "");
    const isAdmin = ["SUPER_ADMIN", "ADMIN", "SUPPORT"].includes(role);

    const { data: order, error: orderError } = await ctx.supabaseAdmin
      .from("orders")
      .select("id,store_id,address_id,delivery_type,status,delivery_fee")
      .eq("id", body.orderId)
      .maybeSingle();

    if (orderError) return Response.json({ error: "ORDER_LOOKUP_FAILED" }, { status: 500 });
    if (!order || order.delivery_type !== "DELIVERY") return Response.json({ error: "DELIVERY_ORDER_NOT_FOUND" }, { status: 404 });
    if (!["READY", "WAITING_DRIVER"].includes(order.status)) return Response.json({ error: "ORDER_NOT_READY_FOR_DISPATCH" }, { status: 409 });

    if (!isAdmin) {
      const { data: membership } = await ctx.supabaseAdmin
        .from("store_memberships")
        .select("id")
        .eq("store_id", order.store_id)
        .eq("user_id", userId)
        .eq("active", true)
        .maybeSingle();
      if (!membership) return Response.json({ error: "STORE_ACCESS_DENIED" }, { status: 403 });
    }

    const [{ data: store }, { data: address }] = await Promise.all([
      ctx.supabaseAdmin.from("stores").select("id,city_id,latitude,longitude").eq("id", order.store_id).single(),
      ctx.supabaseAdmin.from("customer_addresses").select("latitude,longitude").eq("id", order.address_id).single(),
    ]);

    if (!store || !address || store.latitude == null || store.longitude == null || address.latitude == null || address.longitude == null) {
      return Response.json({ error: "DELIVERY_COORDINATES_REQUIRED" }, { status: 422 });
    }

    const [{ data: pricing }, { data: dispatch }, { data: storeDelivery }] = await Promise.all([
      ctx.supabaseAdmin.from("city_delivery_pricing").select("driver_base_earning,driver_per_km,driver_minimum_earning").eq("city_id", store.city_id).maybeSingle(),
      ctx.supabaseAdmin.from("delivery_dispatch_settings").select("offer_timeout_seconds,initial_radius_km,max_radius_km,batch_size").eq("city_id", store.city_id).maybeSingle(),
      ctx.supabaseAdmin.from("store_delivery_settings").select("driver_call_radius_km").eq("store_id", order.store_id).maybeSingle(),
    ]);

    const cityInitialRadius = Number(dispatch?.initial_radius_km ?? 5);
    const cityMaxRadius = Number(dispatch?.max_radius_km ?? 20);
    const requestedStoreRadius = Number(storeDelivery?.driver_call_radius_km ?? cityInitialRadius);
    const effectiveStoreRadius = Math.max(0.1, Math.min(requestedStoreRadius, cityMaxRadius));

    const config = {
      base: Number(pricing?.driver_base_earning ?? 4),
      perKm: Number(pricing?.driver_per_km ?? 1),
      minimum: Number(pricing?.driver_minimum_earning ?? 6),
      timeout: Number(dispatch?.offer_timeout_seconds ?? 15),
      initialRadius: Math.min(cityInitialRadius, effectiveStoreRadius),
      maxRadius: effectiveStoreRadius,
      batchSize: Number(dispatch?.batch_size ?? 3),
    };

    const storePoint = { lat: Number(store.latitude), lng: Number(store.longitude) };
    const customerPoint = { lat: Number(address.latitude), lng: Number(address.longitude) };
    const deliveryDistanceKm = haversineKm(storePoint, customerPoint);

    let { data: delivery } = await ctx.supabaseAdmin
      .from("deliveries")
      .select("id,driver_id,status")
      .eq("order_id", order.id)
      .maybeSingle();

    if (delivery?.driver_id) return Response.json({ error: "DELIVERY_ALREADY_ASSIGNED", deliveryId: delivery.id }, { status: 409 });
    if (!delivery) {
      const created = await ctx.supabaseAdmin
        .from("deliveries")
        .insert({ order_id: order.id, status: "SEARCHING_DRIVER", delivery_fee: Number(order.delivery_fee), driver_earning: 0 })
        .select("id,driver_id,status")
        .single();
      if (created.error) {
        const existing = await ctx.supabaseAdmin.from("deliveries").select("id,driver_id,status").eq("order_id", order.id).maybeSingle();
        if (!existing.data || existing.data.driver_id) return Response.json({ error: "DELIVERY_CREATE_FAILED" }, { status: 409 });
        delivery = existing.data;
      } else delivery = created.data;
    }

    const nowIso = new Date().toISOString();
    await ctx.supabaseAdmin.from("delivery_offers")
      .update({ status: "EXPIRED", responded_at: nowIso })
      .eq("delivery_id", delivery!.id)
      .eq("status", "PENDING")
      .lte("expires_at", nowIso);

    const { data: drivers, error: driversError } = await ctx.supabaseAdmin
      .from("drivers")
      .select("id,rating,acceptance_rate")
      .eq("city_id", store.city_id)
      .eq("status", "ACTIVE")
      .eq("online", true);

    if (driversError) return Response.json({ error: "DRIVER_SEARCH_FAILED" }, { status: 500 });
    if (!drivers?.length) return Response.json({ error: "NO_DRIVERS_ONLINE" }, { status: 409 });

    const driverIds = drivers.map((driver) => driver.id);
    const [{ data: locations }, { data: activeDeliveries }, { data: pendingOffers }] = await Promise.all([
      ctx.supabaseAdmin.from("driver_locations").select("driver_id,latitude,longitude,recorded_at").in("driver_id", driverIds),
      ctx.supabaseAdmin.from("deliveries").select("driver_id,status").in("driver_id", driverIds).not("status", "in", "(DELIVERED,DELIVERY_CANCELLED)"),
      ctx.supabaseAdmin.from("delivery_offers").select("driver_id").eq("delivery_id", delivery!.id).eq("status", "PENDING").gt("expires_at", nowIso),
    ]);

    const activeCount = new Map<string, number>();
    for (const item of activeDeliveries ?? []) if (item.driver_id) activeCount.set(item.driver_id, (activeCount.get(item.driver_id) ?? 0) + 1);
    const pending = new Set((pendingOffers ?? []).map((offer) => offer.driver_id));
    const locationMap = new Map((locations ?? []).map((location) => [location.driver_id, location]));

    const candidates: Candidate[] = [];
    for (const driver of drivers) {
      if (pending.has(driver.id)) continue;
      const location = locationMap.get(driver.id);
      if (!location) continue;
      if (Date.now() - new Date(location.recorded_at).getTime() > 5 * 60 * 1000) continue;
      const pickupDistance = haversineKm(storePoint, { lat: Number(location.latitude), lng: Number(location.longitude) });
      if (pickupDistance > config.maxRadius) continue;
      const base = {
        driverId: driver.id,
        distanceToStoreKm: pickupDistance,
        activeDeliveries: activeCount.get(driver.id) ?? 0,
        rating: Number(driver.rating),
        acceptanceRate: Number(driver.acceptance_rate),
      };
      candidates.push({ ...base, score: scoreCandidate(base) });
    }

    let pool = candidates.filter((candidate) => candidate.distanceToStoreKm <= config.initialRadius);
    if (pool.length === 0) pool = candidates;
    pool.sort((a, b) => b.score - a.score || a.distanceToStoreKm - b.distanceToStoreKm);
    const selected = pool.slice(0, config.batchSize);

    if (!selected.length) return Response.json({ error: "NO_ELIGIBLE_DRIVERS", searchRadiusKm: config.maxRadius }, { status: 409 });

    const expiresAt = new Date(Date.now() + config.timeout * 1000).toISOString();
    const offersPayload = selected.map((candidate) => ({
      delivery_id: delivery!.id,
      driver_id: candidate.driverId,
      expires_at: expiresAt,
      offered_earning: money(Math.max(config.minimum, config.base + (candidate.distanceToStoreKm + deliveryDistanceKm) * config.perKm)),
    }));

    const { data: offers, error: offersError } = await ctx.supabaseAdmin
      .from("delivery_offers")
      .insert(offersPayload)
      .select("id,driver_id,offered_earning,expires_at");

    if (offersError) return Response.json({ error: "DELIVERY_OFFER_CREATE_FAILED" }, { status: 500 });

    await Promise.all([
      ctx.supabaseAdmin.from("deliveries").update({ status: "OFFER_SENT", updated_at: new Date().toISOString() }).eq("id", delivery!.id),
      ctx.supabaseAdmin.from("orders").update({ status: "WAITING_DRIVER", updated_at: new Date().toISOString() }).eq("id", order.id).eq("status", "READY"),
    ]);

    const userRows = await ctx.supabaseAdmin.from("drivers").select("id,user_id").in("id", selected.map((candidate) => candidate.driverId));
    const usersByDriver = new Map((userRows.data ?? []).map((driver) => [driver.id, driver.user_id]));
    if (offers?.length) {
      await ctx.supabaseAdmin.from("notifications").insert(offers.map((offer) => ({
        user_id: usersByDriver.get(offer.driver_id),
        notification_type: "DELIVERY_OFFER",
        title: "Nova entrega disponível",
        body: `Ganho estimado: R$ ${Number(offer.offered_earning).toFixed(2).replace(".", ",")}`,
        data: { offerId: offer.id, deliveryId: delivery!.id, expiresAt: offer.expires_at },
      })).filter((notification) => Boolean(notification.user_id)));
    }

    return Response.json({ deliveryId: delivery!.id, offers, candidatesEvaluated: candidates.length, searchRadiusKm: config.maxRadius });
  }),
};
