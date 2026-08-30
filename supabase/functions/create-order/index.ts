import { withSupabase } from "npm:@supabase/server@1.4.1";

type RequestedOption = { optionId: string; quantity?: number };
type RequestedItem = {
  productId: string;
  variantId?: string;
  quantity: number;
  options?: RequestedOption[];
  notes?: string;
};
type CheckoutRequest = {
  storeId: string;
  deliveryType: "DELIVERY" | "PICKUP";
  addressId?: string;
  deliveryQuoteId?: string;
  paymentMethod: "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "CASH" | "WALLET";
  couponCode?: string;
  notes?: string;
  items: RequestedItem[];
};
type SnapshotOption = { name: string; price: number; quantity: number };
type SnapshotItem = {
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  notes?: string;
  options: SnapshotOption[];
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const allowedPaymentMethods = new Set(["PIX", "CREDIT_CARD", "CASH"]);

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });

    const userId = ctx.userClaims!.id;
    let body: CheckoutRequest;
    try { body = await req.json(); } catch { return Response.json({ error: "INVALID_JSON" }, { status: 400 }); }

    if (!body.storeId || !["DELIVERY", "PICKUP"].includes(body.deliveryType) || !allowedPaymentMethods.has(body.paymentMethod) || !Array.isArray(body.items) || body.items.length === 0) {
      return Response.json({ error: "INVALID_CHECKOUT" }, { status: 400 });
    }
    if (body.items.length > 100) return Response.json({ error: "TOO_MANY_ITEMS" }, { status: 400 });

    if (body.paymentMethod !== "CASH") {
      const { data: efiConfig, error: paymentConfigError } = await ctx.supabaseAdmin
        .from("payment_provider_configs")
        .select("enabled,credentials_configured,supported_methods")
        .eq("provider", "EFI")
        .maybeSingle();
      if (paymentConfigError) return Response.json({ error: "PAYMENT_CONFIG_LOOKUP_FAILED" }, { status: 500 });
      if (!efiConfig?.enabled || !efiConfig.credentials_configured || !(efiConfig.supported_methods ?? []).includes(body.paymentMethod)) {
        return Response.json({ error: "PAYMENT_METHOD_UNAVAILABLE", method: body.paymentMethod }, { status: 409 });
      }
    }

    const { data: store, error: storeError } = await ctx.supabaseAdmin
      .from("stores").select("id,status,minimum_order").eq("id", body.storeId).maybeSingle();
    if (storeError) return Response.json({ error: "STORE_LOOKUP_FAILED" }, { status: 500 });
    if (!store || store.status !== "ACTIVE") return Response.json({ error: "STORE_UNAVAILABLE" }, { status: 409 });

    let addressId: string | null = null;
    let deliveryQuoteId: string | null = null;
    let deliveryFee = 0;

    if (body.deliveryType === "DELIVERY") {
      if (!body.addressId || !body.deliveryQuoteId) return Response.json({ error: "DELIVERY_QUOTE_REQUIRED" }, { status: 400 });
      const { data: quote, error: quoteError } = await ctx.supabaseAdmin
        .from("delivery_quotes")
        .select("id,store_id,customer_id,address_id,fee,expires_at,consumed_at")
        .eq("id", body.deliveryQuoteId)
        .eq("store_id", body.storeId)
        .eq("customer_id", userId)
        .eq("address_id", body.addressId)
        .maybeSingle();
      if (quoteError) return Response.json({ error: "QUOTE_LOOKUP_FAILED" }, { status: 500 });
      if (!quote || quote.consumed_at || new Date(quote.expires_at).getTime() <= Date.now()) {
        return Response.json({ error: "DELIVERY_QUOTE_INVALID" }, { status: 409 });
      }
      addressId = quote.address_id;
      deliveryQuoteId = quote.id;
      deliveryFee = Number(quote.fee);
    } else {
      const { data: deliverySettings } = await ctx.supabaseAdmin
        .from("store_delivery_settings").select("pickup_enabled").eq("store_id", body.storeId).maybeSingle();
      if (deliverySettings && !deliverySettings.pickup_enabled) return Response.json({ error: "PICKUP_DISABLED" }, { status: 409 });
    }

    const requestedProductIds = [...new Set(body.items.map((item) => item.productId))];
    if (requestedProductIds.some((id) => typeof id !== "string" || !id)) return Response.json({ error: "INVALID_PRODUCT_ID" }, { status: 400 });

    const [{ data: products, error: productsError }, { data: activeVariants, error: variantError }, { data: activePromotions, error: promotionError }] = await Promise.all([
      ctx.supabaseAdmin.from("products")
        .select("id,store_id,category_id,name,price,promotional_price,active,available_delivery")
        .eq("store_id", body.storeId).in("id", requestedProductIds),
      ctx.supabaseAdmin.from("product_variants")
        .select("id,product_id,name,price,active").in("product_id", requestedProductIds).eq("active", true),
      ctx.supabaseAdmin.from("promotions")
        .select("id,name,promotion_type,discount_value,product_id,starts_at,ends_at,active")
        .eq("store_id", body.storeId).eq("active", true),
    ]);
    if (productsError) return Response.json({ error: "PRODUCT_LOOKUP_FAILED" }, { status: 500 });
    if (variantError) return Response.json({ error: "VARIANT_LOOKUP_FAILED" }, { status: 500 });
    if (promotionError) return Response.json({ error: "PROMOTION_LOOKUP_FAILED" }, { status: 500 });
    if (!products || products.length !== requestedProductIds.length) return Response.json({ error: "PRODUCT_NOT_FOUND" }, { status: 409 });

    const productMap = new Map(products.map((product) => [product.id, product]));
    if (body.deliveryType === "DELIVERY" && products.some((product) => !product.active || !product.available_delivery)) {
      return Response.json({ error: "PRODUCT_UNAVAILABLE" }, { status: 409 });
    }
    if (body.deliveryType === "PICKUP" && products.some((product) => !product.active)) {
      return Response.json({ error: "PRODUCT_UNAVAILABLE" }, { status: 409 });
    }

    const variantsByProduct = new Map<string, any[]>();
    const variantMap = new Map<string, any>();
    for (const variant of activeVariants ?? []) {
      variantMap.set(variant.id, variant);
      variantsByProduct.set(variant.product_id, [...(variantsByProduct.get(variant.product_id) ?? []), variant]);
    }

    const now = Date.now();
    const promotions = (activePromotions ?? []).filter((promo) =>
      (!promo.starts_at || new Date(promo.starts_at).getTime() <= now) &&
      (!promo.ends_at || new Date(promo.ends_at).getTime() >= now)
    );
    const promotionsByProduct = new Map<string, any[]>();
    for (const promo of promotions) {
      if (promo.product_id) promotionsByProduct.set(promo.product_id, [...(promotionsByProduct.get(promo.product_id) ?? []), promo]);
    }

    const { data: productGroupLinks, error: linkError } = await ctx.supabaseAdmin
      .from("product_option_groups").select("product_id,option_group_id").in("product_id", requestedProductIds);
    if (linkError) return Response.json({ error: "OPTION_LOOKUP_FAILED" }, { status: 500 });

    const groupIds = [...new Set((productGroupLinks ?? []).map((link) => link.option_group_id))];
    const requestedOptionIds = [...new Set(body.items.flatMap((item) => (item.options ?? []).map((option) => option.optionId)))];

    const [groupsResult, optionsResult] = await Promise.all([
      groupIds.length
        ? ctx.supabaseAdmin.from("option_groups").select("id,required,minimum_choices,maximum_choices,active").in("id", groupIds)
        : Promise.resolve({ data: [], error: null }),
      requestedOptionIds.length
        ? ctx.supabaseAdmin.from("product_options").select("id,option_group_id,name,additional_price,active").in("id", requestedOptionIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (groupsResult.error || optionsResult.error) return Response.json({ error: "OPTION_LOOKUP_FAILED" }, { status: 500 });

    const groupMap = new Map((groupsResult.data ?? []).map((group) => [group.id, group]));
    const optionMap = new Map((optionsResult.data ?? []).map((option) => [option.id, option]));
    const groupsByProduct = new Map<string, string[]>();
    for (const link of productGroupLinks ?? []) {
      groupsByProduct.set(link.product_id, [...(groupsByProduct.get(link.product_id) ?? []), link.option_group_id]);
    }

    let subtotal = 0;
    let promotionDiscount = 0;
    const snapshotItems: SnapshotItem[] = [];

    for (const requested of body.items) {
      const product = productMap.get(requested.productId);
      if (!product) return Response.json({ error: "PRODUCT_NOT_FOUND" }, { status: 409 });
      if (!Number.isInteger(requested.quantity) || requested.quantity < 1 || requested.quantity > 99) {
        return Response.json({ error: "INVALID_QUANTITY", productId: requested.productId }, { status: 400 });
      }

      const productVariants = variantsByProduct.get(product.id) ?? [];
      let variant: any = null;
      if (productVariants.length) {
        if (!requested.variantId) return Response.json({ error: "VARIANT_REQUIRED", productId: product.id }, { status: 409 });
        variant = variantMap.get(requested.variantId);
        if (!variant || variant.product_id !== product.id) return Response.json({ error: "VARIANT_NOT_ALLOWED", variantId: requested.variantId }, { status: 409 });
      } else if (requested.variantId) {
        return Response.json({ error: "VARIANT_NOT_ALLOWED", variantId: requested.variantId }, { status: 409 });
      }

      const allowedGroups = new Set(groupsByProduct.get(product.id) ?? []);
      const selectionsByGroup = new Map<string, number>();
      const snapshotOptions: SnapshotOption[] = [];
      let optionsPerUnit = 0;

      for (const selected of requested.options ?? []) {
        const option = optionMap.get(selected.optionId);
        if (!option || !option.active || !allowedGroups.has(option.option_group_id)) {
          return Response.json({ error: "OPTION_NOT_ALLOWED", optionId: selected.optionId }, { status: 409 });
        }
        const quantity = selected.quantity ?? 1;
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
          return Response.json({ error: "INVALID_OPTION_QUANTITY", optionId: selected.optionId }, { status: 400 });
        }
        selectionsByGroup.set(option.option_group_id, (selectionsByGroup.get(option.option_group_id) ?? 0) + quantity);
        const optionPrice = Number(option.additional_price);
        optionsPerUnit += optionPrice * quantity;
        snapshotOptions.push({ name: option.name, price: money(optionPrice), quantity });
      }

      for (const groupId of allowedGroups) {
        const group = groupMap.get(groupId);
        if (!group || !group.active) continue;
        const selectedCount = selectionsByGroup.get(groupId) ?? 0;
        if ((group.required || Number(group.minimum_choices) > 0) && selectedCount < Number(group.minimum_choices)) {
          return Response.json({ error: "REQUIRED_OPTION_MISSING", groupId }, { status: 409 });
        }
        if (selectedCount > Number(group.maximum_choices)) return Response.json({ error: "TOO_MANY_OPTIONS", groupId }, { status: 409 });
      }

      const regularUnitPrice = Number(variant?.price ?? product.price);
      let unitPrice = Number(variant?.price ?? product.promotional_price ?? product.price);

      for (const promo of promotionsByProduct.get(product.id) ?? []) {
        const value = Number(promo.discount_value);
        let candidate = unitPrice;
        if (promo.promotion_type === "PRODUCT_PRICE") candidate = value;
        else if (promo.promotion_type === "PERCENTAGE" && value >= 0 && value <= 100) candidate = unitPrice * (1 - value / 100);
        else if (promo.promotion_type === "FIXED") candidate = unitPrice - value;
        unitPrice = Math.max(0, Math.min(unitPrice, candidate));
      }
      unitPrice = money(unitPrice);
      promotionDiscount += money(Math.max(0, regularUnitPrice - unitPrice) * requested.quantity);

      const lineTotal = money((unitPrice + optionsPerUnit) * requested.quantity);
      subtotal += lineTotal;
      snapshotItems.push({
        product_id: product.id,
        name: variant ? `${product.name} • ${variant.name}` : product.name,
        quantity: requested.quantity,
        unit_price: unitPrice,
        total_price: lineTotal,
        notes: requested.notes?.slice(0, 500),
        options: snapshotOptions,
      });
    }

    subtotal = money(subtotal);
    promotionDiscount = money(promotionDiscount);

    const freeDeliveryPromotion = body.deliveryType === "DELIVERY" && promotions.some((promo) =>
      promo.promotion_type === "FREE_DELIVERY" &&
      (!promo.product_id || requestedProductIds.includes(promo.product_id))
    );
    const deliveryFeeBeforePromotion = deliveryFee;
    if (freeDeliveryPromotion) {
      promotionDiscount = money(promotionDiscount + deliveryFee);
      deliveryFee = 0;
    }

    if (subtotal < Number(store.minimum_order)) {
      return Response.json({ error: "MINIMUM_ORDER_NOT_REACHED", minimumOrder: Number(store.minimum_order) }, { status: 409 });
    }

    let couponId: string | null = null;
    let discount = 0;
    if (body.couponCode?.trim()) {
      const normalizedCode = body.couponCode.trim();
      const { data: coupon, error: couponError } = await ctx.supabaseAdmin
        .from("coupons")
        .select("id,store_id,discount_type,discount_value,minimum_order,max_uses,max_uses_per_customer,starts_at,ends_at,active")
        .ilike("code", normalizedCode).eq("active", true).limit(1).maybeSingle();

      if (couponError) return Response.json({ error: "COUPON_LOOKUP_FAILED" }, { status: 500 });
      if (!coupon || (coupon.store_id && coupon.store_id !== body.storeId)) return Response.json({ error: "COUPON_INVALID" }, { status: 409 });

      if ((coupon.starts_at && new Date(coupon.starts_at).getTime() > now) || (coupon.ends_at && new Date(coupon.ends_at).getTime() < now)) {
        return Response.json({ error: "COUPON_EXPIRED" }, { status: 409 });
      }
      if (subtotal < Number(coupon.minimum_order)) return Response.json({ error: "COUPON_MINIMUM_NOT_REACHED" }, { status: 409 });

      const [{ count: globalUses }, { count: customerUses }, { data: rules }] = await Promise.all([
        ctx.supabaseAdmin.from("coupon_redemptions").select("id", { count: "exact", head: true }).eq("coupon_id", coupon.id),
        ctx.supabaseAdmin.from("coupon_redemptions").select("id", { count: "exact", head: true }).eq("coupon_id", coupon.id).eq("customer_id", userId),
        ctx.supabaseAdmin.from("coupon_rules").select("rule_type,rule_value").eq("coupon_id", coupon.id),
      ]);
      if (coupon.max_uses != null && (globalUses ?? 0) >= Number(coupon.max_uses)) return Response.json({ error: "COUPON_LIMIT_REACHED" }, { status: 409 });
      if (coupon.max_uses_per_customer != null && (customerUses ?? 0) >= Number(coupon.max_uses_per_customer)) return Response.json({ error: "COUPON_CUSTOMER_LIMIT_REACHED" }, { status: 409 });

      for (const rule of rules ?? []) {
        if (rule.rule_type === "FIRST_ORDER") {
          const { data: previous } = await ctx.supabaseAdmin.from("orders").select("id")
            .eq("customer_id", userId).eq("store_id", body.storeId)
            .neq("status", "CANCELLED").neq("status", "REJECTED").limit(1);
          if (previous?.length) return Response.json({ error: "COUPON_FIRST_ORDER_ONLY" }, { status: 409 });
        } else if (rule.rule_type === "CUSTOMER") {
          if (rule.rule_value?.customer_id !== userId) return Response.json({ error: "COUPON_NOT_ELIGIBLE" }, { status: 409 });
        } else if (rule.rule_type === "PRODUCT") {
          if (!requestedProductIds.includes(String(rule.rule_value?.product_id ?? ""))) return Response.json({ error: "COUPON_PRODUCT_REQUIRED" }, { status: 409 });
        } else if (rule.rule_type === "CATEGORY") {
          const categoryIds = products.map((product) => product.category_id).filter(Boolean);
          if (!categoryIds.includes(rule.rule_value?.category_id)) return Response.json({ error: "COUPON_CATEGORY_REQUIRED" }, { status: 409 });
        } else {
          return Response.json({ error: "COUPON_RULE_NOT_AVAILABLE" }, { status: 409 });
        }
      }

      if (coupon.discount_type === "PERCENTAGE") {
        const percent = Number(coupon.discount_value);
        if (percent < 0 || percent > 100) return Response.json({ error: "COUPON_CONFIGURATION_INVALID" }, { status: 500 });
        discount = money(subtotal * (percent / 100));
      } else if (coupon.discount_type === "FIXED") {
        discount = money(Math.min(Number(coupon.discount_value), subtotal + deliveryFee));
      } else if (coupon.discount_type === "FREE_DELIVERY") {
        discount = money(deliveryFee);
      }
      couponId = coupon.id;
    }

    const total = money(Math.max(0, subtotal + deliveryFee - discount));
    const isOfflinePayment = body.paymentMethod === "CASH";
    const initialStatus = isOfflinePayment ? "WAITING_STORE" : "PENDING_PAYMENT";
    const initialPaymentStatus = "PENDING";
    const paymentProvider = isOfflinePayment ? null : "EFI";

    const { data: orderId, error: checkoutError } = await ctx.supabaseAdmin.rpc("checkout_order_atomic", {
      p_store_id: body.storeId,
      p_customer_id: userId,
      p_address_id: addressId,
      p_delivery_quote_id: deliveryQuoteId,
      p_coupon_id: couponId,
      p_source: "APP",
      p_delivery_type: body.deliveryType,
      p_status: initialStatus,
      p_payment_status: initialPaymentStatus,
      p_payment_method: body.paymentMethod,
      p_payment_provider: paymentProvider,
      p_subtotal: subtotal,
      p_delivery_fee: deliveryFee,
      p_discount: discount,
      p_total: total,
      p_customer_notes: body.notes?.slice(0, 1000) ?? null,
      p_items: snapshotItems,
    });

    if (checkoutError) {
      const conflict = checkoutError.message?.includes("DELIVERY_QUOTE_INVALID_OR_CONSUMED");
      return Response.json({ error: conflict ? "DELIVERY_QUOTE_ALREADY_USED" : "CHECKOUT_FAILED" }, { status: conflict ? 409 : 500 });
    }

    return Response.json({
      orderId,
      subtotal,
      deliveryFee,
      deliveryFeeBeforePromotion,
      promotionDiscount,
      discount,
      total,
      status: initialStatus,
      paymentStatus: initialPaymentStatus,
    }, { status: 201 });
  }),
};
