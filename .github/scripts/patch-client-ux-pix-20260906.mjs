import fs from 'node:fs';

const path = 'apps/cliente/App.tsx';
let s = fs.readFileSync(path, 'utf8');

function replaceOnce(oldText, newText, label) {
  if (!s.includes(oldText)) throw new Error(`${label}: padrão não encontrado`);
  s = s.replace(oldText, newText);
}

replaceOnce(
`  function changeQty(cartKey:string,delta:number){
    setCart(current=>current.map(item=>item.cartKey===cartKey?{...item,quantity:item.quantity+delta}:item).filter(item=>item.quantity>0));
  }`,
`  function changeQty(cartKey:string,delta:number){
    setCart(current=>current.map(item=>item.cartKey===cartKey?{...item,quantity:item.quantity+delta}:item).filter(item=>item.quantity>0));
  }
  function setCartQuantity(cartKey:string,value:string){
    const digits=value.replace(/\\D/g,"");
    const quantity=Math.max(1,Math.min(99,Number(digits)||1));
    setCart(current=>current.map(item=>item.cartKey===cartKey?{...item,quantity}:item));
  }
  function clearCart(){
    Alert.alert("Limpar carrinho","Deseja remover todos os itens do carrinho?",[
      {text:"Cancelar",style:"cancel"},
      {text:"Limpar",style:"destructive",onPress:()=>{setCart([]);setDeliveryPreview(null);setMessage("Carrinho limpo.");}}
    ]);
  }`,
'controles do carrinho'
);

replaceOnce(
'{product.image_url?<Image source={{uri:product.image_url}} style={[styles.productImage,soldOut&&styles.productImageSoldOut]}/>:<View style={[styles.productImageFallback,soldOut&&styles.productImageSoldOut]}><Text style={styles.productImageFallbackText}>🍽️</Text></View>}',
'<Pressable disabled={soldOut} accessibilityRole="button" accessibilityLabel={`Abrir ${product.name}`} onPress={()=>beginProduct(product)} style={styles.productImageTap}>{product.image_url?<Image source={{uri:product.image_url}} style={[styles.productImage,soldOut&&styles.productImageSoldOut]}/>:<View style={[styles.productImageFallback,soldOut&&styles.productImageSoldOut]}><Text style={styles.productImageFallbackText}>🍽️</Text></View>}</Pressable>',
'imagem clicável do produto'
);

replaceOnce(
'<Text style={styles.cartModalSubtitle}>{selectedStore.name} • {cartQuantity} {cartQuantity===1?"item":"itens"}</Text></View><Pressable accessibilityLabel="Fechar carrinho" style={styles.cartModalClose} onPress={()=>setCartOpen(false)}><Text style={styles.cartModalCloseText}>×</Text></Pressable>',
'<Text style={styles.cartModalSubtitle}>{selectedStore.name} • {cartQuantity} {cartQuantity===1?"item":"itens"}</Text></View>{!!cart.length&&<Pressable accessibilityRole="button" accessibilityLabel="Limpar carrinho" style={styles.clearCartButton} onPress={clearCart}><Text style={styles.clearCartText}>LIMPAR</Text></Pressable>}<Pressable accessibilityLabel="Fechar carrinho" style={styles.cartModalClose} onPress={()=>setCartOpen(false)}><Text style={styles.cartModalCloseText}>×</Text></Pressable>',
'limpar carrinho no cabeçalho'
);

replaceOnce(
'<View style={styles.qty}><Pressable onPress={()=>changeQty(item.cartKey,-1)}><Text>−</Text></Pressable><Text>{item.quantity}</Text><Pressable onPress={()=>changeQty(item.cartKey,1)}><Text>+</Text></Pressable></View>',
'<View style={styles.qty}><Pressable onPress={()=>changeQty(item.cartKey,-1)}><Text>−</Text></Pressable><TextInput style={styles.qtyInput} keyboardType="number-pad" selectTextOnFocus value={String(item.quantity)} onChangeText={value=>setCartQuantity(item.cartKey,value)} maxLength={2}/><Pressable onPress={()=>changeQty(item.cartKey,1)}><Text>+</Text></Pressable></View>',
'quantidade digitável'
);

const quickConst = '  const quickCategories=[{label:"Promoções",icon:"🏷️",query:"promo"},{label:"Lanches",icon:"🍔",query:"lanche"},{label:"Pizzas",icon:"🍕",query:"pizza"},{label:"Bebidas",icon:"🥤",query:"bebida"},{label:"Doces",icon:"🧁",query:"doce"}];\n';
if (s.includes(quickConst)) s = s.replace(quickConst, '');

const quickRowStart = s.indexOf('<ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickCategoriesScroll} contentContainerStyle={styles.quickCategoriesRow}>');
if (quickRowStart >= 0) {
  const quickRowEndMarker = '</ScrollView>';
  const quickRowEnd = s.indexOf(quickRowEndMarker, quickRowStart);
  if (quickRowEnd < 0) throw new Error('linha de atalhos rápidos sem fechamento');
  s = s.slice(0, quickRowStart) + s.slice(quickRowEnd + quickRowEndMarker.length);
}

const pendingPixStart = s.indexOf('  async function loadPendingPix(currentOrders:Order[]){');
const pendingPixEnd = s.indexOf('\n\n  async function loadPendingCard', pendingPixStart);
if (pendingPixStart < 0 || pendingPixEnd < 0) throw new Error('bloco loadPendingPix não encontrado');
const pendingPixBlock = `  async function loadPendingPix(currentOrders:Order[]){
    const pendingOrders=currentOrders.filter(order=>order.status==="PENDING_PAYMENT"&&order.payment_status!=="PAID");
    if(!pendingOrders.length){setPixCharge(null);return;}
    const pendingIds=pendingOrders.map(order=>order.id);
    const{data:paymentRows}=await supabase.from("payments").select("order_id,method,created_at").in("order_id",pendingIds).order("created_at",{ascending:false});
    const pixOrderId=(paymentRows??[]).find((row:any)=>String(row.method)==="PIX")?.order_id;
    if(!pixOrderId){setPixCharge(null);return;}
    const statusResult=await supabase.functions.invoke("efi-pix-status",{body:{orderId:String(pixOrderId)}});
    if(!statusResult.error&&statusResult.data?.paid){setPixCharge(null);return;}
    const{data:createData,error:createError}=await supabase.functions.invoke("efi-pix-create",{body:{orderId:String(pixOrderId)}});
    if(!createError&&!createData?.error&&createData?.charge?.brcode){
      const charge=createData.charge;
      setPixCharge({orderId:String(pixOrderId),txid:charge.txid,brcode:charge.brcode,status:charge.status,expires_at:charge.expires_at});
    }else setPixCharge(null);
  }`;
s = s.slice(0, pendingPixStart) + pendingPixBlock + s.slice(pendingPixEnd);

replaceOnce(
'  const checkoutEstimatedTotal=cartSubtotal+(estimatedDeliveryFee??0);\n',
`  const checkoutEstimatedTotal=cartSubtotal+(estimatedDeliveryFee??0);

  useEffect(()=>{
    if(!pixCharge?.orderId)return;
    let running=false;
    const timer=setInterval(async()=>{
      if(running)return;
      running=true;
      try{
        const result=await supabase.functions.invoke("efi-pix-status",{body:{orderId:pixCharge.orderId}});
        if(!result.error&&result.data?.paid){
          setPixCharge(null);
          setMessage("Pagamento PIX confirmado! Seu pedido foi enviado para a loja.");
          await loadOrders();
          setTab("orders");
        }
      }finally{running=false;}
    },6000);
    return()=>clearInterval(timer);
  },[pixCharge?.orderId,pixCharge?.txid]);
`,
'polling automático PIX'
);

replaceOnce(
'      const pixResult=await supabase.functions.invoke("efi-pix-create",{body:{orderId}});\n      if(pixResult.error||pixResult.data?.error||!pixResult.data?.charge?.brcode){',
'      let pixResult=await supabase.functions.invoke("efi-pix-create",{body:{orderId}});\n      if(pixResult.error||pixResult.data?.error||!pixResult.data?.charge?.brcode){await new Promise(resolve=>setTimeout(resolve,1200));pixResult=await supabase.functions.invoke("efi-pix-create",{body:{orderId}});}\n      if(pixResult.error||pixResult.data?.error||!pixResult.data?.charge?.brcode){',
'retry de criação PIX'
);

replaceOnce(
'  if(selectedStore){\n    return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content"/><ScrollView ref={storeScrollRef}',
'  if(selectedStore){\n    const storeTabs:Array<[Tab,string,string]>=[["home","⌂","Início"],["orders","▤","Pedidos"],["favorites","♡","Favoritos"],["profile","○","Perfil"]];\n    return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content"/><View style={{flex:1}}><ScrollView ref={storeScrollRef}',
'navegação persistente: abertura da loja'
);

replaceOnce(
'    </SafeAreaView>;\n  }\n\n  const renderStoreCard=',
'    </View><View style={styles.bottom}>{storeTabs.map(([key,icon,label])=><Pressable key={key} style={styles.tab} onPress={()=>{setCartOpen(false);setSelectedProduct(null);setSelectedStore(null);setTab(key);}}><Text style={[styles.tabIcon,tab===key&&styles.tabActive]}>{icon}</Text><Text style={[styles.tabLabel,tab===key&&styles.tabActive]}>{label}</Text></Pressable>)}</View></SafeAreaView>;\n  }\n\n  const renderStoreCard=',
'navegação persistente: rodapé da loja'
);

replaceOnce(
'productRow:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e8e8e8",borderRadius:15,padding:12,marginBottom:9,flexDirection:"row",alignItems:"center",gap:10},productImage:{width:"100%",height:118,borderRadius:12,backgroundColor:"#eee"}',
'productRow:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e8e8e8",borderRadius:15,padding:12,marginBottom:9,flexDirection:"row",alignItems:"center",gap:10},productImageTap:{width:"100%",borderRadius:12,overflow:"hidden"},productImage:{width:"100%",height:118,borderRadius:12,backgroundColor:"#eee"}',
'estilo imagem clicável'
);

replaceOnce(
'cartRow:{backgroundColor:"#fff",borderRadius:14,padding:13,marginBottom:8,flexDirection:"row",alignItems:"center"},cartOptions:{fontSize:10,color:"#666",marginTop:4,lineHeight:14},qty:{flexDirection:"row",gap:14,alignItems:"center",borderWidth:1,borderColor:"#ddd",borderRadius:10,paddingVertical:8,paddingHorizontal:10}',
'cartRow:{backgroundColor:"#fff",borderRadius:14,padding:13,marginBottom:8,flexDirection:"row",alignItems:"center"},cartOptions:{fontSize:10,color:"#666",marginTop:4,lineHeight:14},qty:{flexDirection:"row",gap:10,alignItems:"center",borderWidth:1,borderColor:"#ddd",borderRadius:10,paddingVertical:6,paddingHorizontal:10},qtyInput:{width:38,textAlign:"center",fontWeight:"900",fontSize:14,color:"#111",paddingVertical:0}',
'estilo quantidade digitável'
);

const closeStyleNeedle='cartModalCloseText:{fontSize:26,lineHeight:28,fontWeight:"800",color:"#111"}';
if(!s.includes(closeStyleNeedle)) throw new Error('estilo de fechamento do carrinho não encontrado');
s=s.replace(closeStyleNeedle,closeStyleNeedle+',clearCartButton:{backgroundColor:"#fff3b5",borderWidth:1,borderColor:"#e0bd16",borderRadius:10,paddingVertical:9,paddingHorizontal:10,marginRight:8},clearCartText:{fontSize:9,fontWeight:"900",color:"#725b00"}');

fs.writeFileSync(path,s);
console.log('Cliente atualizado: imagem clicável, carrinho, navegação persistente e PIX robusto.');
