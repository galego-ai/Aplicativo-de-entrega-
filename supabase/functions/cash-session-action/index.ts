import { withSupabase } from "npm:@supabase/server@1.4.1";

type CashAction = "STATUS" | "OPEN" | "CLOSE" | "SUPPLY" | "WITHDRAWAL" | "EXPENSE";
type Body = { action: CashAction; storeId: string; openingBalance?: number; countedCash?: number; amount?: number; reason?: string };

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
    let body: Body;
    try { body = await req.json(); } catch { return Response.json({ error: "INVALID_JSON" }, { status: 400 }); }
    if (!body.storeId || !["STATUS","OPEN","CLOSE","SUPPLY","WITHDRAWAL","EXPENSE"].includes(body.action)) return Response.json({ error: "INVALID_CASH_ACTION" }, { status: 400 });

    const userId = ctx.userClaims!.id;
    const adminRole = String(ctx.userClaims!.appMetadata?.clickfood_role ?? "");
    const isAdmin = ["SUPER_ADMIN","ADMIN","SUPPORT"].includes(adminRole);
    if (!isAdmin) {
      const { data: membership } = await ctx.supabaseAdmin.from("store_memberships").select("role").eq("store_id", body.storeId).eq("user_id", userId).eq("active", true).maybeSingle();
      if (!membership || !["OWNER","MANAGER","CASHIER"].includes(membership.role)) return Response.json({ error: "CASH_ACCESS_DENIED" }, { status: 403 });
    }

    let { data: register, error: registerError } = await ctx.supabaseAdmin.from("cash_registers").select("id,name").eq("store_id", body.storeId).eq("active", true).order("created_at").limit(1).maybeSingle();
    if (registerError) return Response.json({ error: "REGISTER_LOOKUP_FAILED" }, { status: 500 });
    if (!register && body.action === "OPEN") {
      const created = await ctx.supabaseAdmin.from("cash_registers").insert({ store_id: body.storeId, name: "Caixa 01", active: true }).select("id,name").single();
      if (created.error) return Response.json({ error: "REGISTER_CREATE_FAILED" }, { status: 500 });
      register = created.data;
    }
    if (!register) return Response.json({ register: null, session: null });

    const { data: openSession, error: sessionError } = await ctx.supabaseAdmin.from("cash_sessions").select("id,opening_balance,opened_at,status").eq("cash_register_id", register.id).eq("status", "OPEN").maybeSingle();
    if (sessionError) return Response.json({ error: "CASH_SESSION_LOOKUP_FAILED" }, { status: 500 });

    if (body.action === "STATUS") return Response.json({ register, session: openSession });

    if (body.action === "OPEN") {
      if (openSession) return Response.json({ error: "CASH_ALREADY_OPEN", session: openSession }, { status: 409 });
      const opening = Number(body.openingBalance ?? 0);
      if (!Number.isFinite(opening) || opening < 0) return Response.json({ error: "INVALID_OPENING_BALANCE" }, { status: 400 });
      const { data: session, error } = await ctx.supabaseAdmin.from("cash_sessions").insert({ cash_register_id: register.id, opened_by: userId, opening_balance: opening, status: "OPEN" }).select("id,opening_balance,opened_at,status").single();
      if (error) return Response.json({ error: "CASH_OPEN_FAILED" }, { status: 500 });
      return Response.json({ register, session }, { status: 201 });
    }

    if (!openSession) return Response.json({ error: "CASH_NOT_OPEN" }, { status: 409 });

    if (["SUPPLY","WITHDRAWAL","EXPENSE"].includes(body.action)) {
      const amount = Number(body.amount ?? 0);
      if (!Number.isFinite(amount) || amount <= 0 || !body.reason?.trim()) return Response.json({ error: "AMOUNT_AND_REASON_REQUIRED" }, { status: 400 });
      const { data: transaction, error } = await ctx.supabaseAdmin.from("cash_transactions").insert({ cash_session_id: openSession.id, transaction_type: body.action, amount, payment_method: "CASH", reason: body.reason.trim().slice(0, 500), created_by: userId }).select("id,transaction_type,amount,created_at").single();
      if (error) return Response.json({ error: "CASH_MOVEMENT_FAILED" }, { status: 500 });
      return Response.json({ transaction });
    }

    const countedCash = Number(body.countedCash);
    if (!Number.isFinite(countedCash) || countedCash < 0) return Response.json({ error: "COUNTED_CASH_REQUIRED" }, { status: 400 });
    const { data: transactions, error: txError } = await ctx.supabaseAdmin.from("cash_transactions").select("transaction_type,amount,payment_method").eq("cash_session_id", openSession.id);
    if (txError) return Response.json({ error: "CASH_TOTAL_LOOKUP_FAILED" }, { status: 500 });

    let expected = Number(openSession.opening_balance);
    for (const tx of transactions ?? []) {
      const amount = Number(tx.amount);
      if (tx.transaction_type === "SALE" && tx.payment_method === "CASH") expected += amount;
      else if (tx.transaction_type === "SUPPLY") expected += amount;
      else if (["WITHDRAWAL","EXPENSE"].includes(tx.transaction_type)) expected -= amount;
      else if (tx.transaction_type === "REFUND" && tx.payment_method === "CASH") expected -= amount;
    }
    expected = Math.round(expected * 100) / 100;
    const difference = Math.round((countedCash - expected) * 100) / 100;
    const { data: closed, error: closeError } = await ctx.supabaseAdmin.from("cash_sessions").update({ closed_by: userId, closing_balance: countedCash, expected_balance: expected, difference, closed_at: new Date().toISOString(), status: "CLOSED" }).eq("id", openSession.id).eq("status", "OPEN").select("id,closing_balance,expected_balance,difference,closed_at,status").single();
    if (closeError) return Response.json({ error: "CASH_CLOSE_FAILED" }, { status: 500 });
    return Response.json({ register, session: closed });
  }),
};