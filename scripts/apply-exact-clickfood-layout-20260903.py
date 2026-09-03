from pathlib import Path
import re

ROOT=Path('.')


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'[{label}] trecho nao encontrado')
    return text.replace(old,new,1)


def insert_before(text, marker, content, label):
    if marker not in text:
        raise SystemExit(f'[{label}] marcador nao encontrado')
    return text.replace(marker,content+marker,1)


def replace_block(text, pattern, replacement, label):
    out,n=re.subn(pattern,replacement,text,count=1,flags=re.S)
    if n!=1:
        raise SystemExit(f'[{label}] bloco nao encontrado ({n})')
    return out


def set_style(text,name,body):
    # estilos simples sem chaves internas
    pattern=rf'(?<![A-Za-z0-9_]){re.escape(name)}:\{{[^}}]*\}}'
    repl=f'{name}:{{{body}}}'
    out,n=re.subn(pattern,repl,text,count=1)
    if n==0:
        print(f'[style] {name} nao localizado; mantendo atual')
        return text
    return out


def add_styles(text, styles):
    marker='});'
    idx=text.rfind(marker)
    if idx<0:
        raise SystemExit('fim StyleSheet nao encontrado')
    payload='\n  '+',\n  '.join(f'{k}:{{{v}}}' for k,v in styles.items())+',\n'
    return text[:idx]+payload+text[idx:]


# ========================= CLIENTE =========================
p=ROOT/'apps/cliente/App.tsx'
s=p.read_text()
s=replace_once(s,'import React, { useEffect, useMemo, useRef, useState } from "react";','import React, { useEffect, useMemo, useRef, useState } from "react";\nimport AsyncStorage from "@react-native-async-storage/async-storage";','cliente import storage')
s=replace_once(s,'type Tab = "home" | "search" | "orders" | "support" | "profile";','type Tab = "home" | "search" | "orders" | "favorites" | "support" | "profile";','cliente tab')

timeline='''function TrackingTimeline({status}:{status:string}){\n  if(["CANCELLED","REJECTED","PAYMENT_FAILED","REFUNDED"].includes(status))return null;\n  const current=orderProgressIndex(status);\n  const times=["Pedido recebido","Pedido aceito","Em preparação","A caminho","Entregue"];\n  return <View style={styles.timeline}>{times.map((step,index)=><View style={styles.timelineRow} key={step}><View style={styles.timelineRail}><View style={[styles.timelineDot,index<=current&&styles.timelineDotActive]}><Text style={[styles.timelineDotText,index<=current&&styles.timelineDotTextActive]}>{index<current?"✓":index===current?"•":""}</Text></View>{index<times.length-1&&<View style={[styles.timelineLine,index<current&&styles.timelineLineActive]}/>}</View><View style={styles.timelineTextWrap}><Text style={[styles.timelineTitle,index<=current&&styles.timelineTitleActive]}>{step}</Text>{index===current&&index<4&&<Text style={styles.timelineCurrent}>Etapa atual</Text>}</View></View>)}</View>;\n}\n\n'''
s=insert_before(s,'function AuthScreen(){',timeline,'cliente timeline')

s=replace_once(s,'  const[receiptOrderId,setReceiptOrderId]=useState<string|null>(null);','  const[receiptOrderId,setReceiptOrderId]=useState<string|null>(null);\n  const[favoriteStoreIds,setFavoriteStoreIds]=useState<Set<string>>(new Set());','cliente favoritos state')

fav_effect='''  useEffect(()=>{if(!session){setFavoriteStoreIds(new Set());return;}void AsyncStorage.getItem(`@clickfood/customer/favorite-stores-${session.user.id}`).then(raw=>{try{const ids=raw?JSON.parse(raw):[];setFavoriteStoreIds(new Set(Array.isArray(ids)?ids.map(String):[]));}catch{setFavoriteStoreIds(new Set());}});},[session?.user.id]);\n'''
s=insert_before(s,'  useEffect(()=>{if(session){loadStores();loadOrders();loadAddresses();loadReviewed();loadPaymentMethods();loadLoyalty();}',fav_effect,'cliente favoritos effect')

fav_fn='''  async function toggleFavoriteStore(storeId:string){\n    if(!session)return;\n    const next=new Set(favoriteStoreIds);\n    if(next.has(storeId))next.delete(storeId);else next.add(storeId);\n    setFavoriteStoreIds(next);\n    await AsyncStorage.setItem(`@clickfood/customer/favorite-stores-${session.user.id}`,JSON.stringify([...next]));\n  }\n\n'''
s=insert_before(s,'  async function openStore(store:Store){',fav_fn,'cliente favorito funcao')

# Barra superior da loja: simples, carrinho passa a ser flutuante.
old_top='<View style={styles.storeTopbar}><Pressable onPress={()=>{setCartOpen(false);setSelectedStore(null);setSelectedProduct(null);setMessage("");}}><Text style={styles.back}>‹ Voltar</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Abrir carrinho com ${cartQuantity} ${cartQuantity===1?"item":"itens"}`} style={styles.topCartButton} onPress={()=>setCartOpen(true)}><Text style={styles.topCartIcon}>🛒</Text><View style={styles.topCartBody}><Text style={styles.topCartTitle}>Carrinho</Text><Text style={styles.topCartMeta}>{cartQuantity} {cartQuantity===1?"item":"itens"} • {brl(cartSubtotal)}</Text></View><View style={styles.topCartBadge}><Text style={styles.topCartBadgeText}>{cartQuantity}</Text></View></Pressable></View>'
new_top='<View style={styles.storeTopbar}><Pressable onPress={()=>{setCartOpen(false);setSelectedStore(null);setSelectedProduct(null);setMessage("");}}><Text style={styles.back}>‹ Voltar</Text></Pressable><Text numberOfLines={1} style={styles.storeTopTitle}>{selectedStore.name}</Text><View style={{width:54}}/></View>'
s=replace_once(s,old_top,new_top,'cliente top loja')

# Grade de produtos 2 colunas.
s=replace_once(s,'      {visibleProducts.length?visibleProducts.map(product=>{','      <View style={styles.productGrid}>{visibleProducts.length?visibleProducts.map(product=>{','cliente abre grade')
s=replace_once(s,'        return <View style={styles.productRow} key={product.id}>','        return <View style={styles.productTile} key={product.id}>','cliente tile produto')
s=replace_once(s,'      }):<Text style={styles.empty}>Nenhum produto disponível.</Text>}\n\n      {selectedProduct&&<ProductCustomizer','      }):<Text style={styles.empty}>Nenhum produto disponível.</Text>}</View>\n\n      {selectedProduct&&<ProductCustomizer','cliente fecha grade')

# Carrinho flutuante verdadeiro, por cima do conteudo da loja enquanto houver itens.
cart_float='''    {!!cart.length&&<Pressable accessibilityRole="button" accessibilityLabel={`Abrir carrinho com ${cartQuantity} itens`} style={styles.floatingCartTop} onPress={()=>setCartOpen(true)}><View style={styles.floatingCartLeft}><Text style={styles.floatingCartIcon}>🛒</Text><View><Text style={styles.floatingCartTitle}>Carrinho <Text style={styles.floatingCartBadge}>{cartQuantity}</Text></Text><Text style={styles.floatingCartMeta}>Toque para revisar ou finalizar</Text></View></View><Text style={styles.floatingCartPrice}>{brl(cartSubtotal)}</Text></Pressable>}\n'''
s=insert_before(s,'    {pendingCardOrder&&cardTokenization&&<EfiCardPayment',cart_float,'cliente carrinho flutuante')

# Timeline no acompanhamento.
s=replace_once(s,'<OrderProgress status={trackedOrder.status}/>','<TrackingTimeline status={trackedOrder.status}/>','cliente timeline tracking')
s=replace_once(s,'<Text selectable style={styles.deliveryCodeValue}>{deliveryCode}</Text>','<View style={styles.deliveryCodeDigits}>{deliveryCode.split("").map((digit,index)=><View key={`${digit}-${index}`} style={styles.deliveryCodeDigit}><Text selectable style={styles.deliveryCodeDigitText}>{digit}</Text></View>)}</View>','cliente codigo digitos')
s=s.replace('Informe este código ao entregador somente quando ele estiver com você. A entrega só será liberada após a confirmação.','Informe este código ao entregador somente quando ele estiver com você. A entrega só será liberada após ele digitar os 4 números.')

# Favorito no card de loja.
needle='<Text style={[styles.storeStatus,store.open_now&&orderingEnabled?styles.storeOpen:styles.storeClosed]}>{!orderingEnabled?"INDISPONÍVEL":store.orders_paused?"PAUSADA":store.open_now?"ABERTA":"FECHADA"}</Text>'
repl=needle+'<Pressable accessibilityLabel={favoriteStoreIds.has(store.id)?"Remover dos favoritos":"Adicionar aos favoritos"} style={styles.favoriteButton} onPress={event=>{event.stopPropagation?.();void toggleFavoriteStore(store.id);}}><Text style={[styles.favoriteText,favoriteStoreIds.has(store.id)&&styles.favoriteTextActive]}>{favoriteStoreIds.has(store.id)?"♥":"♡"}</Text></Pressable>'
s=replace_once(s,needle,repl,'cliente favorito card')

# Home igual ao mock: busca, categorias, destaques e lojas proximas.
home_block='''  const quickCategories=[{label:"Promoções",icon:"🏷️",query:"promo"},{label:"Lanches",icon:"🍔",query:"lanche"},{label:"Pizzas",icon:"🍕",query:"pizza"},{label:"Bebidas",icon:"🥤",query:"bebida"},{label:"Doces",icon:"🧁",query:"doce"}];\n  const featuredStores=stores.slice(0,2);\n  const favoriteStores=stores.filter(store=>favoriteStoreIds.has(store.id));\n\n  const home=<ScrollView contentContainerStyle={styles.scroll}>\n    <Pressable style={styles.searchBox} onPress={()=>{setQuery("");setTab("search");}}><Text style={styles.searchText}>⌕  Buscar produtos, lojas...</Text><Text style={styles.searchChevron}>⌕</Text></Pressable>\n    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickCategoriesRow}>{quickCategories.map(item=><Pressable key={item.label} style={styles.quickCategory} onPress={()=>{setQuery(item.query);setTab("search");}}><View style={styles.quickCategoryIcon}><Text style={styles.quickCategoryEmoji}>{item.icon}</Text></View><Text style={styles.quickCategoryLabel}>{item.label}</Text></Pressable>)}</ScrollView>\n    <View style={styles.sectionHeader}><Text style={styles.section}>Destaques</Text><Pressable onPress={()=>{setQuery("");setTab("search");}}><Text style={styles.sectionLink}>Ver mais ›</Text></Pressable></View>\n    <View style={styles.featuredGrid}>{featuredStores.map(store=><Pressable key={store.id} style={styles.featuredCard} onPress={()=>openStore(store)}>{store.cover_url?<Image source={{uri:store.cover_url}} style={styles.featuredImage}/>:<View style={[styles.featuredImageFallback,{backgroundColor:store.secondary_color||"#111"}]}><Text style={{color:store.primary_color||"#f4c400",fontWeight:"900"}}>CLICK-FOOD</Text></View>}<View style={styles.featuredBody}><Text numberOfLines={1} style={styles.featuredName}>{store.name}</Text><Text numberOfLines={1} style={styles.featuredMeta}>{store.slogan||"Delivery CLICK-FOOD"}</Text><View style={styles.featuredBottom}><Text style={styles.featuredPrice}>mín. {brl(store.minimum_order)}</Text><View style={styles.featuredPlus}><Text style={styles.featuredPlusText}>+</Text></View></View></View></Pressable>)}</View>\n    <View style={styles.sectionHeader}><Text style={styles.section}>Lojas próximas</Text><Pressable onPress={()=>{setQuery("");setTab("search");}}><Text style={styles.sectionLink}>Ver mais ›</Text></Pressable></View>\n    {stores.length?stores.map(renderStoreCard):<Text style={styles.empty}>Ainda não há lojas ativas.</Text>}\n  </ScrollView>;\n\n'''
s=replace_block(s,r'  const home=<ScrollView contentContainerStyle=\{styles\.scroll\}>.*?</ScrollView>;\n\n(?=  const search=)',home_block,'cliente home')

favorites_block='''  const favorites=<ScrollView contentContainerStyle={styles.scroll}><View style={styles.sectionHeader}><Text style={styles.pageTitle}>Favoritos</Text><Text style={styles.favoriteCounter}>{favoriteStores.length}</Text></View>{favoriteStores.length?favoriteStores.map(renderStoreCard):<View style={styles.favoritesEmpty}><Text style={styles.favoritesEmptyIcon}>♡</Text><Text style={styles.favoritesEmptyTitle}>Nenhuma loja favorita</Text><Text style={styles.favoritesEmptyText}>Toque no coração de uma loja para encontrá-la rapidamente aqui.</Text></View>}</ScrollView>;\n\n'''
s=insert_before(s,'  const trackedOrder=',favorites_block,'cliente favoritos tela')

# Bottom navigation 4 itens como referencia. Busca segue pela barra; ajuda segue no menu superior.
s=replace_once(s,'  const screen=tab==="home"?home:tab==="search"?search:tab==="orders"?ordersView:tab==="support"?support:profile;\n  const tabs:Array<[Tab,string,string]>=[["home","⌂","Início"],["search","⌕","Buscar"],["orders","▤","Pedidos"],["support","?","Ajuda"],["profile","○","Perfil"]];','  const screen=tab==="home"?home:tab==="search"?search:tab==="orders"?ordersView:tab==="favorites"?favorites:tab==="support"?support:profile;\n  const tabs:Array<[Tab,string,string]>=[["home","⌂","Início"],["orders","▤","Pedidos"],["favorites","♡","Favoritos"],["profile","○","Perfil"]];','cliente bottom tabs')

# Ajustes de estilos existentes.
style_updates={
'safe':'flex:1,backgroundColor:"#f7f7f7"',
'scroll':'paddingHorizontal:14,paddingTop:12,paddingBottom:30',
'scrollWithBag':'paddingTop:82,paddingBottom:34',
'storeTopbar':'flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:8,minHeight:42',
'searchBox':'height:48,backgroundColor:"#fff",borderWidth:1,borderColor:"#e2e2e2",borderRadius:14,paddingHorizontal:14,marginBottom:14,flexDirection:"row",alignItems:"center",justifyContent:"space-between"',
'section':'fontSize:18,fontWeight:"900",marginTop:0,marginBottom:0,color:"#171717"',
'discoveryCard':'backgroundColor:"#fff",borderWidth:1,borderColor:"#e6e6e6",borderRadius:15,overflow:"hidden",marginBottom:9,flexDirection:"row",minHeight:82',
'discoveryCover':'width:78,height:"100%",minHeight:82,backgroundColor:"#ececec"',
'discoveryCoverFallback':'width:78,minHeight:82,alignItems:"center",justifyContent:"center"',
'discoveryBody':'padding:10,flex:1',
'discoveryDescription':'fontSize:10,color:"#707680",lineHeight:14,marginTop:5',
'productImage':'width:"100%",height:118,borderRadius:12,backgroundColor:"#eee"',
'productImageFallback':'width:"100%",height:118,borderRadius:12,backgroundColor:"#f1f1f1",alignItems:"center",justifyContent:"center"',
'productName':'fontWeight:"900",fontSize:13,color:"#171717"',
'price':'fontWeight:"900",color:"#111",marginTop:6,fontSize:13',
'addButton':'width:34,height:34,borderRadius:10,backgroundColor:"#f4c400",alignItems:"center",justifyContent:"center",alignSelf:"flex-end",marginTop:7',
'trackingCard':'backgroundColor:"#fff",borderRadius:18,padding:14,marginBottom:14,borderWidth:1,borderColor:"#e6e6e6"',
'trackingKicker':'color:"#8d7000",fontWeight:"900",fontSize:9,letterSpacing:1.1',
'trackingTitle':'color:"#171717",fontSize:19,fontWeight:"900",marginTop:5',
'trackingStatus':'color:"#656565",fontSize:11,marginTop:4,marginBottom:10',
'driverCardBox':'backgroundColor:"#f7f7f7",borderRadius:13,padding:10,marginTop:10,marginBottom:10,flexDirection:"row",alignItems:"center",gap:10,borderWidth:1,borderColor:"#ededed"',
'driverCardName':'color:"#171717",fontSize:14,fontWeight:"900"',
'driverCardMeta':'color:"#666",fontSize:10,marginTop:4',
'deliveryCodeCard':'backgroundColor:"#fffaf0",borderWidth:1,borderColor:"#f4c400",borderRadius:14,padding:13,marginTop:9,marginBottom:10,alignItems:"center"',
'deliveryCodeKicker':'fontSize:10,fontWeight:"900",color:"#806600",letterSpacing:.8',
'deliveryCodeHint':'fontSize:10,color:"#666",lineHeight:15,textAlign:"center",marginTop:9',
'trackDeliveryButton':'backgroundColor:"#f4c400",borderRadius:12,paddingVertical:14,alignItems:"center",marginTop:9',
'trackDeliveryButtonText':'color:"#111",fontSize:10,fontWeight:"900"',
'arrivedBanner':'backgroundColor:"#f4c400",borderRadius:13,padding:13,marginBottom:12',
'cartModalHeader':'backgroundColor:"#fff",padding:15,flexDirection:"row",alignItems:"center",gap:12,borderBottomWidth:1,borderBottomColor:"#e7e7e7"',
'cartModalTitle':'color:"#111",fontSize:22,fontWeight:"900"',
'cartModalSubtitle':'color:"#777",fontSize:10,marginTop:3',
'cartModalClose':'width:38,height:38,borderRadius:19,backgroundColor:"#f2f2f2",alignItems:"center",justifyContent:"center"',
'cartModalCloseText':'color:"#111",fontSize:26,lineHeight:28',
'continueShopping':'borderWidth:1.5,borderColor:"#d6aa00",backgroundColor:"#fff",padding:14,borderRadius:12,alignItems:"center",marginTop:10,marginBottom:7',
'continueShoppingText':'fontSize:10,fontWeight:"900",color:"#9a7900"',
'checkout':'backgroundColor:"#f4c400",padding:15,borderRadius:12,alignItems:"center",marginTop:9',
'bottom':'height:68,backgroundColor:"#fff",borderTopWidth:1,borderTopColor:"#e5e5e5",flexDirection:"row"',
}
for k,v in style_updates.items(): s=set_style(s,k,v)

new_styles={
'storeTopTitle':'fontSize:14,fontWeight:"900",color:"#171717",maxWidth:"64%",textAlign:"center"',
'floatingCartTop':'position:"absolute",top:8,left:12,right:12,height:58,backgroundColor:"#111",borderRadius:14,borderWidth:1.5,borderColor:"#f4c400",paddingHorizontal:13,flexDirection:"row",alignItems:"center",justifyContent:"space-between",zIndex:30,elevation:12,shadowColor:"#000",shadowOpacity:.18,shadowRadius:9,shadowOffset:{width:0,height:4}',
'floatingCartLeft':'flexDirection:"row",alignItems:"center",gap:10,flex:1',
'floatingCartIcon':'fontSize:22',
'floatingCartTitle':'color:"#f4c400",fontSize:13,fontWeight:"900"',
'floatingCartBadge':'backgroundColor:"#f4c400",color:"#111",fontSize:10,fontWeight:"900"',
'floatingCartMeta':'color:"#c8c8c8",fontSize:9,marginTop:2',
'floatingCartPrice':'color:"#fff",fontSize:16,fontWeight:"900",marginLeft:8',
'searchText':'color:"#555",fontSize:12',
'searchChevron':'color:"#111",fontSize:17,fontWeight:"900"',
'quickCategoriesRow':'gap:12,paddingBottom:4,paddingHorizontal:1',
'quickCategory':'width:58,alignItems:"center"',
'quickCategoryIcon':'width:48,height:48,borderRadius:24,backgroundColor:"#fff5c7",borderWidth:1,borderColor:"#f4e39b",alignItems:"center",justifyContent:"center"',
'quickCategoryEmoji':'fontSize:23',
'quickCategoryLabel':'fontSize:9,fontWeight:"800",color:"#333",marginTop:5,textAlign:"center"',
'sectionHeader':'flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:18,marginBottom:9',
'sectionLink':'fontSize:10,color:"#777",fontWeight:"700"',
'featuredGrid':'flexDirection:"row",gap:10',
'featuredCard':'flex:1,backgroundColor:"#fff",borderWidth:1,borderColor:"#e6e6e6",borderRadius:14,overflow:"hidden"',
'featuredImage':'width:"100%",height:112,backgroundColor:"#eee"',
'featuredImageFallback':'width:"100%",height:112,alignItems:"center",justifyContent:"center"',
'featuredBody':'padding:9',
'featuredName':'fontSize:12,fontWeight:"900",color:"#171717"',
'featuredMeta':'fontSize:9,color:"#777",marginTop:3',
'featuredBottom':'flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:9',
'featuredPrice':'fontSize:10,fontWeight:"900",color:"#111",flex:1',
'featuredPlus':'width:28,height:28,borderRadius:9,backgroundColor:"#f4c400",alignItems:"center",justifyContent:"center"',
'featuredPlusText':'fontSize:19,fontWeight:"900",color:"#111"',
'favoriteButton':'width:32,height:32,borderRadius:16,backgroundColor:"#fafafa",alignItems:"center",justifyContent:"center",marginLeft:2,borderWidth:1,borderColor:"#eee"',
'favoriteText':'fontSize:20,color:"#999"',
'favoriteTextActive':'color:"#d2a700"',
'favoriteCounter':'minWidth:30,height:30,borderRadius:15,backgroundColor:"#f4c400",fontWeight:"900",textAlign:"center",textAlignVertical:"center",paddingTop:6',
'favoritesEmpty':'alignItems:"center",justifyContent:"center",paddingVertical:70,paddingHorizontal:28',
'favoritesEmptyIcon':'fontSize:54,color:"#c7c7c7"',
'favoritesEmptyTitle':'fontSize:18,fontWeight:"900",marginTop:10,color:"#222"',
'favoritesEmptyText':'fontSize:11,color:"#777",textAlign:"center",lineHeight:17,marginTop:6',
'productGrid':'flexDirection:"row",flexWrap:"wrap",gap:10,alignItems:"stretch"',
'productTile':'width:"48%",backgroundColor:"#fff",borderWidth:1,borderColor:"#e7e7e7",borderRadius:14,padding:9,marginBottom:2',
'timeline':'marginTop:3,marginBottom:6',
'timelineRow':'flexDirection:"row",minHeight:43',
'timelineRail':'width:28,alignItems:"center"',
'timelineDot':'width:20,height:20,borderRadius:10,borderWidth:2,borderColor:"#c9c9c9",backgroundColor:"#fff",alignItems:"center",justifyContent:"center",zIndex:2',
'timelineDotActive':'borderColor:"#d3a900",backgroundColor:"#f4c400"',
'timelineDotText':'fontSize:10,fontWeight:"900",color:"#aaa"',
'timelineDotTextActive':'color:"#111"',
'timelineLine':'position:"absolute",top:20,bottom:-23,width:2,backgroundColor:"#ddd"',
'timelineLineActive':'backgroundColor:"#f4c400"',
'timelineTextWrap':'flex:1,paddingTop:1,paddingBottom:9',
'timelineTitle':'fontSize:12,fontWeight:"800",color:"#9a9a9a"',
'timelineTitleActive':'color:"#222"',
'timelineCurrent':'fontSize:9,color:"#8d7000",fontWeight:"800",marginTop:2',
'deliveryCodeDigits':'flexDirection:"row",gap:7,justifyContent:"center",marginTop:10',
'deliveryCodeDigit':'width:48,height:52,borderRadius:10,backgroundColor:"#fff1b1",borderWidth:1,borderColor:"#f0d05c",alignItems:"center",justifyContent:"center"',
'deliveryCodeDigitText':'fontSize:25,fontWeight:"900",color:"#111"',
}
s=add_styles(s,new_styles)
p.write_text(s)


# ================= CLIENTE SHELL =================
p=ROOT/'apps/cliente/CustomerProfessionalShell.tsx'
s=p.read_text()
s=replace_once(s,'void loadNotifications();void registerPush();','void loadAddresses();void loadNotifications();void registerPush();','cliente shell carrega endereco')
s=insert_before(s,' return <View style={[styles.root,{paddingTop:topInset}]}>',' const defaultAddress=addresses.find(item=>item.is_default)??addresses[0]??null;\n const topAddress=defaultAddress?`${defaultAddress.street}${defaultAddress.number?`, ${defaultAddress.number}`:""}`:"Defina seu endereço";\n','cliente shell endereco vars')
old='<View style={styles.topbar}><Pressable accessibilityLabel="Abrir menu" style={styles.iconButton} onPress={()=>setDrawer(true)}><Text style={styles.menuIcon}>☰</Text></Pressable><Text style={styles.topBrand}><Text style={styles.yellow}>CLICK</Text>-FOOD</Text><Pressable accessibilityLabel={`Notificações. ${unread} não lidas`} style={styles.iconButton} onPress={()=>{setNotificationsOpen(true);void loadNotifications();}}><Text style={styles.bell}>🔔</Text>{unread>0&&<View style={styles.badge}><Text style={styles.badgeText}>{unread>99?"99+":unread}</Text></View>}</Pressable></View>'
new='<View style={styles.topbar}><Pressable accessibilityLabel="Abrir menu" style={styles.iconButton} onPress={()=>setDrawer(true)}><Text style={styles.menuIcon}>☰</Text></Pressable><Pressable style={styles.addressTopBlock} onPress={()=>go("ADDRESSES")}><Text style={styles.addressTopLabel}>Entrega em</Text><Text numberOfLines={1} style={styles.addressTopValue}>{topAddress}⌄</Text></Pressable><Pressable accessibilityLabel={`Notificações. ${unread} não lidas`} style={styles.iconButton} onPress={()=>{setNotificationsOpen(true);void loadNotifications();}}><Text style={styles.bell}>🔔</Text>{unread>0&&<View style={styles.badge}><Text style={styles.badgeText}>{unread>99?"99+":unread}</Text></View>}</Pressable></View>'
s=replace_once(s,old,new,'cliente shell topbar')
s=set_style(s,'topbar','height:62,backgroundColor:"#fff",borderBottomWidth:1,borderBottomColor:"#e7e7e7",flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:10,zIndex:20')
s=set_style(s,'iconButton','width:42,height:42,borderRadius:21,alignItems:"center",justifyContent:"center",position:"relative"')
s=add_styles(s,{
'addressTopBlock':'flex:1,alignItems:"flex-start",justifyContent:"center",paddingHorizontal:8,minWidth:0',
'addressTopLabel':'fontSize:9,color:"#777",fontWeight:"700"',
'addressTopValue':'fontSize:13,fontWeight:"900",color:"#111",marginTop:1,maxWidth:"100%"',
})
p.write_text(s)


# ========================= ENTREGADOR index =========================
p=ROOT/'apps/entregador/index.js'
s=p.read_text()
s=s.replace('import DriverIdleHomeShell from "./DriverIdleHomeShell";\n','')
s=replace_once(s,'<DriverProfessionalShell><DriverIdleHomeShell><App/></DriverIdleHomeShell></DriverProfessionalShell>','<DriverProfessionalShell><App/></DriverProfessionalShell>','driver remove idle map shell')
p.write_text(s)


# ========================= ENTREGADOR SHELL =========================
p=ROOT/'apps/entregador/DriverProfessionalShell.tsx'
s=p.read_text()
s=replace_once(s,' const[driverId,setDriverId]=useState<string|null>(null);const[history,setHistory]=useState<HistoryRow[]>([]);',' const[driverId,setDriverId]=useState<string|null>(null);const[driverOnline,setDriverOnline]=useState(false);const[history,setHistory]=useState<HistoryRow[]>([]);','driver shell online state')
s=replace_once(s,'if(!session){setNotifications([]);setDriverId(null);return;}','if(!session){setNotifications([]);setDriverId(null);setDriverOnline(false);return;}','driver shell reset online')
s=replace_once(s,'async function loadDriver(){if(!session)return;const{data}=await supabase.from("drivers").select("id").eq("user_id",session.user.id).maybeSingle();setDriverId(data?.id?String(data.id):null);}','async function loadDriver(){if(!session)return;const{data}=await supabase.from("drivers").select("id,online").eq("user_id",session.user.id).maybeSingle();setDriverId(data?.id?String(data.id):null);setDriverOnline(Boolean(data?.online));}','driver shell load online')
s=insert_before(s,' return <View style={[styles.root,{paddingTop:topInset}]}>',' const driverFirstName=String(activeSession.user.user_metadata?.full_name??"Entregador").trim().split(/\\s+/)[0]||"Entregador";\n','driver shell greeting var')
old='<View style={styles.topbar}><Pressable accessibilityLabel="Abrir menu" style={styles.iconButton} onPress={()=>setDrawer(true)}><Text style={styles.menuIcon}>☰</Text></Pressable><View style={styles.brandBlock}><Text style={styles.topBrand}><Text style={styles.yellow}>CLICK</Text>-FOOD</Text><Text style={styles.role}>ENTREGADOR</Text></View><Pressable accessibilityLabel={`Notificações. ${unread} não lidas`} style={styles.iconButton} onPress={()=>{setNotificationsOpen(true);void loadNotifications();}}><Text style={styles.bell}>🔔</Text>{unread>0&&<View style={styles.badge}><Text style={styles.badgeText}>{unread>99?"99+":unread}</Text></View>}</Pressable></View>'
new='<View style={styles.topbar}><Pressable accessibilityLabel="Abrir menu" style={styles.iconButton} onPress={()=>setDrawer(true)}><Text style={styles.menuIcon}>☰</Text></Pressable><View style={styles.driverGreeting}><Text style={styles.greetingText}>Olá, {driverFirstName}</Text><Text style={[styles.onlineState,driverOnline&&styles.onlineStateActive]}>● {driverOnline?"Online":"Offline"}</Text></View><Pressable accessibilityLabel={`Notificações. ${unread} não lidas`} style={styles.iconButton} onPress={()=>{setNotificationsOpen(true);void loadNotifications();}}><Text style={styles.bell}>🔔</Text>{unread>0&&<View style={styles.badge}><Text style={styles.badgeText}>{unread>99?"99+":unread}</Text></View>}</Pressable></View>'
s=replace_once(s,old,new,'driver shell topbar')
s=set_style(s,'root','flex:1,backgroundColor:"#0d0d0d"')
s=set_style(s,'topbar','height:64,backgroundColor:"#101010",borderBottomWidth:1,borderBottomColor:"#242424",flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:10,zIndex:20')
s=set_style(s,'menuIcon','fontSize:25,fontWeight:"900",color:"#fff"')
s=set_style(s,'bell','fontSize:19,color:"#fff"')
s=set_style(s,'body','flex:1,paddingBottom:0,backgroundColor:"#0d0d0d"')
s=add_styles(s,{
'driverGreeting':'flex:1,alignItems:"flex-start",justifyContent:"center",paddingHorizontal:9',
'greetingText':'fontSize:13,fontWeight:"900",color:"#fff"',
'onlineState':'fontSize:10,fontWeight:"800",color:"#999",marginTop:2',
'onlineStateActive':'color:"#35c76f"',
})
p.write_text(s)


# ========================= ENTREGADOR APP =========================
p=ROOT/'apps/entregador/App.tsx'
s=p.read_text()
status_map='''\nconst driverStatusLabel:Record<string,string>={DRIVER_ASSIGNED:"Entrega confirmada",DRIVER_TO_STORE:"Indo até a loja",DRIVER_AT_STORE:"Na loja",PICKUP_CONFIRMED:"Pedido retirado",DRIVER_TO_CUSTOMER:"A caminho do cliente",DRIVER_AT_CUSTOMER:"Chegou ao cliente",CUSTOMER_UNAVAILABLE:"Cliente não localizado",INCIDENT:"Ocorrência registrada",RETURN_REQUIRED:"Retorno necessário",DELIVERED:"Entregue"};\n'''
s=insert_before(s,'\nfunction AuthScreen()',status_map,'driver status labels')

home='''  const nextStepText=active?.status==="DRIVER_AT_CUSTOMER"?"Aguardando código do cliente para finalizar a entrega.":active?.status==="DRIVER_AT_STORE"?"Aguardando o código de retirada fornecido pela loja.":nextAction?.[1]??"Aguardando próxima atualização.";\n  const destinationLine=active?.destination?`${active.destination.street}, ${active.destination.number??"s/n"}${active.destination.district?` • ${active.destination.district}`:""}`:"Endereço será exibido quando a rota ao cliente for liberada.";\n\n  const home=<ScrollView contentContainerStyle={styles.content}>\n    {!!message&&<Text style={styles.notice}>{message}</Text>}\n    {active?<><View style={styles.driverActiveCard}><View style={styles.driverActiveHeader}><View><Text style={styles.driverActiveKicker}>Entrega em andamento</Text><Text style={styles.driverActiveOrder}>Pedido #{active.orderNumber}</Text></View><View style={styles.driverActiveStatusDot}/></View><View style={styles.driverDivider}/><Text style={styles.driverFieldLabel}>{active.status.includes("STORE")||active.status==="DRIVER_ASSIGNED"?"Retirada em":"Entrega para"}</Text><Text style={styles.driverFieldValue}>{active.status.includes("STORE")||active.status==="DRIVER_ASSIGNED"?active.pickup.storeName:"Cliente CLICK-FOOD"}</Text><View style={styles.driverDivider}/><Text style={styles.driverFieldLabel}>Endereço</Text><Text style={styles.driverAddress}>{active.status.includes("STORE")||active.status==="DRIVER_ASSIGNED"?active.pickup.storeName:destinationLine}</Text><Text style={styles.driverStatusText}>{driverStatusLabel[active.status]??active.status}</Text><Pressable style={styles.mapActionButton} onPress={()=>setMapOpen(true)}><Text style={styles.mapActionText}>⌖  VER MAPA / ROTA</Text></Pressable></View><View style={styles.nextStepCard}><Text style={styles.nextStepKicker}>Próxima etapa</Text><Text style={styles.nextStepTitle}>{nextStepText}</Text>{needsCode&&<TextInput style={styles.codeInput} placeholder="Código de 4 dígitos" placeholderTextColor="#777" keyboardType="number-pad" maxLength={4} value={code} onChangeText={setCode}/>} {nextAction&&<Pressable style={styles.actionButton} onPress={()=>deliveryAction(nextAction[0])}><Text style={styles.actionText}>{nextAction[1]}</Text></Pressable>}{active.status==="DRIVER_AT_CUSTOMER"&&<Pressable style={styles.problemSecondary} onPress={()=>Alert.alert("Cliente não encontrado","Confirme apenas se você já está no endereço e tentou localizar o cliente.",[{text:"VOLTAR",style:"cancel"},{text:"CONFIRMAR",style:"destructive",onPress:()=>reportDeliveryProblem("CUSTOMER_UNAVAILABLE")}])}><Text style={styles.problemSecondaryText}>CLIENTE NÃO ENCONTRADO</Text></Pressable>}{["DRIVER_ASSIGNED","DRIVER_TO_STORE","DRIVER_AT_STORE","PICKUP_CONFIRMED","DRIVER_TO_CUSTOMER","DRIVER_AT_CUSTOMER","RETURN_REQUIRED"].includes(active.status)&&<Pressable style={styles.problemButton} onPress={()=>{setIncidentReason("");setIncidentModal(true)}}><Text style={styles.problemText}>REPORTAR PROBLEMA</Text></Pressable>}{["CUSTOMER_UNAVAILABLE","INCIDENT","RETURN_REQUIRED"].includes(active.status)&&<Text style={styles.supportActive}>Suporte acionado. Aguarde orientação no aplicativo.</Text>}<Text style={styles.earning}>Ganho desta entrega: {brl(active.earning)}</Text></View></>:<><View style={styles.idleHero}><Text style={styles.idleHeroKicker}>{driver.online?"VOCÊ ESTÁ ONLINE":"VOCÊ ESTÁ OFFLINE"}</Text><Text style={styles.idleHeroTitle}>{driver.online?"Aguardando entregas":"Fique online para começar"}</Text><Text style={styles.idleHeroText}>{driver.online?"Quando surgir uma entrega compatível, o chamado aparecerá automaticamente.":"Ative seu status para receber chamadas próximas."}</Text></View><View style={styles.earningsCard}><Text style={styles.earningsLabel}>GANHOS CONCLUÍDOS</Text><Text style={styles.earningsValue}>{brl(completedTotal)}</Text><View style={styles.stats}><View><Text style={styles.statValue}>{history.length}</Text><Text style={styles.statLabel}>entregas</Text></View><View><Text style={styles.statValue}>{driver.rating.toFixed(1)} ★</Text><Text style={styles.statLabel}>avaliação</Text></View><View><Text style={styles.statValue}>{Math.round(driver.acceptance_rate)}%</Text><Text style={styles.statLabel}>aceitação</Text></View></View></View><Pressable style={[styles.onlineButton,driver.online&&styles.offlineButton]} onPress={toggleOnline}><Text style={[styles.onlineText,driver.online&&styles.onlineTextOffline]}>{driver.online?"FICAR OFFLINE":"FICAR ONLINE"}</Text></Pressable></>}\n  </ScrollView>;\n\n'''
s=replace_block(s,r'  const home=<ScrollView contentContainerStyle=\{styles\.content\}>.*?</ScrollView>;\n\n(?=  const historyView=)',home,'driver home')

s=replace_once(s,'  const tabs:Array<[Screen,string,string]>=[["home","⌂","Início"],["history","▤","Entregas"],["wallet","$","Ganhos"],["profile","○","Perfil"]];','  const tabs:Array<[Screen,string,string]>=[["home","▣","Entregas"],["history","◷","Histórico"],["wallet","▤","Carteira"],["profile","○","Perfil"]];','driver tabs')
s=replace_once(s,'<StatusBar barStyle="dark-content" backgroundColor="#f6f6f6"/>','<StatusBar barStyle="light-content" backgroundColor="#0d0d0d"/>','driver statusbar')

style_updates={
'safe':'flex:1,backgroundColor:"#0d0d0d"',
'content':'paddingHorizontal:14,paddingTop:12,paddingBottom:30,backgroundColor:"#0d0d0d",flexGrow:1',
'notice':'backgroundColor:"#2b250c",color:"#f4c400",padding:11,borderRadius:11,marginVertical:8,borderWidth:1,borderColor:"#5b4b00"',
'earningsCard':'backgroundColor:"#151515",borderRadius:17,padding:17,borderWidth:1,borderColor:"#292929",marginTop:12',
'earningsLabel':'fontSize:9,fontWeight:"900",letterSpacing:1,color:"#a5a5a5"',
'earningsValue':'fontSize:30,fontWeight:"900",color:"#fff",marginTop:5',
'onlineButton':'backgroundColor:"#f4c400",paddingVertical:16,borderRadius:13,alignItems:"center",marginTop:13',
'offlineButton':'backgroundColor:"#171717",borderWidth:1,borderColor:"#444"',
'onlineText':'fontWeight:"900",fontSize:12,color:"#111"',
'mapActionButton':'backgroundColor:"#f4c400",borderRadius:11,paddingVertical:14,alignItems:"center",marginTop:13',
'mapActionText':'color:"#111",fontWeight:"900",fontSize:10',
'codeInput':'borderWidth:1,borderColor:"#444",backgroundColor:"#0f0f0f",color:"#fff",borderRadius:11,padding:13,fontSize:18,textAlign:"center",letterSpacing:5,marginTop:12',
'actionButton':'backgroundColor:"#f4c400",paddingVertical:14,borderRadius:11,alignItems:"center",marginTop:11',
'actionText':'fontWeight:"900",fontSize:10,color:"#111"',
'earning':'textAlign:"center",color:"#74d99a",fontWeight:"900",marginTop:12',
'problemButton':'borderWidth:1,borderColor:"#8f3d36",padding:11,borderRadius:11,alignItems:"center",marginTop:9,backgroundColor:"#1b1010"',
'problemText':'fontWeight:"900",color:"#ff9f96",fontSize:10',
'problemSecondary':'borderWidth:1,borderColor:"#7b6712",padding:11,borderRadius:11,alignItems:"center",marginTop:9,backgroundColor:"#211d0b"',
'problemSecondaryText':'fontWeight:"900",color:"#f4c400",fontSize:10',
'supportActive':'backgroundColor:"#211d0b",color:"#f4c400",padding:10,borderRadius:10,marginTop:10,fontWeight:"800",fontSize:10',
'bottom':'minHeight:70,backgroundColor:"#101010",borderTopWidth:1,borderTopColor:"#2a2a2a",flexDirection:"row",paddingVertical:6',
'tabIcon':'fontSize:19,color:"#777"',
'tabText':'fontSize:9,fontWeight:"700",color:"#888",marginTop:3',
'tabActive':'color:"#f4c400",fontWeight:"900"',
'mapModalSafe':'flex:1,backgroundColor:"#111"',
}
for k,v in style_updates.items(): s=set_style(s,k,v)

new_styles={
'onlineTextOffline':'color:"#fff"',
'idleHero':'backgroundColor:"#151515",borderRadius:18,padding:18,borderWidth:1,borderColor:"#292929"',
'idleHeroKicker':'fontSize:9,fontWeight:"900",letterSpacing:1.1,color:"#f4c400"',
'idleHeroTitle':'fontSize:23,fontWeight:"900",color:"#fff",marginTop:7',
'idleHeroText':'fontSize:11,color:"#aaa",lineHeight:17,marginTop:6',
'driverActiveCard':'backgroundColor:"#151515",borderRadius:18,padding:16,borderWidth:1,borderColor:"#343434"',
'driverActiveHeader':'flexDirection:"row",alignItems:"center",justifyContent:"space-between"',
'driverActiveKicker':'fontSize:11,color:"#ddd",fontWeight:"800"',
'driverActiveOrder':'fontSize:19,color:"#fff",fontWeight:"900",marginTop:5',
'driverActiveStatusDot':'width:12,height:12,borderRadius:6,backgroundColor:"#39c872",shadowColor:"#39c872",shadowOpacity:.5,shadowRadius:5',
'driverDivider':'height:1,backgroundColor:"#343434",marginVertical:13',
'driverFieldLabel':'fontSize:9,color:"#a4a4a4",fontWeight:"800",textTransform:"uppercase"',
'driverFieldValue':'fontSize:16,color:"#fff",fontWeight:"900",marginTop:5',
'driverAddress':'fontSize:14,color:"#fff",fontWeight:"800",lineHeight:20,marginTop:5',
'driverStatusText':'fontSize:10,color:"#f4c400",fontWeight:"900",marginTop:10',
'nextStepCard':'backgroundColor:"#121212",borderRadius:16,padding:15,borderWidth:1,borderColor:"#272727",marginTop:12',
'nextStepKicker':'fontSize:10,color:"#aaa",fontWeight:"900"',
'nextStepTitle':'fontSize:15,color:"#fff",fontWeight:"800",lineHeight:21,marginTop:7',
}
s=add_styles(s,new_styles)
p.write_text(s)

print('Layout CLICK-FOOD aplicado com sucesso.')
