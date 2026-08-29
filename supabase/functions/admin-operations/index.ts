import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body =
  | { action: "CREATE_STORE"; legalName: string; tradeName?: string; document?: string; email?: string; phone?: string; storeName: string; slug: string; cityId?: string; description?: string }
  | { action: "STORE_STATUS"; storeId: string; status: "ACTIVE" | "SUSPENDED" | "BLOCKED" }
  | { action: "DRIVER_STATUS"; driverId: string; status: "ACTIVE" | "BLOCKED" | "PENDING" }
  | { action: "REISSUE_STORE_CODE"; storeId: string }
  | { action: "CREATE_CITY"; name: string; state: string };

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createCode(prefix: string) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `${prefix}-${[...bytes].map((byte) => alphabet[byte % alphabet.length]).join("")}`;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
    const role = String(ctx.userClaims!.appMetadata?.clickfood_role ?? "");
    if (!["SUPER_ADMIN", "ADMIN"].includes(role)) return Response.json({ error: "ADMIN_REQUIRED" }, { status: 403 });

    let body: Body;
    try { body = await req.json(); } catch { return Response.json({ error: "INVALID_JSON" }, { status: 400 }); }
    const actorId = ctx.userClaims!.id;

    if (body.action === "CREATE_CITY") {
      const name = body.name?.trim();
      const state = body.state?.trim().toUpperCase();
      if (!name || !/^[A-Z]{2}$/.test(state)) return Response.json({ error: "CITY_AND_STATE_REQUIRED" }, { status: 400 });
      const { data: existing, error: lookupError } = await ctx.supabaseAdmin
        .from("cities")
        .select("id,name,state,active")
        .ilike("name", name)
        .eq("state", state)
        .limit(1)
        .maybeSingle();
      if (lookupError) return Response.json({ error: "CITY_LOOKUP_FAILED" }, { status: 500 });
      if (existing) {
        if (!existing.active) await ctx.supabaseAdmin.from("cities").update({ active: true }).eq("id", existing.id);
        return Response.json({ city: { ...existing, active: true }, alreadyExists: true });
      }
      const { data: city, error: cityError } = await ctx.supabaseAdmin
        .from("cities")
        .insert({ name, state, country: "BR", active: true })
        .select("id,name,state,active")
        .single();
      if (cityError) return Response.json({ error: "CITY_CREATE_FAILED" }, { status: 500 });
      const [pricingResult, dispatchResult] = await Promise.all([
        ctx.supabaseAdmin.from("city_delivery_pricing").upsert({ city_id: city.id, driver_base_earning: 4, driver_per_km: 1, driver_minimum_earning: 6 }, { onConflict: "city_id" }),
        ctx.supabaseAdmin.from("delivery_dispatch_settings").upsert({ city_id: city.id, offer_timeout_seconds: 15, initial_radius_km: 5, max_radius_km: 20, batch_size: 3 }, { onConflict: "city_id" }),
      ]);
      if (pricingResult.error || dispatchResult.error) {
        await ctx.supabaseAdmin.from("cities").delete().eq("id", city.id);
        return Response.json({ error: "CITY_CONFIGURATION_FAILED" }, { status: 500 });
      }
      await ctx.supabaseAdmin.from("audit_logs").insert({ actor_id: actorId, action: "CITY_CREATED", entity_type: "city", entity_id: city.id, after_data: { name, state } });
      return Response.json({ city }, { status: 201 });
    }

    if (body.action === "CREATE_STORE") {
      const storeName = body.storeName?.trim();
      const legalName = body.legalName?.trim() || storeName;
      const slug = body.slug?.trim().toLowerCase();
      if (!storeName || !legalName || !slug) return Response.json({ error: "STORE_FIELDS_REQUIRED" }, { status: 400 });
      const onboardingCode = createCode("CF-LOJA");
      const codeHash = await sha256(onboardingCode);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: storeId, error } = await ctx.supabaseAdmin.rpc("admin_create_store_atomic", {
        p_legal_name: legalName,
        p_trade_name: body.tradeName?.trim() || storeName,
        p_document: body.document?.trim() || "",
        p_email: body.email?.trim() || "",
        p_phone: body.phone?.trim() || "",
        p_store_name: storeName,
        p_slug: slug,
        p_city_id: body.cityId || null,
        p_description: body.description?.trim() || "",
        p_code_hash: codeHash,
        p_expires_at: expiresAt,
        p_created_by: actorId,
      });
      if (error) {
        const message = error.message ?? "";
        if (message.includes("SLUG_ALREADY_EXISTS")) return Response.json({ error: "SLUG_ALREADY_EXISTS" }, { status: 409 });
        return Response.json({ error: "STORE_CREATE_FAILED" }, { status: 500 });
      }
      const { data: store } = await ctx.supabaseAdmin.from("stores").select("id,name,slug,status,city_id").eq("id", storeId).single();
      return Response.json({ store, onboardingCode, expiresAt }, { status: 201 });
    }

    if (body.action === "STORE_STATUS") {
      if (!body.storeId || !["ACTIVE", "SUSPENDED", "BLOCKED"].includes(body.status)) return Response.json({ error: "INVALID_STORE_ACTION" }, { status: 400 });
      const { data: store, error } = await ctx.supabaseAdmin.from("stores").update({ status: body.status, updated_at: new Date().toISOString() }).eq("id", body.storeId).select("id,name,status").single();
      if (error) return Response.json({ error: "STORE_UPDATE_FAILED" }, { status: 500 });
      await ctx.supabaseAdmin.from("audit_logs").insert({ actor_id: actorId, action: "STORE_STATUS_CHANGED", entity_type: "store", entity_id: body.storeId, after_data: { status: body.status } });
      return Response.json({ store });
    }

    if (body.action === "DRIVER_STATUS") {
      if (!body.driverId || !["ACTIVE", "BLOCKED", "PENDING"].includes(body.status)) return Response.json({ error: "INVALID_DRIVER_ACTION" }, { status: 400 });
      const patch: Record<string, unknown> = { status: body.status };
      if (body.status !== "ACTIVE") patch.online = false;
      const { data: driver, error } = await ctx.supabaseAdmin.from("drivers").update(patch).eq("id", body.driverId).select("id,user_id,status,online,rating,acceptance_rate").single();
      if (error) return Response.json({ error: "DRIVER_UPDATE_FAILED" }, { status: 500 });
      await ctx.supabaseAdmin.from("audit_logs").insert({ actor_id: actorId, action: "DRIVER_STATUS_CHANGED", entity_type: "driver", entity_id: body.driverId, after_data: { status: body.status } });
      return Response.json({ driver });
    }

    if (body.action === "REISSUE_STORE_CODE") {
      if (!body.storeId) return Response.json({ error: "STORE_ID_REQUIRED" }, { status: 400 });
      const { data: store } = await ctx.supabaseAdmin.from("stores").select("id").eq("id", body.storeId).maybeSingle();
      if (!store) return Response.json({ error: "STORE_NOT_FOUND" }, { status: 404 });
      const onboardingCode = createCode("CF-LOJA");
      const codeHash = await sha256(onboardingCode);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await ctx.supabaseAdmin.from("store_onboarding_codes").update({ expires_at: new Date().toISOString() }).eq("store_id", body.storeId).is("used_at", null);
      const { error } = await ctx.supabaseAdmin.from("store_onboarding_codes").insert({ store_id: body.storeId, code_hash: codeHash, expires_at: expiresAt, created_by: actorId });
      if (error) return Response.json({ error: "CODE_CREATE_FAILED" }, { status: 500 });
      return Response.json({ onboardingCode, expiresAt });
    }

    return Response.json({ error: "UNKNOWN_ACTION" }, { status: 400 });
  }),
};
