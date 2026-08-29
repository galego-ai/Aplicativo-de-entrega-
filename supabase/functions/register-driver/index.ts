import { withSupabase } from "npm:@supabase/server@1.4.1";

type RegisterDriverRequest = {
  cityId: string;
  vehicleType: "MOTORCYCLE" | "CAR" | "BICYCLE" | "OTHER";
  brand?: string;
  model?: string;
  plate?: string;
  year?: number;
};

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });

    let body: RegisterDriverRequest;
    try { body = await req.json(); } catch { return Response.json({ error: "INVALID_JSON" }, { status: 400 }); }
    if (!body.cityId || !["MOTORCYCLE", "CAR", "BICYCLE", "OTHER"].includes(body.vehicleType)) {
      return Response.json({ error: "CITY_AND_VEHICLE_REQUIRED" }, { status: 400 });
    }

    const userId = ctx.userClaims!.id;
    const { data: existing, error: existingError } = await ctx.supabaseAdmin.from("drivers").select("id,status").eq("user_id", userId).maybeSingle();
    if (existingError) return Response.json({ error: "DRIVER_LOOKUP_FAILED" }, { status: 500 });
    if (existing) return Response.json({ driver: existing, alreadyRegistered: true });

    const { data: city, error: cityError } = await ctx.supabaseAdmin.from("cities").select("id,active").eq("id", body.cityId).maybeSingle();
    if (cityError) return Response.json({ error: "CITY_LOOKUP_FAILED" }, { status: 500 });
    if (!city || !city.active) return Response.json({ error: "CITY_NOT_AVAILABLE" }, { status: 409 });

    const { data: driver, error: driverError } = await ctx.supabaseAdmin
      .from("drivers")
      .insert({ user_id: userId, city_id: body.cityId, status: "PENDING", online: false })
      .select("id,status,city_id")
      .single();
    if (driverError) return Response.json({ error: "DRIVER_CREATE_FAILED" }, { status: 500 });

    const { error: vehicleError } = await ctx.supabaseAdmin.from("driver_vehicles").insert({
      driver_id: driver.id,
      vehicle_type: body.vehicleType,
      brand: body.brand?.trim() || null,
      model: body.model?.trim() || null,
      plate: body.plate?.trim().toUpperCase() || null,
      year: body.year ?? null,
      active: true,
    });

    if (vehicleError) {
      await ctx.supabaseAdmin.from("drivers").delete().eq("id", driver.id);
      return Response.json({ error: "VEHICLE_CREATE_FAILED" }, { status: 500 });
    }

    await ctx.supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      action: "DRIVER_REGISTRATION_SUBMITTED",
      entity_type: "driver",
      entity_id: driver.id,
      after_data: { city_id: body.cityId, vehicle_type: body.vehicleType },
    });

    return Response.json({ driver, status: "PENDING" }, { status: 201 });
  }),
};