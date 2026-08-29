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
    const code = body.code?.trim().toUpperCase();
    if (!code || !code.startsWith("CF-LOJA-")) return Response.json({ error: "INVALID_ONBOARDING_CODE" }, { status: 400 });
    const userId = ctx.userClaims!.id;
    const codeHash = await sha256(code);
    const { data: storeId, error } = await ctx.supabaseAdmin.rpc("claim_store_atomic", { p_code_hash: codeHash, p_user_id: userId });
    if (error) {
      const message = error.message ?? "";
      if (message.includes("CODE_ALREADY_USED")) return Response.json({ error: "CODE_ALREADY_USED" }, { status: 409 });
      if (message.includes("CODE_EXPIRED")) return Response.json({ error: "CODE_EXPIRED" }, { status: 410 });
      if (message.includes("CODE_NOT_FOUND")) return Response.json({ error: "CODE_NOT_FOUND" }, { status: 404 });
      return Response.json({ error: "STORE_CLAIM_FAILED" }, { status: 500 });
    }
    const { data: store } = await ctx.supabaseAdmin.from("stores").select("id,name,slug,status").eq("id", storeId).single();
    return Response.json({ store, role: "OWNER" });
  }),
};
