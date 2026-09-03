from pathlib import Path

path = Path('apps/cliente/App.tsx')
text = path.read_text(encoding='utf-8')

repls = []
repls.append((
'''type ProductWithMedia = Product & { image_url:string|null; category_id:string|null };''',
'''type ProductWithMedia = Product & { image_url:string|null; category_id:string|null; control_inventory:boolean; stock_quantity:number|null };'''
))

repls.append((
'''supabase.from("products").select("id,name,description,image_url,price,promotional_price,category_id").eq("store_id",store.id).eq("active",true).eq("available_delivery",true).order("name"),''',
'''supabase.from("products").select("id,name,description,image_url,price,promotional_price,category_id,control_inventory").eq("store_id",store.id).eq("active",true).eq("available_delivery",true).order("name"),'''
))

old = '''    const ps=(productResult.data??[]).map((p:any)=>({...p,price:Number(p.price),promotional_price:p.promotional_price==null?null:Number(p.promotional_price),category_id:p.category_id==null?null:String(p.category_id)})) as ProductWithMedia[];\n    setProducts(ps);setCategories((categoryResult.data??[]) as MenuCategory[]);\n    const productIds=ps.map(p=>p.id);'''
new = '''    const rawPs=(productResult.data??[]).map((p:any)=>({...p,price:Number(p.price),promotional_price:p.promotional_price==null?null:Number(p.promotional_price),category_id:p.category_id==null?null:String(p.category_id),control_inventory:Boolean(p.control_inventory),stock_quantity:null})) as ProductWithMedia[];\n    const controlledIds=rawPs.filter(p=>p.control_inventory).map(p=>p.id);\n    const stockByProduct=new Map<string,number>();\n    if(controlledIds.length){\n      const inventoryResult=await supabase.from("inventory_items").select("product_id,quantity").eq("store_id",store.id).in("product_id",controlledIds);\n      for(const row of inventoryResult.data??[])stockByProduct.set(String(row.product_id),Number(row.quantity));\n    }\n    const ps=rawPs.map(p=>({...p,stock_quantity:p.control_inventory?Number(stockByProduct.get(p.id)??0):null}));\n    setProducts(ps);setCategories((categoryResult.data??[]) as MenuCategory[]);\n    const productIds=ps.map(p=>p.id);'''
repls.append((old,new))

repls.append((
'''  function beginProduct(product:ProductWithMedia){\n    const needsCustomization=variantsFor(product.id).length>0||groupsFor(product.id).length>0;''',
'''  function beginProduct(product:ProductWithMedia){\n    if(product.control_inventory&&Number(product.stock_quantity??0)<=0){setMessage(`${product.name} está esgotado no momento.`);return;}\n    const needsCustomization=variantsFor(product.id).length>0||groupsFor(product.id).length>0;'''
))

repls.append((
'''    setPlacing(true);setMessage("");\n    let deliveryQuoteId:string|undefined;let deliveryFee=0;''',
'''    const requestedByProduct=new Map<string,number>();\n    for(const item of cart)requestedByProduct.set(item.productId,(requestedByProduct.get(item.productId)??0)+item.quantity);\n    const insufficientLocal=products.find(product=>product.control_inventory&&Number(product.stock_quantity??0)<Number(requestedByProduct.get(product.id)??0));\n    if(insufficientLocal){setMessage(`${insufficientLocal.name} está sem estoque suficiente. Remova o item ou reduza a quantidade.`);return;}\n    setPlacing(true);setMessage("");\n    let deliveryQuoteId:string|undefined;let deliveryFee=0;'''
))

repls.append((
'''        INSUFFICIENT_STOCK:"Um dos produtos não possui quantidade suficiente em estoque.",''',
'''        INSUFFICIENT_STOCK:"Um dos produtos está esgotado ou não possui estoque suficiente. Atualize o cardápio e ajuste o carrinho.",'''
))

repls.append((
'''      <Modal visible={cartOpen} animationType="slide" onRequestClose={()=>setCartOpen(false)}><SafeAreaView style={styles.cartModalSafe}><View style={styles.cartModalHeader}><View style={{flex:1}}><Text style={styles.cartModalTitle}>Seu carrinho</Text><Text style={styles.cartModalSubtitle}>{selectedStore.name} • {cartQuantity} {cartQuantity===1?"item":"itens"}</Text></View><Pressable accessibilityLabel="Fechar carrinho" style={styles.cartModalClose} onPress={()=>setCartOpen(false)}><Text style={styles.cartModalCloseText}>×</Text></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.cartModalScroll}><Text style={styles.section}>Itens do pedido</Text>''',
'''      <Modal visible={cartOpen} animationType="slide" onRequestClose={()=>setCartOpen(false)}><SafeAreaView style={styles.cartModalSafe}><View style={styles.cartModalHeader}><View style={{flex:1}}><Text style={styles.cartModalTitle}>Seu carrinho</Text><Text style={styles.cartModalSubtitle}>{selectedStore.name} • {cartQuantity} {cartQuantity===1?"item":"itens"}</Text></View><Pressable accessibilityLabel="Fechar carrinho" style={styles.cartModalClose} onPress={()=>setCartOpen(false)}><Text style={styles.cartModalCloseText}>×</Text></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.cartModalScroll}>{!!message&&<Text style={styles.notice}>{message}</Text>}<Text style={styles.section}>Itens do pedido</Text>'''
))

old = '''        const discounted=shown<base&&!hasVariants;\n        return <View style={styles.productTile} key={product.id}>\n          {product.image_url?<Image source={{uri:product.image_url}} style={styles.productImage}/>:<View style={styles.productImageFallback}><Text style={styles.productImageFallbackText}>🍽️</Text></View>}\n          <View style={{flex:1}}>\n            <Text style={styles.productName}>{product.name}</Text><Text style={styles.meta}>{product.description||""}</Text>\n            <Text style={styles.price}>{hasVariants?"A partir de ":""}{brl(shown)}</Text>\n            {(hasVariants||hasOptions)&&<Text style={styles.customHint}>{hasVariants?"Escolha tamanho":"Personalizável"}{hasVariants&&hasOptions?" • complementos":""}</Text>}\n            {discounted&&<Text style={styles.discountHint}>Preço promocional aplicado</Text>}\n          </View>\n          <Pressable style={styles.addButton} onPress={()=>beginProduct(product)}><Text style={styles.addText}>+</Text></Pressable>\n        </View>;'''
new = '''        const discounted=shown<base&&!hasVariants;\n        const soldOut=product.control_inventory&&Number(product.stock_quantity??0)<=0;\n        return <View style={[styles.productTile,soldOut&&styles.productTileSoldOut]} key={product.id}>\n          {product.image_url?<Image source={{uri:product.image_url}} style={[styles.productImage,soldOut&&styles.productImageSoldOut]}/>:<View style={[styles.productImageFallback,soldOut&&styles.productImageSoldOut]}><Text style={styles.productImageFallbackText}>🍽️</Text></View>}\n          <View style={{flex:1}}>\n            <Text style={styles.productName}>{product.name}</Text><Text style={styles.meta}>{product.description||""}</Text>\n            <Text style={styles.price}>{hasVariants?"A partir de ":""}{brl(shown)}</Text>\n            {soldOut?<Text style={styles.soldOutText}>ESGOTADO</Text>:<>{(hasVariants||hasOptions)&&<Text style={styles.customHint}>{hasVariants?"Escolha tamanho":"Personalizável"}{hasVariants&&hasOptions?" • complementos":""}</Text>}{discounted&&<Text style={styles.discountHint}>Preço promocional aplicado</Text>}</>}\n          </View>\n          <Pressable disabled={soldOut} style={[styles.addButton,soldOut&&styles.addButtonSoldOut]} onPress={()=>beginProduct(product)}><Text style={styles.addText}>{soldOut?"×":"+"}</Text></Pressable>\n        </View>;'''
repls.append((old,new))

repls.append((
'''  productGrid:{flexDirection:"row",flexWrap:"wrap",gap:10,alignItems:"stretch"},\n  productTile:{width:"48%",backgroundColor:"#fff",borderWidth:1,borderColor:"#e7e7e7",borderRadius:14,padding:9,marginBottom:2},''',
'''  productGrid:{flexDirection:"row",flexWrap:"wrap",gap:10,alignItems:"stretch"},\n  productTile:{width:"48%",backgroundColor:"#fff",borderWidth:1,borderColor:"#e7e7e7",borderRadius:14,padding:9,marginBottom:2},\n  productTileSoldOut:{opacity:.62},productImageSoldOut:{opacity:.55},soldOutText:{marginTop:7,fontSize:10,fontWeight:"900",color:"#9b1c1c",letterSpacing:.7},addButtonSoldOut:{backgroundColor:"#bdbdbd"},'''
))

for old,new in repls:
    if old not in text:
        raise SystemExit(f'PATTERN_NOT_FOUND:\n{old[:180]}')
    text = text.replace(old,new,1)

path.write_text(text,encoding='utf-8')
print('CLICK-FOOD cliente: estoque/checkout/PIX UX corrigidos')
