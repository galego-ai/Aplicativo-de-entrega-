import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body = {
  storeId: string;
  description?: string;
  phone?: string;
  minimumOrder?: number;
  averagePreparationTime?: number;
  latitude?: number;
  longitude?: number;
};

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
    let body: Body;
    try { body = await req.json(); } catch { return Response.json({ error: "INVALID_JSON" }, { status: 400 }); }
    if (!body.storeId) return Response.json({ error: "STORE_ID_REQUIRED" }, { status: 400 });

    const userId = ctx.userClaims!.id;
    const platformRole = String(ctx.userClaims!.appMetadata?.clickfood_role ?? "");
    const isAdmin = ["SUPER_ADMIN", "ADMIN"].includes(platformRole);
    if (!isAdmin) {
      const { data: membership, error } = await ctx.supabaseAdmin
        .from("store_memberships")
        .select("role")
        .eq("store_id", body.storeId)
        .eq("user_id", userId)
        .eq("active", true)
        .maybeSingle();
      if (error) return Response.json({ error: "MEMBERSHIP_LOOKUP_FAILED" }, { status: 500 });
      if (!membership || !["OWNER", "MANAGER"].includes(membership.role)) return Response.json({ error: "STORE_ACCESS_DENIED" }, { status: 403 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.description !== undefined) patch.description = body.description.trim().slice(0, 1000) || null;
    if (body.phone !== undefined) patch.phone = body.phone.trim().slice(0, 30) || null;
    if (body.minimumOrder !== undefined) {
      if (!Number.isFinite(body.minimumOrder) || body.minimumOrder < 0 || body.minimumOrder > 100000) return Response.json({ error: "INVALID_MINIMUM_ORDER" }, { status: 400 });
      patch.minimum_order = Math.round(body.minimumOrder * 100) / 100;
    }
    if (body.averagePreparationTime !== undefined) {
      if (!Number.isInteger(body.averagePreparationTime) || body.averagePreparationTime < 1 || body.averagePreparationTime > 300) return Response.json({ error: "INVALID_PREPARATION_TIME" }, { status: 400 });
      patch.average_preparation_time = body.averagePreparationTime;
    }
    if (body.latitude !== undefined || body.longitude !== undefined) {
      if (!Number.isFinite(body.latitude) || !Number.isFinite(body.longitude) || Math.abs(body.latitude!) > 90 || Math.abs(body.longitude!) > 180) return Response.json({ error: "INVALID_COORDINATES" }, { status: 400 });
      patch.latitude = body.latitude;
      patch.longitude = body.longitude;
    }

    const { data: store, error } = await ctx.supabaseAdmin
      .from("stores")
      .update(patch)
      .eq("id", body.storeId)
      .select("id,name,description,phone,minimum_order,average_preparation_time,latitude,longitude,status")
      .single();
    if (error) return Response.json({ error: "STORE_UPDATE_FAILED" }, { status: 500 });

    await ctx.supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      action: "STORE_SETTINGS_UPDATED",
      entity_type: "store",
      entity_id: body.storeId,
      after_data: { fields: Object.keys(patch).filter((key) => key !== "updated_at") },
    });
    return Response.json({ store });
  }),
};
