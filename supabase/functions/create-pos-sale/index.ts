import { withSupabase } from "npm:@supabase/server@1.4.1";

type Item = { productId: string; quantity: number };
type Payment = { method: "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "CASH" | "WALLET" | "OTHER"; amount: number };
type Body = { storeId: string; cashSessionId: string; items: Item[]; payments: Payment[]; discount?: number };
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
    let body: Body;
    try { body = await req.json(); } catch { return Response.json({ error: "INVALID_JSON" }, { status: 400 }); }
    if (!body.storeId || !body.cashSessionId || !Array.isArray(body.items) || !body.items.length || !Array.isArray(body.payments) || !body.payments.length) return Response.json({ error: "INVALID_POS_SALE" }, { status: 400 });

    const userId = ctx.userClaims!.id;
    const adminRole = String(ctx.userClaims!.appMetadata?.clickfood_role ?? "");
    const isAdmin = ["SUPER_ADMIN","ADMIN","SUPPORT"].includes(adminRole);
    let membershipRole: string | null = null;
    if (!isAdmin) {
      const { data: membership } = await ctx.supabaseAdmin.from("store_memberships").select("role").eq("store_id", body.storeId).eq("user_id", userId).eq("active", true).maybeSingle();
      membershipRole = membership?.role ? String(membership.role) : null;
      if (!membershipRole || !["OWNER","MANAGER","CASHIER"].includes(membershipRole)) return Response.json({ error: "POS_ACCESS_DENIED" }, { status: 403 });
    }

    const allowedMethods = new Set(["PIX","CREDIT_CARD","DEBIT_CARD","CASH","WALLET","OTHER"]);
    if (body.payments.some((payment) => !allowedMethods.has(payment.method) || !Number.isFinite(Number(payment.amount)) || Number(payment.amount) < 0)) return Response.json({ error: "INVALID_PAYMENT" }, { status: 400 });

    const productIds = [...new Set(body.items.map((item) => item.productId))];
    const { data: products, error: productError } = await ctx.supabaseAdmin.from("products").select("id,name,price,promotional_price,active,available_pos").eq("store_id", body.storeId).in("id", productIds);
    if (productError) return Response.json({ error: "PRODUCT_LOOKUP_FAILED" }, { status: 500 });
    if (!products || products.length !== productIds.length) return Response.json({ error: "PRODUCT_NOT_FOUND" }, { status: 409 });
    const productMap = new Map(products.map((product) => [product.id, product]));

    let subtotal = 0;
    const snapshotItems = [];
    for (const requested of body.items) {
      const product = productMap.get(requested.productId);
      if (!product || !product.active || !product.available_pos) return Response.json({ error: "PRODUCT_NOT_AVAILABLE" }, { status: 409 });
      if (!Number.isInteger(requested.quantity) || requested.quantity < 1 || requested.quantity > 999) return Response.json({ error: "INVALID_QUANTITY" }, { status: 400 });
      const unitPrice = Number(product.promotional_price ?? product.price);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) return Response.json({ error: "INVALID_PRODUCT_PRICE" }, { status: 409 });
      const lineTotal = money(unitPrice * requested.quantity);
      subtotal += lineTotal;
      snapshotItems.push({ product_id: product.id, name: product.name, quantity: requested.quantity, unit_price: money(unitPrice), total_price: lineTotal, options: [] });
    }
    subtotal = money(subtotal);

    const rawDiscount = Number(body.discount ?? 0);
    if (!Number.isFinite(rawDiscount) || rawDiscount < 0) return Response.json({ error: "INVALID_DISCOUNT" }, { status: 400 });
    if (rawDiscount > subtotal + 0.009) return Response.json({ error: "DISCOUNT_EXCEEDS_SUBTOTAL", subtotal }, { status: 409 });
    const discount = money(rawDiscount);
    if (!isAdmin && membershipRole === "CASHIER" && discount > 0) return Response.json({ error: "DISCOUNT_REQUIRES_MANAGER" }, { status: 403 });

    const total = money(subtotal - discount);
    const paymentTotal = money(body.payments.reduce((sum, payment) => sum + Number(payment.amount), 0));
    if (Math.abs(paymentTotal - total) > 0.009) return Response.json({ error: "PAYMENT_TOTAL_MISMATCH", total }, { status: 409 });

    const { data: orderId, error: saleError } = await ctx.supabaseAdmin.rpc("create_pos_sale_atomic", {
      p_store_id: body.storeId,
      p_actor_id: userId,
      p_cash_session_id: body.cashSessionId,
      p_subtotal: subtotal,
      p_discount: discount,
      p_total: total,
      p_items: snapshotItems,
      p_payments: body.payments.map((payment) => ({ method: payment.method, amount: money(Number(payment.amount)) })),
    });

    if (saleError) {
      const message = saleError.message ?? "";
      if (message.includes("INSUFFICIENT_STOCK")) return Response.json({ error: "INSUFFICIENT_STOCK" }, { status: 409 });
      if (message.includes("CASH_SESSION_NOT_OPEN")) return Response.json({ error: "CASH_NOT_OPEN" }, { status: 409 });
      if (message.includes("PRODUCT_NOT_AVAILABLE")) return Response.json({ error: "PRODUCT_NOT_AVAILABLE" }, { status: 409 });
      if (message.includes("orders_discount_within_gross_check") || message.includes("orders_total_accounting_check")) return Response.json({ error: "INVALID_ACCOUNTING_TOTAL" }, { status: 409 });
      return Response.json({ error: "POS_SALE_FAILED" }, { status: 500 });
    }

    return Response.json({ orderId, subtotal, discount, total }, { status: 201 });
  }),
};