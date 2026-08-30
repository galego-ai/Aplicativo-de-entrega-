import { withSupabase } from "npm:@supabase/server@1.4.1";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });

    const role = String(ctx.userClaims!.appMetadata?.clickfood_role ?? "");
    if (!["SUPER_ADMIN", "ADMIN", "SUPPORT"].includes(role)) {
      return Response.json({ error: "ADMIN_REQUIRED" }, { status: 403 });
    }

    const [healthResult, paymentResult, payoutResult, ticketResult] = await Promise.all([
      ctx.supabaseAdmin.schema("private").rpc("admin_operational_health"),
      ctx.supabaseAdmin
        .from("payment_provider_configs")
        .select("provider,display_name,environment,enabled,credentials_configured,supported_methods,updated_at")
        .eq("provider", "EFI")
        .maybeSingle(),
      ctx.supabaseAdmin
        .from("payout_provider_configs")
        .select("provider,display_name,environment,enabled,credentials_configured,automatic_processing,validated_at,updated_at")
        .eq("provider", "EFI_PIX_SEND")
        .maybeSingle(),
      ctx.supabaseAdmin
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .in("status", ["OPEN", "IN_PROGRESS"])
        .in("priority", ["HIGH", "CRITICAL"]),
    ]);

    if (healthResult.error) {
      return Response.json({ error: "HEALTH_CHECK_FAILED" }, { status: 500 });
    }

    return Response.json({
      health: healthResult.data,
      providers: {
        payments: paymentResult.data ?? null,
        payouts: payoutResult.data ?? null,
      },
      criticalSupportTickets: ticketResult.count ?? 0,
    });
  }),
};
