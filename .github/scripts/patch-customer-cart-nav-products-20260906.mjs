import fs from 'node:fs';

const path='apps/cliente/App.tsx';
let s=fs.readFileSync(path,'utf8');

function replaceOnce(oldText,newText,label){
  if(!s.includes(oldText))throw new Error(`${label}: padrão não encontrado`);
  s=s.replace(oldText,newText);
}

// 1) Quantidade digitável + limpar carrinho.
replaceOnce(
`  function changeQty(cartKey:string,delta:number){
    setCart(current=>current.map(item=>item.cartKey===cartKey?{...item,quantity:item.quantity+delta}:item).filter(item=>item.quantity>0));
  }
`,
`  function changeQty(cartKey:string,delta:number){
    setCart(current=>current.map(item=>item.cartKey===cartKey?{...item,quantity:item.quantity+delta}:item).filter(item=>item.quantity>0));
  }

  function setQty(cartKey:string,raw:string){
    const digits=raw.replace(/\\D/g,"");
    const quantity=Math.max(1,Math.min(999,Number(digits||"1")));
    setCart(current=>current.map(item=>item.cartKey===cartKey?{...item,quantity}:item));
  }

  function clearCart(){
    if(!cart.length)return;
    Alert.alert("Limpar carrinho","Remover todos os itens do carrinho?",[
      {text:"Cancelar",style:"cancel"},
      {text:"Limpar",style:"destructive",onPress:()=>{setCart([]);setDeliveryPreview(null);setMessage("Carrinho limpo.");}},
    ]);
  }
`,
'funções do carrinho');

// 2) Barra inferior persistente também dentro da loja.
replaceOnce(
`  if(loading)return <SafeAreaView style={styles.center}><Text style={styles.brand}><Text style={styles.yellow}>CLICK</Text>-FOOD</Text><Text>Carregando...</Text></SafeAreaView>;
  if(!session)return <AuthScreen/>;

  if(selectedStore){`,
`  const tabs:Array<[Tab,string,string]>=[["home","⌂","Início"],["orders","▤","Pedidos"],["favorites","♡","Favoritos"],["profile","○","Perfil"]];
  const goToTab=(key:Tab)=>{setCartOpen(false);setSelectedProduct(null);setSelectedStore(null);setMessage("");setTab(key);};
  const bottomNav=<View style={styles.bottom}>{tabs.map(([key,icon,label])=><Pressable style={styles.tab} key={key} onPress={()=>goToTab(key)}><Text style={[styles.tabIcon,tab===key&&styles.tabActive]}>{icon}</Text><Text style={[styles.tabLabel,tab===key&&styles.tabActive]}>{label}</Text></Pressable>)}</View>;

  if(loading)return <SafeAreaView style={styles.center}><Text style={styles.brand}><Text style={styles.yellow}>CLICK</Text>-FOOD</Text><Text>Carregando...</Text></SafeAreaView>;
  if(!session)return <AuthScreen/>;

  if(selectedStore){`,
'barra inferior persistente');

replaceOnce(
`return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content"/><ScrollView ref={storeScrollRef} contentContainerStyle={[styles.scroll,cart.length?styles.scrollWithBag:undefined]}>`,
`return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content"/><ScrollView style={styles.storeScroll} ref={storeScrollRef} contentContainerStyle={[styles.scroll,cart.length?styles.scrollWithBag:undefined]}>`,
'scroll da loja');

replaceOnce(
`    {pendingCardOrder&&cardTokenization&&<EfiCardPayment visible config={cardTokenization} order={pendingCardOrder} defaults={{name:String(session.user.user_metadata?.full_name??""),email:String(session.user.email??""),phone:String(session.user.user_metadata?.phone??"")}} onCancel={cancelPendingCardPayment} onComplete={completeCardPayment}/>}
    </SafeAreaView>;`,
`    {pendingCardOrder&&cardTokenization&&<EfiCardPayment visible config={cardTokenization} order={pendingCardOrder} defaults={{name:String(session.user.user_metadata?.full_name??""),email:String(session.user.email??""),phone:String(session.user.user_metadata?.phone??"")}} onCancel={cancelPendingCardPayment} onComplete={completeCardPayment}/>}
    {bottomNav}
    </SafeAreaView>;`,
'barra inferior na loja');

// 3) Imagem do produto abre o produto e permite adicionar/personalizar.
replaceOnce(
`          {product.image_url?<Image source={{uri:product.image_url}} style={[styles.productImage,soldOut&&styles.productImageSoldOut]}/>:<View style={[styles.productImageFallback,soldOut&&styles.productImageSoldOut]}><Text style={styles.productImageFallbackText}>🍽️</Text></View>}`,
`          <Pressable accessibilityRole="button" accessibilityLabel={soldOut?\`${'${product.name} esgotado'}\`:\`Abrir ${'${product.name}'}\`} disabled={soldOut} style={styles.productImageButton} onPress={()=>beginProduct(product)}>{product.image_url?<Image source={{uri:product.image_url}} style={[styles.productImage,soldOut&&styles.productImageSoldOut]}/>:<View style={[styles.productImageFallback,soldOut&&styles.productImageSoldOut]}><Text style={styles.productImageFallbackText}>🍽️</Text></View>}</Pressable>`,
'imagem clicável do produto');

// 4) Cabeçalho do carrinho com botão LIMPAR.
replaceOnce(
`<Text style={styles.cartModalSubtitle}>{selectedStore.name} • {cartQuantity} {cartQuantity===1?"item":"itens"}</Text></View><Pressable accessibilityLabel="Fechar carrinho" style={styles.cartModalClose}`,
`<Text style={styles.cartModalSubtitle}>{selectedStore.name} • {cartQuantity} {cartQuantity===1?"item":"itens"}</Text></View>{!!cart.length&&<Pressable accessibilityLabel="Limpar carrinho" style={styles.clearCartButton} onPress={clearCart}><Text style={styles.clearCartButtonText}>LIMPAR</Text></Pressable>}<Pressable accessibilityLabel="Fechar carrinho" style={styles.cartModalClose}`,
'botão limpar carrinho');

// 5) Quantidade com - / campo digitável / +.
replaceOnce(
`          <View style={styles.qty}><Pressable onPress={()=>changeQty(item.cartKey,-1)}><Text>−</Text></Pressable><Text>{item.quantity}</Text><Pressable onPress={()=>changeQty(item.cartKey,1)}><Text>+</Text></Pressable></View>`,
`          <View style={styles.qty}><Pressable accessibilityLabel="Diminuir quantidade" style={styles.qtyButton} onPress={()=>changeQty(item.cartKey,-1)}><Text style={styles.qtyButtonText}>−</Text></Pressable><TextInput key={\`${'${item.cartKey}-${item.quantity}'}\`} accessibilityLabel="Quantidade do produto" style={styles.qtyInput} defaultValue={String(item.quantity)} keyboardType="number-pad" selectTextOnFocus maxLength={3} onEndEditing={event=>setQty(item.cartKey,event.nativeEvent.text)}/><Pressable accessibilityLabel="Aumentar quantidade" style={styles.qtyButton} onPress={()=>changeQty(item.cartKey,1)}><Text style={styles.qtyButtonText}>+</Text></Pressable></View>`,
'quantidade digitável');

// 6) Remover atalhos de categorias fixos que não eram configurados pela Matriz.
replaceOnce(
`  const quickCategories=[{label:"Promoções",icon:"🏷️",query:"promo"},{label:"Lanches",icon:"🍔",query:"lanche"},{label:"Pizzas",icon:"🍕",query:"pizza"},{label:"Bebidas",icon:"🥤",query:"bebida"},{label:"Doces",icon:"🧁",query:"doce"}];
`,
``,
'atalhos fixos');

replaceOnce(
`    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickCategoriesRow}>{quickCategories.map(item=><Pressable key={item.label} style={styles.quickCategory} onPress={()=>{setQuery(item.query);setTab("search");}}><View style={styles.quickCategoryIcon}><Text style={styles.quickCategoryEmoji}>{item.icon}</Text></View><Text style={styles.quickCategoryLabel}>{item.label}</Text></Pressable>)}</ScrollView>
`,
``,
'linha de atalhos fixos');

// 7) Reusar a mesma barra inferior na raiz e evitar declaração duplicada.
replaceOnce(
`  const tabs:Array<[Tab,string,string]>=[["home","⌂","Início"],["orders","▤","Pedidos"],["favorites","♡","Favoritos"],["profile","○","Perfil"]];
  return <SafeAreaView style={styles.safe}>`,
`  return <SafeAreaView style={styles.safe}>`,
'declaração duplicada de tabs');

replaceOnce(
`<CustomerOrderReceipt orderId={receiptOrderId} onClose={()=>setReceiptOrderId(null)}/><View style={styles.bottom}>{tabs.map(([key,icon,label])=><Pressable style={styles.tab} key={key} onPress={()=>setTab(key)}><Text style={[styles.tabIcon,tab===key&&styles.tabActive]}>{icon}</Text><Text style={[styles.tabLabel,tab===key&&styles.tabActive]}>{label}</Text></Pressable>)}</View></SafeAreaView>;`,
`<CustomerOrderReceipt orderId={receiptOrderId} onClose={()=>setReceiptOrderId(null)}/>{bottomNav}</SafeAreaView>;`,
'barra inferior raiz');

// 8) Estilos novos.
replaceOnce(
`  safe:{flex:1,backgroundColor:"#f7f7f7"},center:{flex:1,alignItems:"center",justifyContent:"center",gap:10},scroll:{paddingHorizontal:14,paddingTop:12,paddingBottom:108},scrollWithBag:{paddingTop:82,paddingBottom:34},`,
`  safe:{flex:1,backgroundColor:"#f7f7f7"},center:{flex:1,alignItems:"center",justifyContent:"center",gap:10},storeScroll:{flex:1},scroll:{paddingHorizontal:14,paddingTop:12,paddingBottom:108},scrollWithBag:{paddingTop:82,paddingBottom:34},`,
'estilo storeScroll');

replaceOnce(
`cartModalClose:{width:38,height:38,borderRadius:19,backgroundColor:"#f2f2f2",alignItems:"center",justifyContent:"center"},cartModalCloseText:{color:"#111",fontSize:26,lineHeight:28},`,
`clearCartButton:{backgroundColor:"#fff3f1",borderWidth:1,borderColor:"#efc4bf",borderRadius:10,paddingVertical:9,paddingHorizontal:10},clearCartButtonText:{fontSize:9,fontWeight:"900",color:"#a6372e"},cartModalClose:{width:38,height:38,borderRadius:19,backgroundColor:"#f2f2f2",alignItems:"center",justifyContent:"center"},cartModalCloseText:{color:"#111",fontSize:26,lineHeight:28},`,
'estilo limpar carrinho');

replaceOnce(
`productImage:{width:"100%",height:118,borderRadius:12,backgroundColor:"#eee"},`,
`productImageButton:{width:"100%",borderRadius:12,overflow:"hidden"},productImage:{width:"100%",height:118,borderRadius:12,backgroundColor:"#eee"},`,
'estilo imagem clicável');

replaceOnce(
`qty:{flexDirection:"row",gap:14,alignItems:"center",borderWidth:1,borderColor:"#ddd",borderRadius:10,paddingVertical:8,paddingHorizontal:10},`,
`qty:{flexDirection:"row",alignItems:"center",borderWidth:1,borderColor:"#ddd",borderRadius:10,paddingVertical:4,paddingHorizontal:5,gap:4},qtyButton:{width:30,height:34,alignItems:"center",justifyContent:"center",borderRadius:8,backgroundColor:"#f5f5f5"},qtyButtonText:{fontSize:20,fontWeight:"900",color:"#222"},qtyInput:{width:44,height:34,borderWidth:1,borderColor:"#e0e0e0",borderRadius:8,backgroundColor:"#fff",textAlign:"center",paddingVertical:0,paddingHorizontal:4,fontSize:13,fontWeight:"900",color:"#111"},`,
'estilo quantidade digitável');

fs.writeFileSync(path,s);
console.log('Correções do app Cliente aplicadas: produto clicável, carrinho, navegação persistente e atalhos fixos removidos.');
