from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f"[skip] {label}: já aplicado")
        return text
    if old not in text:
        raise SystemExit(f"[erro] trecho não encontrado: {label}")
    print(f"[ok] {label}")
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, repl: str, label: str) -> str:
    updated, count = re.subn(pattern, repl, text, count=1, flags=re.S)
    if count == 0:
        raise SystemExit(f"[erro] regex não encontrou: {label}")
    print(f"[ok] {label}")
    return updated


# ---------------------------------------------------------------------------
# APP CLIENTE
# ---------------------------------------------------------------------------
customer_path = ROOT / "apps/cliente/App.tsx"
customer = customer_path.read_text(encoding="utf-8")

customer = replace_once(
    customer,
    'type DeliveryPreview = { quoteId:string; storeId:string; addressId:string; distanceKm:number; fee:number; expiresAt:string };',
    'type DeliveryPreview = { quoteId:string; storeId:string; addressId:string; distanceKm:number; fee:number; expiresAt:string };\n'
    'type HomeFeaturedProduct = { id:string; storeId:string; storeName:string; name:string; imageUrl:string|null; price:number; promotionalPrice:number|null };',
    "tipo de produto em destaque",
)

customer = replace_once(
    customer,
    '  const[favoriteStoreIds,setFavoriteStoreIds]=useState<Set<string>>(new Set());\n  const storeScrollRef=useRef<ScrollView>(null);',
    '  const[favoriteStoreIds,setFavoriteStoreIds]=useState<Set<string>>(new Set());\n'
    '  const[homeFeaturedProducts,setHomeFeaturedProducts]=useState<HomeFeaturedProduct[]>([]);\n'
    '  const storeScrollRef=useRef<ScrollView>(null);',
    "estado de destaques da home",
)

old_load_stores = '''  async function loadStores(){
    const{data,error}=await supabase.functions.invoke("store-catalog");
    if(error||data?.error)return;
    const rows=(data?.stores??[]) as Store[];
    setStores(rows);
    setSelectedStore(current=>current?(rows.find(s=>s.id===current.id)??current):current);
  }'''
new_load_stores = '''  async function loadStores(){
    const{data,error}=await supabase.functions.invoke("store-catalog");
    if(error||data?.error)return;
    const rows=(data?.stores??[]) as Store[];
    setStores(rows);
    setSelectedStore(current=>current?(rows.find(s=>s.id===current.id)??current):current);
    const storeIds=rows.map(store=>store.id);
    if(!storeIds.length){setHomeFeaturedProducts([]);return;}
    const{data:featuredRows}=await supabase.from("products").select("id,store_id,name,image_url,price,promotional_price,updated_at").in("store_id",storeIds).eq("active",true).eq("available_delivery",true).order("updated_at",{ascending:false}).limit(12);
    const storeById=new Map(rows.map(store=>[store.id,store]));
    setHomeFeaturedProducts(((featuredRows??[]) as any[]).map(row=>{const store=storeById.get(String(row.store_id));return{id:String(row.id),storeId:String(row.store_id),storeName:store?.name??"CLICK-FOOD",name:String(row.name??"Produto"),imageUrl:row.image_url?String(row.image_url):null,price:Number(row.price??0),promotionalPrice:row.promotional_price==null?null:Number(row.promotional_price)};}).slice(0,6));
  }'''
customer = replace_once(customer, old_load_stores, new_load_stores, "carregar produtos em destaque")

customer = replace_once(
    customer,
    '  const featuredStores=stores.slice(0,2);\n  const favoriteStores=stores.filter(store=>favoriteStoreIds.has(store.id));',
    '  const featuredStores=stores.slice(0,2);\n  const featuredProducts=homeFeaturedProducts.slice(0,2);\n  const favoriteStores=stores.filter(store=>favoriteStoreIds.has(store.id));',
    "seleção de produtos em destaque",
)

old_featured = '''    <View style={styles.featuredGrid}>{featuredStores.map(store=><Pressable key={store.id} style={styles.featuredCard} onPress={()=>openStore(store)}>{store.cover_url?<Image source={{uri:store.cover_url}} style={styles.featuredImage}/>:<View style={[styles.featuredImageFallback,{backgroundColor:store.secondary_color||"#111"}]}><Text style={{color:store.primary_color||"#f4c400",fontWeight:"900"}}>CLICK-FOOD</Text></View>}<View style={styles.featuredBody}><Text numberOfLines={1} style={styles.featuredName}>{store.name}</Text><Text numberOfLines={1} style={styles.featuredMeta}>{store.slogan||"Delivery CLICK-FOOD"}</Text><View style={styles.featuredBottom}><Text style={styles.featuredPrice}>mín. {brl(store.minimum_order)}</Text><View style={styles.featuredPlus}><Text style={styles.featuredPlusText}>+</Text></View></View></View></Pressable>)}</View>'''
new_featured = '''    <View style={styles.featuredGrid}>{featuredProducts.length?featuredProducts.map(product=>{const store=stores.find(item=>item.id===product.storeId);const displayPrice=product.promotionalPrice!=null&&product.promotionalPrice>0?product.promotionalPrice:product.price;return <Pressable key={product.id} style={styles.featuredCard} onPress={()=>store&&openStore(store)}>{product.imageUrl?<Image source={{uri:product.imageUrl}} style={styles.featuredImage}/>:<View style={styles.featuredImageFallback}><Text style={styles.featuredImageEmoji}>🍽️</Text></View>}<View style={styles.featuredBody}><Text numberOfLines={1} style={styles.featuredName}>{product.name}</Text><Text numberOfLines={1} style={styles.featuredMeta}>{product.storeName}</Text><Text style={styles.featuredPrep}>⏱ {store?.average_preparation_time??30} min</Text><View style={styles.featuredBottom}><Text style={styles.featuredPrice}>{brl(displayPrice)}</Text><View style={styles.featuredPlus}><Text style={styles.featuredPlusText}>+</Text></View></View></View></Pressable>}):featuredStores.map(store=><Pressable key={store.id} style={styles.featuredCard} onPress={()=>openStore(store)}>{store.cover_url?<Image source={{uri:store.cover_url}} style={styles.featuredImage}/>:<View style={[styles.featuredImageFallback,{backgroundColor:store.secondary_color||"#111"}]}><Text style={{color:store.primary_color||"#f4c400",fontWeight:"900"}}>CLICK-FOOD</Text></View>}<View style={styles.featuredBody}><Text numberOfLines={1} style={styles.featuredName}>{store.name}</Text><Text numberOfLines={1} style={styles.featuredMeta}>{store.slogan||"Delivery CLICK-FOOD"}</Text><View style={styles.featuredBottom}><Text style={styles.featuredPrice}>mín. {brl(store.minimum_order)}</Text><View style={styles.featuredPlus}><Text style={styles.featuredPlusText}>+</Text></View></View></View></Pressable>)}</View>'''
customer = replace_once(customer, old_featured, new_featured, "cards de destaque como produtos")

customer = replace_once(
    customer,
    '    if(["PICKUP_CONFIRMED","DRIVER_TO_CUSTOMER","DRIVER_AT_CUSTOMER"].includes(String(delivery.status))){',
    '    if(String(delivery.status)==="DRIVER_AT_CUSTOMER"){',
    "código de entrega somente quando entregador chega",
)

customer = replace_once(
    customer,
    '<View style={styles.rowBetween}><Text style={styles.pageTitle}>Meus pedidos</Text><Pressable onPress={loadOrders}><Text style={styles.link}>Atualizar</Text></Pressable></View>',
    '<View style={styles.rowBetween}><Text style={styles.pageTitle}>{tracking&&trackedOrder?"Meu Pedido":"Meus pedidos"}</Text><Pressable onPress={loadOrders}><Text style={styles.link}>Atualizar</Text></Pressable></View>',
    "título Meu Pedido durante rastreio",
)

# Ordem dos botões do carrinho: continuar comprando acima de finalizar pedido.
pattern_checkout = r'(<Pressable style=\{\[styles\.checkout.*?</Pressable>)\s*(<Pressable style=\{styles\.continueShopping\}.*?</Pressable>)'
match = re.search(pattern_checkout, customer, flags=re.S)
if match:
    customer = customer[:match.start()] + match.group(2) + match.group(1) + customer[match.end():]
    print("[ok] ordem dos botões do carrinho")
elif customer.find('style={styles.continueShopping}') < customer.find('style={[styles.checkout'):
    print("[skip] ordem dos botões do carrinho: já aplicada")
else:
    raise SystemExit("[erro] não foi possível reorganizar botões do carrinho")

# Ajuste visual forte do carrinho flutuante superior para corresponder à referência.
customer = replace_once(
    customer,
    '  floatingCartTop:{position:"absolute",top:8,left:12,right:12,height:58,backgroundColor:"#111",borderRadius:14,borderWidth:1.5,borderColor:"#f4c400",paddingHorizontal:13,flexDirection:"row",alignItems:"center",justifyContent:"space-between",zIndex:30,elevation:12,shadowColor:"#000",shadowOpacity:.18,shadowRadius:9,shadowOffset:{width:0,height:4}},',
    '  floatingCartTop:{position:"absolute",top:6,left:10,right:10,height:52,backgroundColor:"#f4c400",borderRadius:12,paddingHorizontal:14,flexDirection:"row",alignItems:"center",justifyContent:"space-between",zIndex:30,elevation:12,shadowColor:"#000",shadowOpacity:.16,shadowRadius:8,shadowOffset:{width:0,height:4}},',
    "estilo do carrinho flutuante",
)
customer = replace_once(customer,'  floatingCartTitle:{color:"#f4c400",fontSize:13,fontWeight:"900"},','  floatingCartTitle:{color:"#111",fontSize:14,fontWeight:"900"},',"cor título carrinho")
customer = replace_once(customer,'  floatingCartBadge:{backgroundColor:"#f4c400",color:"#111",fontSize:10,fontWeight:"900"},','  floatingCartBadge:{backgroundColor:"#fff",color:"#111",fontSize:10,fontWeight:"900"},',"badge carrinho")
customer = replace_once(customer,'  floatingCartMeta:{color:"#c8c8c8",fontSize:9,marginTop:2},','  floatingCartMeta:{color:"#5b4a00",fontSize:9,marginTop:2,fontWeight:"700"},',"meta carrinho")
customer = replace_once(customer,'  floatingCartPrice:{color:"#fff",fontSize:16,fontWeight:"900",marginLeft:8},','  floatingCartPrice:{color:"#111",fontSize:16,fontWeight:"900",marginLeft:8},',"preço carrinho")

# Estilos extras para produtos destacados.
customer = replace_once(
    customer,
    '  featuredMeta:{fontSize:9,color:"#777",marginTop:3},\n  featuredBottom:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:9},',
    '  featuredMeta:{fontSize:9,color:"#777",marginTop:3},\n  featuredPrep:{fontSize:9,color:"#8a6d00",fontWeight:"800",marginTop:4},\n  featuredImageEmoji:{fontSize:42},\n  featuredBottom:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:9},',
    "estilos produto destaque",
)

customer_path.write_text(customer, encoding="utf-8")


# ---------------------------------------------------------------------------
# APP ENTREGADOR
# ---------------------------------------------------------------------------
driver_shell_path = ROOT / "apps/entregador/DriverProfessionalShell.tsx"
driver_shell = driver_shell_path.read_text(encoding="utf-8")

driver_shell = replace_once(
    driver_shell,
    'await supabase.functions.invoke("register-push-token",{body:{flex:1,paddingBottom:0,backgroundColor:"#0d0d0d"}});',
    'await supabase.functions.invoke("register-push-token",{body:{token,app:"DRIVER",platform,deviceId,appIdentifier:"br.com.clickfood.entregador"}});',
    "corrigir cadastro de push do entregador",
)

driver_shell = replace_once(
    driver_shell,
    '<StatusBar barStyle="dark-content" backgroundColor="#fff"/>',
    '<StatusBar barStyle="light-content" backgroundColor="#0d0d0d"/>',
    "status bar escura do entregador",
)

driver_shell_path.write_text(driver_shell, encoding="utf-8")


driver_path = ROOT / "apps/entregador/App.tsx"
driver = driver_path.read_text(encoding="utf-8")

# Card principal mais próximo da referência aprovada: compacto, escuro e organizado.
driver = replace_once(
    driver,
    '  driverActiveCard:{backgroundColor:"#151515",borderRadius:18,padding:16,borderWidth:1,borderColor:"#343434"},',
    '  driverActiveCard:{backgroundColor:"#151515",borderRadius:18,padding:17,borderWidth:1,borderColor:"#2d2d2d",shadowColor:"#000",shadowOpacity:.25,shadowRadius:10,shadowOffset:{width:0,height:5}},',
    "card ativo do entregador",
)
driver = replace_once(
    driver,
    '  mapActionButton:{backgroundColor:"#f4c400",borderRadius:11,paddingVertical:14,alignItems:"center",marginTop:13},',
    '  mapActionButton:{backgroundColor:"#f4c400",borderRadius:10,paddingVertical:14,alignItems:"center",marginTop:15},',
    "botão mapa do entregador",
)
driver = replace_once(
    driver,
    '  nextStepCard:{backgroundColor:"#121212",borderRadius:16,padding:15,borderWidth:1,borderColor:"#272727",marginTop:12},',
    '  nextStepCard:{backgroundColor:"#101010",borderRadius:16,padding:16,borderWidth:1,borderColor:"#252525",marginTop:12},',
    "card próxima etapa",
)

# Deixar claro no botão quando o entregador está no cliente e precisa do código.
driver = replace_once(
    driver,
    'const nextStepText=active?.status==="DRIVER_AT_CUSTOMER"?"Aguardando código do cliente para finalizar a entrega.":active?.status==="DRIVER_AT_STORE"?"Aguardando o código de retirada fornecido pela loja.":nextAction?.[1]??"Aguardando próxima atualização.";',
    'const nextStepText=active?.status==="DRIVER_AT_CUSTOMER"?"Aguardando código do cliente para finalizar a entrega.":active?.status==="DRIVER_AT_STORE"?"Aguardando o código de retirada fornecido pela loja.":nextAction?.[1]??"Aguardando próxima atualização.";\n  const codeButtonLabel=active?.status==="DRIVER_AT_CUSTOMER"?"JÁ TENHO O CÓDIGO":active?.status==="DRIVER_AT_STORE"?"DIGITAR CÓDIGO DE RETIRADA":null;',
    "rótulo de ação do código",
)

# Substitui somente o bloco de entrada/ação da próxima etapa para dar destaque ao código.
old_code_block = '''{needsCode&&<TextInput style={styles.codeInput} placeholder="Código de 4 dígitos" placeholderTextColor="#777" keyboardType="number-pad" maxLength={4} value={code} onChangeText={setCode}/>} {nextAction&&<Pressable style={styles.actionButton} onPress={()=>deliveryAction(nextAction[0])}><Text style={styles.actionText}>{nextAction[1]}</Text></Pressable>}'''
new_code_block = '''{needsCode&&<><Text style={styles.codePrompt}>{codeButtonLabel}</Text><TextInput style={styles.codeInput} placeholder="Código de 4 dígitos" placeholderTextColor="#777" keyboardType="number-pad" maxLength={4} value={code} onChangeText={setCode}/></>} {nextAction&&<Pressable style={styles.actionButton} onPress={()=>deliveryAction(nextAction[0])}><Text style={styles.actionText}>{needsCode&&codeButtonLabel?codeButtonLabel:nextAction[1]}</Text></Pressable>}'''
driver = replace_once(driver, old_code_block, new_code_block, "entrada do código do entregador")

driver = replace_once(
    driver,
    '  codeInput:{borderWidth:1,borderColor:"#444",backgroundColor:"#0f0f0f",color:"#fff",borderRadius:11,padding:13,fontSize:18,textAlign:"center",letterSpacing:5,marginTop:12},',
    '  codePrompt:{fontSize:10,color:"#f4c400",fontWeight:"900",marginTop:14,marginBottom:2},\n  codeInput:{borderWidth:1,borderColor:"#555",backgroundColor:"#0b0b0b",color:"#fff",borderRadius:11,padding:13,fontSize:20,textAlign:"center",letterSpacing:7,marginTop:8},',
    "estilo do código do entregador",
)

driver_path.write_text(driver, encoding="utf-8")

print("Alterações estruturais do layout CLICK-FOOD aplicadas.")
