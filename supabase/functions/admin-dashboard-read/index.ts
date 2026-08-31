import { withSupabase } from "npm:@supabase/server@1.4.1";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });

    const role = String(ctx.userClaims!.appMetadata?.clickfood_role ?? "");
    if (!["SUPER_ADMIN", "ADMIN", "SUPPORT"].includes(role)) {
      return Response.json({ error: "ADMIN_REQUIRED" }, { status: 403 });
    }

    const [
      metricsResult,
      storesResult,
      driversResult,
      citiesResult,
      ordersResult,
      plansResult,
      invoicesResult,
      financeResult,
      bonusRulesResult,
      bonusRewardsResult,
      auditResult,
      pricingResult,
      dispatchResult,
    ] = await Promise.all([
      ctx.supabaseAdmin.rpc("admin_dashboard_metrics"),
      ctx.supabaseAdmin.from("stores").select("id,name,slug,status,city_id,created_at,cities(name,state)").order("created_at", { ascending: false }).limit(300),
      ctx.supabaseAdmin.from("drivers").select("id,user_id,status,online,rating,acceptance_rate,city_id,cities(name,state)").order("created_at", { ascending: false }).limit(300),
      ctx.supabaseAdmin.from("cities").select("id,name,state").eq("active", true).order("state").order("name"),
      ctx.supabaseAdmin.from("orders").select("id,order_number,total,status,payment_status,source,delivery_type,created_at,stores(name)").order("created_at", { ascending: false }).limit(100),
      ctx.supabaseAdmin.from("plans").select("*").order("created_at", { ascending: false }),
      ctx.supabaseAdmin.from("invoices").select("id,amount,due_date,status,reference_month,stores(name)").order("due_date", { ascending: false }).limit(100),
      ctx.supabaseAdmin.from("financial_transactions").select("id,transaction_type,direction,amount,status,created_at,stores(name)").order("created_at", { ascending: false }).limit(100),
      ctx.supabaseAdmin.from("bonus_rules").select("id,name,metric,target,period,points_awarded,active").order("created_at", { ascending: false }),
      ctx.supabaseAdmin.from("bonus_rewards").select("id,name,points_cost,reward_type,reward_value,requires_approval,active").order("created_at", { ascending: false }),
      ctx.supabaseAdmin.from("audit_logs").select("id,action,entity_type,entity_id,created_at,after_data").order("created_at", { ascending: false }).limit(100),
      ctx.supabaseAdmin.from("city_delivery_pricing").select("*"),
      ctx.supabaseAdmin.from("delivery_dispatch_settings").select("*"),
    ]);

    const results = [
      metricsResult,
      storesResult,
      driversResult,
      citiesResult,
      ordersResult,
      plansResult,
      invoicesResult,
      financeResult,
      bonusRulesResult,
      bonusRewardsResult,
      auditResult,
      pricingResult,
      dispatchResult,
    ];
    if (results.some((result) => result.error)) {
      return Response.json({ error: "ADMIN_DASHBOARD_READ_FAILED" }, { status: 500 });
    }

    const drivers = (driversResult.data ?? []) as Array<{ user_id: string } & Record<string, unknown>>;
    const userIds = [...new Set(drivers.map((driver) => driver.user_id).filter(Boolean))];
    let profileNames = new Map<string, string>();
    if (userIds.length) {
      const profilesResult = await ctx.supabaseAdmin.from("profiles").select("id,full_name").in("id", userIds);
      if (profilesResult.error) return Response.json({ error: "ADMIN_DRIVER_PROFILES_READ_FAILED" }, { status: 500 });
      profileNames = new Map((profilesResult.data ?? []).map((profile) => [String(profile.id), String(profile.full_name ?? "Entregador")]));
    }

    return Response.json({
      metrics: metricsResult.data ?? {},
      stores: storesResult.data ?? [],
      drivers: drivers.map((driver) => ({ ...driver, profileName: profileNames.get(driver.user_id) ?? "Entregador" })),
      cities: citiesResult.data ?? [],
      orders: ordersResult.data ?? [],
      plans: plansResult.data ?? [],
      invoices: invoicesResult.data ?? [],
      finance: financeResult.data ?? [],
      bonusRules: bonusRulesResult.data ?? [],
      bonusRewards: bonusRewardsResult.data ?? [],
      audit: auditResult.data ?? [],
      pricing: pricingResult.data ?? [],
      dispatch: dispatchResult.data ?? [],
    });
  }),
};
