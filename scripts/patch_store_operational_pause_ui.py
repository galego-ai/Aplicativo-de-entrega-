from pathlib import Path

path = Path("apps/cliente/App.tsx")
text = path.read_text(encoding="utf-8")

replacements = [
    (
        'type Store = { id:string; name:string; slogan:string|null; description:string|null; logo_url:string|null; cover_url:string|null; primary_color:string; secondary_color:string; minimum_order:number; average_preparation_time:number; timezone:string; open_now:boolean; pickup_enabled:boolean; clickfood_delivery_enabled:boolean; own_delivery_enabled:boolean; max_radius_km:number|null };',
        'type Store = { id:string; name:string; slogan:string|null; description:string|null; logo_url:string|null; cover_url:string|null; primary_color:string; secondary_color:string; minimum_order:number; average_preparation_time:number; timezone:string; orders_paused:boolean; open_now:boolean; pickup_enabled:boolean; clickfood_delivery_enabled:boolean; own_delivery_enabled:boolean; max_radius_km:number|null };',
        "tipo Store",
    ),
    (
        '    if(!selectedStore.open_now){setMessage("Esta loja está fechada agora. Você pode consultar o cardápio, mas o pedido só poderá ser enviado quando ela abrir.");return;}',
        '    if(selectedStore.orders_paused){setMessage("Esta loja pausou temporariamente novos pedidos. Você ainda pode consultar o cardápio.");return;}\n    if(!selectedStore.open_now){setMessage("Esta loja está fechada agora. Você pode consultar o cardápio, mas o pedido só poderá ser enviado quando ela abrir.");return;}',
        "bloqueio local do checkout",
    ),
    (
        '      <Text style={[styles.storeStatusBanner,selectedStore.open_now?styles.storeOpenBanner:styles.storeClosedBanner]}>{selectedStore.open_now?"ABERTA AGORA":"FECHADA AGORA"}</Text>',
        '      <Text style={[styles.storeStatusBanner,selectedStore.open_now?styles.storeOpenBanner:styles.storeClosedBanner]}>{selectedStore.orders_paused?"PEDIDOS PAUSADOS":selectedStore.open_now?"ABERTA AGORA":"FECHADA AGORA"}</Text>\n      {selectedStore.orders_paused&&<Text style={styles.meta}>A loja pausou novos pedidos temporariamente. O cardápio continua disponível para consulta.</Text>}',
        "banner da loja",
    ),
    (
        '{!selectedStore.open_now?"LOJA FECHADA":!selectedStore.pickup_enabled&&!selectedStore.clickfood_delivery_enabled&&!selectedStore.own_delivery_enabled?"PEDIDOS INDISPONÍVEIS":minimumMissing>0?`FALTAM ${brl(minimumMissing)}`:deliveryType==="DELIVERY"&&!selectedAddressId?"SELECIONE UM ENDEREÇO":placing?"ENVIANDO PEDIDO...":"FAZER PEDIDO"}',
        '{selectedStore.orders_paused?"PEDIDOS PAUSADOS":!selectedStore.open_now?"LOJA FECHADA":!selectedStore.pickup_enabled&&!selectedStore.clickfood_delivery_enabled&&!selectedStore.own_delivery_enabled?"PEDIDOS INDISPONÍVEIS":minimumMissing>0?`FALTAM ${brl(minimumMissing)}`:deliveryType==="DELIVERY"&&!selectedAddressId?"SELECIONE UM ENDEREÇO":placing?"ENVIANDO PEDIDO...":"FAZER PEDIDO"}',
        "texto do botão checkout",
    ),
    (
        '{!orderingEnabled?"INDISPONÍVEL":store.open_now?"ABERTA":"FECHADA"}',
        '{!orderingEnabled?"INDISPONÍVEL":store.orders_paused?"PAUSADA":store.open_now?"ABERTA":"FECHADA"}',
        "status na descoberta",
    ),
    (
        '        {!orderingEnabled&&<Text style={styles.discoveryUnavailableText}>Pedidos temporariamente indisponíveis</Text>}',
        '        {!orderingEnabled&&<Text style={styles.discoveryUnavailableText}>Pedidos temporariamente indisponíveis</Text>}\n        {store.orders_paused&&orderingEnabled&&<Text style={styles.discoveryUnavailableText}>Novos pedidos pausados temporariamente</Text>}',
        "aviso na descoberta",
    ),
    (
        '  async function previewDeliveryQuote(){\n    if(!selectedStore||deliveryType!=="DELIVERY")return;\n    if(!selectedAddressId){setMessage("Selecione um endereço para calcular o frete.");return;}',
        '  async function previewDeliveryQuote(){\n    if(!selectedStore||deliveryType!=="DELIVERY")return;\n    if(selectedStore.orders_paused){setMessage("Esta loja pausou temporariamente novos pedidos. O cálculo de frete ficará disponível quando ela retomar.");return;}\n    if(!selectedAddressId){setMessage("Selecione um endereço para calcular o frete.");return;}',
        "prévia de frete",
    ),
]

for old, new, label in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Trecho esperado para {label} deveria existir exatamente uma vez; encontrado: {count}")
    text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")
print("App Cliente agora distingue loja pausada de loja fora do horário.")
