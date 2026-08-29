import { withSupabase } from "npm:@supabase/server@1.4.1";

type QuoteRequest = {
  storeId: string;
  addressId: string;
};

const toRad = (value: number) => (value * Math.PI) / 180;

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const earthRadiusKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h));
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
    }

    const userId = ctx.userClaims!.id;
    let body: QuoteRequest;

    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "INVALID_JSON" }, { status: 400 });
    }

    if (!body.storeId || !body.addressId) {
      return Response.json({ error: "STORE_AND_ADDRESS_REQUIRED" }, { status: 400 });
    }

    const [{ data: store, error: storeError }, { data: address, error: addressError }] = await Promise.all([
      ctx.supabaseAdmin
        .from("stores")
        .select("id,status,latitude,longitude")
        .eq("id", body.storeId)
        .maybeSingle(),
      ctx.supabaseAdmin
        .from("customer_addresses")
        .select("id,user_id,latitude,longitude")
        .eq("id", body.addressId)
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    if (storeError || addressError) {
      return Response.json({ error: "QUOTE_LOOKUP_FAILED" }, { status: 500 });
    }
    if (!store || store.status !== "ACTIVE") {
      return Response.json({ error: "STORE_UNAVAILABLE" }, { status: 409 });
    }
    if (!address) {
      return Response.json({ error: "ADDRESS_NOT_FOUND" }, { status: 404 });
    }
    if (store.latitude == null || store.longitude == null || address.latitude == null || address.longitude == null) {
      return Response.json({ error: "LOCATION_COORDINATES_REQUIRED" }, { status: 422 });
    }

    const { data: settings, error: settingsError } = await ctx.supabaseAdmin
      .from("store_delivery_settings")
      .select("pricing_model,fixed_fee,base_fee,per_km_fee,minimum_fee,max_radius_km,clickfood_delivery_enabled,own_delivery_enabled")
      .eq("store_id", body.storeId)
      .maybeSingle();

    if (settingsError) {
      return Response.json({ error: "DELIVERY_SETTINGS_FAILED" }, { status: 500 });
    }
    if (!settings || (!settings.clickfood_delivery_enabled && !settings.own_delivery_enabled)) {
      return Response.json({ error: "DELIVERY_DISABLED" }, { status: 409 });
    }

    const distanceKm = Math.round(
      haversineKm(
        { lat: Number(store.latitude), lng: Number(store.longitude) },
        { lat: Number(address.latitude), lng: Number(address.longitude) },
      ) * 100,
    ) / 100;

    if (settings.max_radius_km != null && distanceKm > Number(settings.max_radius_km)) {
      return Response.json({ error: "OUTSIDE_DELIVERY_RADIUS", distanceKm }, { status: 422 });
    }

    let fee = 0;
    const model = settings.pricing_model as "FREE" | "FIXED" | "DISTANCE";

    if (model === "FIXED") {
      fee = Number(settings.fixed_fee);
    } else if (model === "DISTANCE") {
      const { data: range } = await ctx.supabaseAdmin
        .from("delivery_fee_ranges")
        .select("fee")
        .eq("store_id", body.storeId)
        .eq("active", true)
        .lte("min_km", distanceKm)
        .gt("max_km", distanceKm)
        .order("min_km", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (range) {
        fee = Number(range.fee);
      } else {
        fee = Math.max(
          Number(settings.minimum_fee),
          Number(settings.base_fee) + distanceKm * Number(settings.per_km_fee),
        );
      }
    }

    fee = money(fee);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { data: quote, error: quoteError } = await ctx.supabaseAdmin
      .from("delivery_quotes")
      .insert({
        store_id: body.storeId,
        customer_id: userId,
        address_id: body.addressId,
        distance_km: distanceKm,
        fee,
        provider: "HAVERSINE_V1",
        expires_at: expiresAt,
      })
      .select("id,distance_km,fee,expires_at")
      .single();

    if (quoteError) {
      return Response.json({ error: "QUOTE_CREATE_FAILED" }, { status: 500 });
    }

    return Response.json({ quote });
  }),
};
