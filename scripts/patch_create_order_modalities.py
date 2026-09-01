from pathlib import Path

path = Path("supabase/functions/create-order/index.ts")
text = path.read_text(encoding="utf-8")

old = '''    const { data: isOpen, error: hoursError } = await ctx.supabaseAdmin.rpc("store_is_open", { p_store_id: body.storeId });
    if (hoursError) return Response.json({ error: "STORE_HOURS_LOOKUP_FAILED" }, { status: 500 });
    if (!isOpen) return Response.json({ error: "STORE_CLOSED" }, { status: 409 });

    let addressId: string | null = null;'''
new = '''    const { data: isOpen, error: hoursError } = await ctx.supabaseAdmin.rpc("store_is_open", { p_store_id: body.storeId });
    if (hoursError) return Response.json({ error: "STORE_HOURS_LOOKUP_FAILED" }, { status: 500 });
    if (!isOpen) return Response.json({ error: "STORE_CLOSED" }, { status: 409 });

    const { data: deliverySettings, error: deliverySettingsError } = await ctx.supabaseAdmin
      .from("store_delivery_settings")
      .select("pickup_enabled,clickfood_delivery_enabled,own_delivery_enabled")
      .eq("store_id", body.storeId)
      .maybeSingle();
    if (deliverySettingsError) return Response.json({ error: "DELIVERY_SETTINGS_FAILED" }, { status: 500 });
    if (body.deliveryType === "DELIVERY" && (!deliverySettings || (!deliverySettings.clickfood_delivery_enabled && !deliverySettings.own_delivery_enabled))) {
      return Response.json({ error: "DELIVERY_DISABLED" }, { status: 409 });
    }
    if (body.deliveryType === "PICKUP" && deliverySettings && !deliverySettings.pickup_enabled) {
      return Response.json({ error: "PICKUP_DISABLED" }, { status: 409 });
    }

    let addressId: string | null = null;'''

count = text.count(old)
if count != 1:
    raise SystemExit(f"Bloco de horário esperado não encontrado exatamente uma vez: {count}")
text = text.replace(old, new, 1)

old_pickup = '''    } else {
      const { data: deliverySettings } = await ctx.supabaseAdmin
        .from("store_delivery_settings").select("pickup_enabled").eq("store_id", body.storeId).maybeSingle();
      if (deliverySettings && !deliverySettings.pickup_enabled) return Response.json({ error: "PICKUP_DISABLED" }, { status: 409 });
    }
'''
new_pickup = '''    }
'''
count = text.count(old_pickup)
if count != 1:
    raise SystemExit(f"Bloco antigo de retirada esperado não encontrado exatamente uma vez: {count}")
text = text.replace(old_pickup, new_pickup, 1)

path.write_text(text, encoding="utf-8")
print("create-order agora revalida entrega e retirada no instante do checkout.")
