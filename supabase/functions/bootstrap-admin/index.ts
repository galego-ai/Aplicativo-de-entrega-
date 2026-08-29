import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body = { code: string };

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });

    let body: Body;
    try { body = await req.json(); } catch { return Response.json({ error: "INVALID_JSON" }, { status: 400 }); }
    const code = body.code?.trim();
    if (!code || code.length < 20) return Response.json({ error: "BOOTSTRAP_CODE_REQUIRED" }, { status: 400 });

    const userId = ctx.userClaims!.id;
    const codeHash = await sha256(code);
    const { data: bootstrap, error: codeError } = await ctx.supabaseAdmin
      .from("admin_bootstrap_codes")
      .select("id,expires_at,used_at,used_by")
      .eq("code_hash", codeHash)
      .maybeSingle();

    if (codeError) return Response.json({ error: "BOOTSTRAP_LOOKUP_FAILED" }, { status: 500 });
    if (!bootstrap) return Response.json({ error: "INVALID_BOOTSTRAP_CODE" }, { status: 403 });
    if (bootstrap.used_at) return Response.json({ error: "BOOTSTRAP_CODE_ALREADY_USED" }, { status: 409 });
    if (new Date(bootstrap.expires_at).getTime() <= Date.now()) return Response.json({ error: "BOOTSTRAP_CODE_EXPIRED" }, { status: 410 });

    const { data: users, error: listError } = await ctx.supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) return Response.json({ error: "ADMIN_CHECK_FAILED" }, { status: 500 });
    const existingSuperAdmin = users.users.find((user) => user.app_metadata?.clickfood_role === "SUPER_ADMIN");
    if (existingSuperAdmin && existingSuperAdmin.id !== userId) {
      return Response.json({ error: "SUPER_ADMIN_ALREADY_CONFIGURED" }, { status: 409 });
    }

    const currentUser = users.users.find((user) => user.id === userId);
    const appMetadata = { ...(currentUser?.app_metadata ?? {}), clickfood_role: "SUPER_ADMIN" };
    const { error: updateError } = await ctx.supabaseAdmin.auth.admin.updateUserById(userId, { app_metadata: appMetadata });
    if (updateError) return Response.json({ error: "ADMIN_PROMOTION_FAILED" }, { status: 500 });

    const { error: consumeError } = await ctx.supabaseAdmin
      .from("admin_bootstrap_codes")
      .update({ used_at: new Date().toISOString(), used_by: userId })
      .eq("id", bootstrap.id)
      .is("used_at", null);
    if (consumeError) return Response.json({ error: "BOOTSTRAP_CONSUME_FAILED" }, { status: 500 });

    await ctx.supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      action: "SUPER_ADMIN_BOOTSTRAPPED",
      entity_type: "profile",
      entity_id: userId,
      after_data: { clickfood_role: "SUPER_ADMIN" },
    });

    return Response.json({ ok: true, role: "SUPER_ADMIN", refreshSession: true });
  }),
};
