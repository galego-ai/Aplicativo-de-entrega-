from pathlib import Path

path = Path("apps/cliente/App.tsx")
text = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: esperado 1 trecho, encontrado {count}")
    text = text.replace(old, new, 1)


replace_once(
'''type ProductGroupLink = { product_id:string; option_group_id:string };''',
'''type ProductGroupLink = { product_id:string; option_group_id:string };
type DeliveryPreview = { quoteId:string; storeId:string; addressId:string; distanceKm:number; fee:number; expiresAt:string };''',
"tipo de prévia de frete",
)

replace_once(
'''  const[addresses,setAddresses]=useState<Address[]>([]); const[selectedAddressId,setSelectedAddressId]=useState(""); const[deliveryType,setDeliveryType]=useState<DeliveryType>("DELIVERY"); const[coupon,setCoupon]=useState(""); const[placing,setPlacing]=useState(false);''',
'''  const[addresses,setAddresses]=useState<Address[]>([]); const[selectedAddressId,setSelectedAddressId]=useState(""); const[deliveryType,setDeliveryType]=useState<DeliveryType>("DELIVERY"); const[coupon,setCoupon]=useState(""); const[placing,setPlacing]=useState(false);
  const[deliveryPreview,setDeliveryPreview]=useState<DeliveryPreview|null>(null); const[deliveryPreviewBusy,setDeliveryPreviewBusy]=useState(false);''',
"estado de prévia de frete",
)

replace_once(
'''  const cartSubtotal=useMemo(()=>cart.reduce((sum,item)=>{
    const extras=item.options.reduce((s,o)=>s+o.price*o.quantity,0);
    return sum+(item.unitPrice+extras)*item.quantity;
  },0),[cart]);''',
'''  const cartSubtotal=useMemo(()=>cart.reduce((sum,item)=>{
    const extras=item.options.reduce((s,o)=>s+o.price*o.quantity,0);
    return sum+(item.unitPrice+extras)*item.quantity;
  },0),[cart]);
  const minimumMissing=selectedStore?Math.max(0,Number(selectedStore.minimum_order)-cartSubtotal):0;
  const freeDeliveryApplies=useMemo(()=>promotions.some(p=>p.promotion_type==="FREE_DELIVERY"&&(!p.product_id||cart.some(item=>item.productId===p.product_id))),[promotions,cart]);
  const deliveryPreviewUsable=Boolean(deliveryPreview&&selectedStore&&deliveryPreview.storeId===selectedStore.id&&deliveryPreview.addressId===selectedAddressId&&new Date(deliveryPreview.expiresAt).getTime()>Date.now()+5000);
  const estimatedDeliveryFee=deliveryType==="PICKUP"?0:deliveryPreviewUsable&&deliveryPreview?(freeDeliveryApplies?0:deliveryPreview.fee):null;
  const checkoutEstimatedTotal=cartSubtotal+(estimatedDeliveryFee??0);''',
"cálculos de resumo do checkout",
)

replace_once(
'''  useEffect(()=>{if(!selectedStore)return;const deliveryEnabled=selectedStore.clickfood_delivery_enabled||selectedStore.own_delivery_enabled;if(deliveryType==="DELIVERY"&&!deliveryEnabled&&selectedStore.pickup_enabled)setDeliveryType("PICKUP");else if(deliveryType==="PICKUP"&&!selectedStore.pickup_enabled&&deliveryEnabled)setDeliveryType("DELIVERY");},[selectedStore?.id,selectedStore?.pickup_enabled,selectedStore?.clickfood_delivery_enabled,selectedStore?.own_delivery_enabled,deliveryType]);''',
'''  useEffect(()=>{if(!selectedStore)return;const deliveryEnabled=selectedStore.clickfood_delivery_enabled||selectedStore.own_delivery_enabled;if(deliveryType==="DELIVERY"&&!deliveryEnabled&&selectedStore.pickup_enabled)setDeliveryType("PICKUP");else if(deliveryType==="PICKUP"&&!selectedStore.pickup_enabled&&deliveryEnabled)setDeliveryType("DELIVERY");},[selectedStore?.id,selectedStore?.pickup_enabled,selectedStore?.clickfood_delivery_enabled,selectedStore?.own_delivery_enabled,deliveryType]);
  useEffect(()=>{setDeliveryPreview(null);},[selectedStore?.id,selectedAddressId,deliveryType]);''',
"limpeza automática da cotação",
)

replace_once(
'''    setMessage("");setSelectedStore(store);setCart([]);setSelectedProduct(null);setSelectedCategoryId("ALL");''',
'''    setMessage("");setSelectedStore(store);setCart([]);setSelectedProduct(null);setSelectedCategoryId("ALL");setDeliveryPreview(null);''',
"limpeza de cotação ao abrir loja",
)

replace_once(
'''  async function placeOrder(){
    if(!session||!selectedStore||!cart.length)return;''',
'''  async function previewDeliveryQuote(){
    if(!selectedStore||deliveryType!=="DELIVERY")return;
    if(!selectedAddressId){setMessage("Selecione um endereço para calcular o frete.");return;}
    setDeliveryPreviewBusy(true);setMessage("");
    const quoteResult=await supabase.functions.invoke("quote-delivery",{body:{storeId:selectedStore.id,addressId:selectedAddressId}});
    if(quoteResult.error||quoteResult.data?.error){
      const code=quoteResult.data?.error;
      const quoteErrors:Record<string,string>={OUTSIDE_DELIVERY_RADIUS:"Este endereço está fora da área de entrega.",STORE_CLOSED:"Esta loja está fechada agora. Consulte o horário e tente novamente quando ela abrir.",STORE_UNAVAILABLE:"Esta loja está temporariamente indisponível.",DELIVERY_DISABLED:"A loja não está aceitando entregas neste momento.",LOCATION_COORDINATES_REQUIRED:"Não foi possível calcular o frete porque faltam coordenadas da loja ou do endereço.",ADDRESS_NOT_FOUND:"Este endereço não está mais disponível. Atualize seus endereços."};
      setDeliveryPreview(null);setMessage(quoteErrors[code]??"Não foi possível calcular o frete. Confira a localização do endereço.");setDeliveryPreviewBusy(false);return;
    }
    const quote=quoteResult.data?.quote;
    setDeliveryPreview({quoteId:String(quote.id),storeId:selectedStore.id,addressId:selectedAddressId,distanceKm:Number(quote.distance_km),fee:Number(quote.fee),expiresAt:String(quote.expires_at)});
    setDeliveryPreviewBusy(false);
  }

  async function placeOrder(){
    if(!session||!selectedStore||!cart.length)return;''',
"função de prévia de frete",
)

replace_once(
'''    let deliveryQuoteId:string|undefined;let deliveryFee=0;
    if(deliveryType==="DELIVERY"){
      const quoteResult=await supabase.functions.invoke("quote-delivery",{body:{storeId:selectedStore.id,addressId:selectedAddressId}});
      if(quoteResult.error||quoteResult.data?.error){
        const code=quoteResult.data?.error;
        const quoteErrors:Record<string,string>={OUTSIDE_DELIVERY_RADIUS:"Este endereço está fora da área de entrega.",STORE_CLOSED:"Esta loja está fechada agora. Consulte o horário e tente novamente quando ela abrir.",STORE_UNAVAILABLE:"Esta loja está temporariamente indisponível.",DELIVERY_DISABLED:"A loja não está aceitando entregas neste momento.",LOCATION_COORDINATES_REQUIRED:"Não foi possível calcular o frete porque faltam coordenadas da loja ou do endereço."};
        setMessage(quoteErrors[code]??"Não foi possível calcular o frete. Confira a localização do endereço.");setPlacing(false);return;
      }
      deliveryQuoteId=quoteResult.data.quote.id;deliveryFee=Number(quoteResult.data.quote.fee);
    }''',
'''    let deliveryQuoteId:string|undefined;let deliveryFee=0;
    if(deliveryType==="DELIVERY"){
      const previewStillValid=Boolean(deliveryPreview&&deliveryPreview.storeId===selectedStore.id&&deliveryPreview.addressId===selectedAddressId&&new Date(deliveryPreview.expiresAt).getTime()>Date.now()+5000);
      if(previewStillValid&&deliveryPreview){
        deliveryQuoteId=deliveryPreview.quoteId;deliveryFee=deliveryPreview.fee;
      }else{
        const quoteResult=await supabase.functions.invoke("quote-delivery",{body:{storeId:selectedStore.id,addressId:selectedAddressId}});
        if(quoteResult.error||quoteResult.data?.error){
          const code=quoteResult.data?.error;
          const quoteErrors:Record<string,string>={OUTSIDE_DELIVERY_RADIUS:"Este endereço está fora da área de entrega.",STORE_CLOSED:"Esta loja está fechada agora. Consulte o horário e tente novamente quando ela abrir.",STORE_UNAVAILABLE:"Esta loja está temporariamente indisponível.",DELIVERY_DISABLED:"A loja não está aceitando entregas neste momento.",LOCATION_COORDINATES_REQUIRED:"Não foi possível calcular o frete porque faltam coordenadas da loja ou do endereço."};
          setMessage(quoteErrors[code]??"Não foi possível calcular o frete. Confira a localização do endereço.");setPlacing(false);return;
        }
        deliveryQuoteId=quoteResult.data.quote.id;deliveryFee=Number(quoteResult.data.quote.fee);
      }
    }''',
"reutilização da cotação no pedido",
)

replace_once(
'''        PRODUCT_UNAVAILABLE:"Um dos produtos ficou indisponível. Atualize o cardápio.",''',
'''        PRODUCT_UNAVAILABLE:"Um dos produtos ficou indisponível. Atualize o cardápio.",
        DELIVERY_QUOTE_ALREADY_USED:"A cotação de frete expirou ou já foi utilizada. Calcule o frete novamente.",''',
"erro de cotação consumida",
)

replace_once(
'''    const total=Number(result.data.total);
    const promo=Number(result.data.promotionDiscount??0);
    const orderId=String(result.data.orderId);''',
'''    const total=Number(result.data.total);
    const promo=Number(result.data.promotionDiscount??0);
    const finalDeliveryFee=Number(result.data.deliveryFee??deliveryFee);
    const orderId=String(result.data.orderId);
    setDeliveryPreview(null);''',
"frete final retornado pelo servidor",
)

replace_once(
'''      setMessage(`Pedido enviado! Total ${brl(total)}${deliveryFee?` • entrega calculada ${brl(deliveryFee)}`:""}${promo>0?` • economia ${brl(promo)}`:""}.`);''',
'''      setMessage(`Pedido enviado! Total ${brl(total)}${finalDeliveryFee?` • entrega ${brl(finalDeliveryFee)}`:deliveryType==="DELIVERY"?" • frete grátis":""}${promo>0?` • economia ${brl(promo)}`:""}.`);''',
"mensagem final com frete real",
)

replace_once(
'''      <Text style={styles.section}>Meu carrinho</Text>
      {cart.length?cart.map(item=>{
        const extras=item.options.reduce((s,o)=>s+o.price*o.quantity,0);
        return <View style={styles.cartRow} key={item.cartKey}>
          <View style={{flex:1}}>
            <Text style={styles.productName}>{item.quantity}× {item.productName}{item.variantName?` • ${item.variantName}`:""}</Text>
            {!!item.options.length&&<Text style={styles.cartOptions}>{item.options.map(o=>`${o.quantity}× ${o.name}`).join(" • ")}</Text>}
            {!!item.notes&&<Text style={styles.cartOptions}>Obs.: {item.notes}</Text>}
            <Text style={styles.price}>{brl((item.unitPrice+extras)*item.quantity)}</Text>
          </View>
          <View style={styles.qty}><Pressable onPress={()=>changeQty(item.cartKey,-1)}><Text>−</Text></Pressable><Text>{item.quantity}</Text><Pressable onPress={()=>changeQty(item.cartKey,1)}><Text>+</Text></Pressable></View>
        </View>;
      }):<Text style={styles.empty}>Adicione itens para continuar.</Text>}

      {(selectedStore.clickfood_delivery_enabled||selectedStore.own_delivery_enabled||selectedStore.pickup_enabled)&&<View style={styles.segment}>''',
'''      <Text style={styles.section}>Meu carrinho</Text>
      {cart.length?cart.map(item=>{
        const extras=item.options.reduce((s,o)=>s+o.price*o.quantity,0);
        return <View style={styles.cartRow} key={item.cartKey}>
          <View style={{flex:1}}>
            <Text style={styles.productName}>{item.quantity}× {item.productName}{item.variantName?` • ${item.variantName}`:""}</Text>
            {!!item.options.length&&<Text style={styles.cartOptions}>{item.options.map(o=>`${o.quantity}× ${o.name}`).join(" • ")}</Text>}
            {!!item.notes&&<Text style={styles.cartOptions}>Obs.: {item.notes}</Text>}
            <Text style={styles.price}>{brl((item.unitPrice+extras)*item.quantity)}</Text>
          </View>
          <View style={styles.qty}><Pressable onPress={()=>changeQty(item.cartKey,-1)}><Text>−</Text></Pressable><Text>{item.quantity}</Text><Pressable onPress={()=>changeQty(item.cartKey,1)}><Text>+</Text></Pressable></View>
        </View>;
      }):<Text style={styles.empty}>Adicione itens para continuar.</Text>}
      {!!cart.length&&<View style={[styles.minimumOrderCard,minimumMissing>0?styles.minimumOrderPending:styles.minimumOrderReached]}><Text style={styles.minimumOrderTitle}>{minimumMissing>0?`Faltam ${brl(minimumMissing)} para o pedido mínimo`:"✓ Pedido mínimo atingido"}</Text><Text style={styles.minimumOrderMeta}>Mínimo da loja: {brl(selectedStore.minimum_order)} • Itens: {brl(cartSubtotal)}</Text></View>}

      {(selectedStore.clickfood_delivery_enabled||selectedStore.own_delivery_enabled||selectedStore.pickup_enabled)&&<View style={styles.segment}>''',
"status do pedido mínimo",
)

replace_once(
'''        {addresses.map(address=><Pressable key={address.id} style={[styles.addressCard,selectedAddressId===address.id&&styles.addressSelected]} onPress={()=>setSelectedAddressId(address.id)}>
          <Text style={styles.productName}>{address.label||"Endereço"}</Text><Text style={styles.meta}>{address.street}, {address.number}{address.district?` • ${address.district}`:""}</Text>
        </Pressable>)}
        <View style={styles.addressForm}>''',
'''        {addresses.map(address=><Pressable key={address.id} style={[styles.addressCard,selectedAddressId===address.id&&styles.addressSelected]} onPress={()=>setSelectedAddressId(address.id)}>
          <Text style={styles.productName}>{address.label||"Endereço"}</Text><Text style={styles.meta}>{address.street}, {address.number}{address.district?` • ${address.district}`:""}</Text>
        </Pressable>)}
        {!!selectedAddressId&&<View style={styles.deliveryPreviewCard}><View style={{flex:1}}><Text style={styles.deliveryPreviewTitle}>{deliveryPreviewUsable&&deliveryPreview?`Frete para ${deliveryPreview.distanceKm.toFixed(2)} km`:"Calcule o frete antes de finalizar"}</Text><Text style={styles.deliveryPreviewMeta}>{deliveryPreviewUsable&&deliveryPreview?(freeDeliveryApplies&&deliveryPreview.fee>0?`Promoção ativa: de ${brl(deliveryPreview.fee)} por grátis`:`Cotação válida por até 10 minutos`):"A cotação valida distância, raio e tabela configurada pela loja."}</Text></View>{deliveryPreviewUsable&&deliveryPreview&&<Text style={styles.deliveryPreviewPrice}>{freeDeliveryApplies?"GRÁTIS":brl(deliveryPreview.fee)}</Text>}<Pressable style={[styles.deliveryPreviewButton,deliveryPreviewBusy&&styles.disabled]} disabled={deliveryPreviewBusy} onPress={previewDeliveryQuote}><Text style={styles.deliveryPreviewButtonText}>{deliveryPreviewBusy?"CALCULANDO...":deliveryPreviewUsable?"RECALCULAR":"CALCULAR FRETE"}</Text></Pressable></View>}
        <View style={styles.addressForm}>''',
"cartão de prévia de frete",
)

replace_once(
'''      <View style={styles.totalBox}><Text>Subtotal estimado</Text><Text style={styles.total}>{brl(cartSubtotal)}</Text><Text style={styles.paymentHint}>O servidor recalcula preços, promoções, adicionais, frete, estoque e cupom antes de criar o pedido. {paymentMethod==="PIX"?"No PIX, o pedido só é enviado à loja após a confirmação da Efí.":paymentMethod==="CREDIT_CARD"?"No cartão, número e CVV são tokenizados pela Efí dentro de uma tela segura e não ficam armazenados no CLICK-FOOD.":"No dinheiro, o pedido segue diretamente para a loja."}</Text></View>
      <Pressable style={[styles.checkout,(!cart.length||!selectedStore.open_now||(!selectedStore.pickup_enabled&&!selectedStore.clickfood_delivery_enabled&&!selectedStore.own_delivery_enabled))&&styles.disabled]} disabled={!cart.length||placing||!selectedStore.open_now||(!selectedStore.pickup_enabled&&!selectedStore.clickfood_delivery_enabled&&!selectedStore.own_delivery_enabled)} onPress={placeOrder}><Text style={styles.checkoutText}>{!selectedStore.open_now?"LOJA FECHADA":!selectedStore.pickup_enabled&&!selectedStore.clickfood_delivery_enabled&&!selectedStore.own_delivery_enabled?"PEDIDOS INDISPONÍVEIS":placing?"ENVIANDO PEDIDO...":"FAZER PEDIDO"}</Text></Pressable>''',
'''      <View style={styles.totalBox}><View style={styles.checkoutSummaryRow}><Text style={styles.checkoutSummaryLabel}>Itens</Text><Text style={styles.checkoutSummaryValue}>{brl(cartSubtotal)}</Text></View><View style={styles.checkoutSummaryRow}><Text style={styles.checkoutSummaryLabel}>{deliveryType==="PICKUP"?"Retirada":"Frete"}</Text><Text style={styles.checkoutSummaryValue}>{deliveryType==="PICKUP"?"Grátis":estimatedDeliveryFee==null?"Calcule acima":estimatedDeliveryFee===0?"Grátis":brl(estimatedDeliveryFee)}</Text></View>{deliveryType==="DELIVERY"&&deliveryPreviewUsable&&deliveryPreview&&freeDeliveryApplies&&deliveryPreview.fee>0&&<Text style={styles.checkoutSaving}>Você economiza {brl(deliveryPreview.fee)} no frete com a promoção ativa.</Text>}<View style={styles.checkoutDivider}/><Text style={styles.checkoutTotalLabel}>Total estimado antes do cupom</Text><Text style={styles.total}>{brl(checkoutEstimatedTotal)}</Text><Text style={styles.paymentHint}>O servidor recalcula preços, promoções, adicionais, frete, estoque e cupom antes de criar o pedido. {paymentMethod==="PIX"?"No PIX, o pedido só é enviado à loja após a confirmação da Efí.":paymentMethod==="CREDIT_CARD"?"No cartão, número e CVV são tokenizados pela Efí dentro de uma tela segura e não ficam armazenados no CLICK-FOOD.":"No dinheiro, o pedido segue diretamente para a loja."}</Text></View>
      <Pressable style={[styles.checkout,(!cart.length||minimumMissing>0||!selectedStore.open_now||(deliveryType==="DELIVERY"&&!selectedAddressId)||(!selectedStore.pickup_enabled&&!selectedStore.clickfood_delivery_enabled&&!selectedStore.own_delivery_enabled))&&styles.disabled]} disabled={!cart.length||minimumMissing>0||placing||!selectedStore.open_now||(deliveryType==="DELIVERY"&&!selectedAddressId)||(!selectedStore.pickup_enabled&&!selectedStore.clickfood_delivery_enabled&&!selectedStore.own_delivery_enabled)} onPress={placeOrder}><Text style={styles.checkoutText}>{!selectedStore.open_now?"LOJA FECHADA":!selectedStore.pickup_enabled&&!selectedStore.clickfood_delivery_enabled&&!selectedStore.own_delivery_enabled?"PEDIDOS INDISPONÍVEIS":minimumMissing>0?`FALTAM ${brl(minimumMissing)}`:deliveryType==="DELIVERY"&&!selectedAddressId?"SELECIONE UM ENDEREÇO":placing?"ENVIANDO PEDIDO...":"FAZER PEDIDO"}</Text></Pressable>''',
"resumo e botão do checkout",
)

replace_once(
'''  cartRow:{backgroundColor:"#fff",borderRadius:14,padding:13,marginBottom:8,flexDirection:"row",alignItems:"center"},cartOptions:{fontSize:10,color:"#666",marginTop:4,lineHeight:14},qty:{flexDirection:"row",gap:14,alignItems:"center",borderWidth:1,borderColor:"#ddd",borderRadius:10,paddingVertical:8,paddingHorizontal:10},
  segment:{flexDirection:"row",gap:7,marginTop:18},segmentButton:{flex:1,borderWidth:1,borderColor:"#ddd",padding:12,borderRadius:12,alignItems:"center"},segmentActive:{backgroundColor:"#111",borderColor:"#111"},segmentActiveText:{color:"#fff",fontWeight:"900"},
  addressCard:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e2e2e2",borderRadius:13,padding:12,marginBottom:7},addressSelected:{borderColor:"#d4ae00",backgroundColor:"#fffbea"},addressForm:{backgroundColor:"#eeeae0",borderRadius:16,padding:14,marginTop:10},formTitle:{fontWeight:"900",marginBottom:10},
  secondaryButton:{backgroundColor:"#fff",borderWidth:1,borderColor:"#ccc",padding:13,borderRadius:12,alignItems:"center"},secondaryText:{fontWeight:"900"},totalBox:{backgroundColor:"#fff",padding:16,borderRadius:15,marginTop:12},total:{fontSize:25,fontWeight:"900",marginTop:4},paymentHint:{fontSize:10,color:"#777",marginTop:10,lineHeight:14},checkout:{backgroundColor:"#f4c400",padding:16,borderRadius:14,alignItems:"center",marginTop:10},checkoutText:{fontWeight:"900"},back:{fontWeight:"900",color:"#856a00",fontSize:15},empty:{color:"#777",paddingVertical:20,textAlign:"center"},''',
'''  cartRow:{backgroundColor:"#fff",borderRadius:14,padding:13,marginBottom:8,flexDirection:"row",alignItems:"center"},cartOptions:{fontSize:10,color:"#666",marginTop:4,lineHeight:14},qty:{flexDirection:"row",gap:14,alignItems:"center",borderWidth:1,borderColor:"#ddd",borderRadius:10,paddingVertical:8,paddingHorizontal:10},minimumOrderCard:{borderRadius:13,padding:12,marginTop:8,borderWidth:1},minimumOrderPending:{backgroundColor:"#fff7dd",borderColor:"#e9d386"},minimumOrderReached:{backgroundColor:"#e4f7ea",borderColor:"#a4d9b4"},minimumOrderTitle:{fontSize:12,fontWeight:"900",color:"#333"},minimumOrderMeta:{fontSize:9.5,color:"#666",marginTop:4},
  segment:{flexDirection:"row",gap:7,marginTop:18},segmentButton:{flex:1,borderWidth:1,borderColor:"#ddd",padding:12,borderRadius:12,alignItems:"center"},segmentActive:{backgroundColor:"#111",borderColor:"#111"},segmentActiveText:{color:"#fff",fontWeight:"900"},
  addressCard:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e2e2e2",borderRadius:13,padding:12,marginBottom:7},addressSelected:{borderColor:"#d4ae00",backgroundColor:"#fffbea"},deliveryPreviewCard:{backgroundColor:"#111",borderRadius:15,padding:13,marginTop:10,flexDirection:"row",alignItems:"center",flexWrap:"wrap",gap:10},deliveryPreviewTitle:{color:"#fff",fontSize:12,fontWeight:"900"},deliveryPreviewMeta:{color:"#b8bcc2",fontSize:9.5,lineHeight:13,marginTop:4},deliveryPreviewPrice:{color:"#f4c400",fontSize:16,fontWeight:"900"},deliveryPreviewButton:{width:"100%",backgroundColor:"#f4c400",borderRadius:10,paddingVertical:10,alignItems:"center"},deliveryPreviewButtonText:{fontSize:10,fontWeight:"900",color:"#111"},addressForm:{backgroundColor:"#eeeae0",borderRadius:16,padding:14,marginTop:10},formTitle:{fontWeight:"900",marginBottom:10},
  secondaryButton:{backgroundColor:"#fff",borderWidth:1,borderColor:"#ccc",padding:13,borderRadius:12,alignItems:"center"},secondaryText:{fontWeight:"900"},totalBox:{backgroundColor:"#fff",padding:16,borderRadius:15,marginTop:12},checkoutSummaryRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:8},checkoutSummaryLabel:{fontSize:11,color:"#666",fontWeight:"700"},checkoutSummaryValue:{fontSize:12,fontWeight:"900",color:"#222"},checkoutSaving:{fontSize:9.5,fontWeight:"800",color:"#24774b",marginTop:2,marginBottom:8},checkoutDivider:{height:1,backgroundColor:"#ececec",marginVertical:6},checkoutTotalLabel:{fontSize:10,color:"#777",fontWeight:"800"},total:{fontSize:25,fontWeight:"900",marginTop:4},paymentHint:{fontSize:10,color:"#777",marginTop:10,lineHeight:14},checkout:{backgroundColor:"#f4c400",padding:16,borderRadius:14,alignItems:"center",marginTop:10},checkoutText:{fontWeight:"900"},back:{fontWeight:"900",color:"#856a00",fontSize:15},empty:{color:"#777",paddingVertical:20,textAlign:"center"},''',
"estilos do checkout",
)

path.write_text(text, encoding="utf-8")
print("Carrinho e checkout do Cliente atualizados com prévia de frete e pedido mínimo.")
