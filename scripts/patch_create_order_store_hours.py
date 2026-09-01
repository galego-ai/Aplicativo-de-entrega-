from pathlib import Path

path = Path("supabase/functions/create-order/index.ts")
text = path.read_text(encoding="utf-8")
old = '''    if (storeError) return Response.json({ error: "STORE_LOOKUP_FAILED" }, { status: 500 });
    if (!store || store.status !== "ACTIVE") return Response.json({ error: "STORE_UNAVAILABLE" }, { status: 409 });

    let addressId: string | null = null;'''
new = '''    if (storeError) return Response.json({ error: "STORE_LOOKUP_FAILED" }, { status: 500 });
    if (!store || store.status !== "ACTIVE") return Response.json({ error: "STORE_UNAVAILABLE" }, { status: 409 });

    const { data: isOpen, error: hoursError } = await ctx.supabaseAdmin.rpc("store_is_open", { p_store_id: body.storeId });
    if (hoursError) return Response.json({ error: "STORE_HOURS_LOOKUP_FAILED" }, { status: 500 });
    if (!isOpen) return Response.json({ error: "STORE_CLOSED" }, { status: 409 });

    let addressId: string | null = null;'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"Trecho esperado não encontrado exatamente uma vez: {count}")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("create-order agora revalida store_is_open no checkout.")
