from pathlib import Path

path = Path("apps/cliente/App.tsx")
text = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: esperado 1 trecho, encontrado {count}")
    text = text.replace(old, new, 1)

old = '''  const home=<ScrollView contentContainerStyle={styles.scroll}>
    <View style={styles.header}><View><Text style={styles.brand}><Text style={styles.yellow}>CLICK</Text>-FOOD</Text><Text style={styles.kicker}>LOJAS DISPONÍVEIS</Text></View><View style={styles.avatar}><Text>{String(session.user.user_metadata?.full_name??"CF").slice(0,2).toUpperCase()}</Text></View></View>
    <Pressable style={styles.searchBox} onPress={()=>setTab("search")}><Text>⌕  O que você quer pedir hoje?</Text></Pressable>
    <View style={styles.hero}><View style={{flex:1}}><Text style={styles.heroKicker}>CLICK-FOOD</Text><Text style={styles.heroTitle}>Peça, acompanhe e aproveite.</Text><Text style={styles.heroText}>Seu pedido é calculado e validado com segurança no servidor.</Text></View><Text style={styles.heroEmoji}>🍔</Text></View>
    <Text style={styles.section}>Lojas</Text>
    {stores.length?stores.map(store=><Pressable style={styles.storeCard} key={store.id} onPress={()=>openStore(store)}>{store.logo_url?<Image source={{uri:store.logo_url}} style={styles.storeLogoCard}/>:<View style={styles.storeIcon}><Text style={{fontSize:32}}>🍽️</Text></View>}<View style={{flex:1}}><Text style={styles.productName}>{store.name}</Text><Text style={styles.meta}>{store.description||"Cardápio disponível"}</Text><Text style={styles.meta}>Mínimo {brl(store.minimum_order)}</Text><Text style={[styles.storeStatus,store.open_now?styles.storeOpen:styles.storeClosed]}>{store.open_now?"ABERTA":"FECHADA"}</Text></View><Text>›</Text></Pressable>):<Text style={styles.empty}>Ainda não há lojas ativas.</Text>}
  </ScrollView>;

  const search=<ScrollView contentContainerStyle={styles.scroll}>
    <Text style={styles.pageTitle}>Buscar</Text><TextInput style={styles.input} autoFocus placeholder="Nome da loja" value={query} onChangeText={setQuery}/>
    {filtered.map(store=><Pressable style={styles.storeCard} key={store.id} onPress={()=>openStore(store)}>{store.logo_url?<Image source={{uri:store.logo_url}} style={styles.storeLogoCard}/>:<View style={styles.storeIcon}><Text style={{fontSize:30}}>🍽️</Text></View>}<View style={{flex:1}}><Text style={styles.productName}>{store.name}</Text><Text style={styles.meta}>{store.description||"Cardápio disponível"}</Text><Text style={[styles.storeStatus,store.open_now?styles.storeOpen:styles.storeClosed]}>{store.open_now?"ABERTA":"FECHADA"}</Text></View><Text>›</Text></Pressable>)}
  </ScrollView>;'''

new = '''  const renderStoreCard=(store:Store)=>{
    const deliveryEnabled=store.clickfood_delivery_enabled||store.own_delivery_enabled;
    const orderingEnabled=deliveryEnabled||store.pickup_enabled;
    return <Pressable style={[styles.discoveryCard,!orderingEnabled&&styles.discoveryCardUnavailable]} key={store.id} onPress={()=>openStore(store)}>
      {store.cover_url?<Image source={{uri:store.cover_url}} style={styles.discoveryCover}/>:<View style={[styles.discoveryCoverFallback,{backgroundColor:store.secondary_color||"#111"}]}><Text style={[styles.discoveryCoverText,{color:store.primary_color||"#f4c400"}]}>CLICK-FOOD</Text></View>}
      <View style={styles.discoveryBody}>
        <View style={styles.discoveryTopRow}>
          {store.logo_url?<Image source={{uri:store.logo_url}} style={styles.discoveryLogo}/>:<View style={[styles.discoveryLogoFallback,{backgroundColor:store.primary_color||"#f4c400"}]}><Text style={styles.discoveryLogoText}>CF</Text></View>}
          <View style={styles.discoveryTitleBlock}>{!!store.slogan&&<Text numberOfLines={1} style={styles.discoverySlogan}>{store.slogan}</Text>}<Text numberOfLines={1} style={styles.discoveryName}>{store.name}</Text></View>
          <Text style={[styles.storeStatus,store.open_now&&orderingEnabled?styles.storeOpen:styles.storeClosed]}>{!orderingEnabled?"INDISPONÍVEL":store.open_now?"ABERTA":"FECHADA"}</Text>
        </View>
        <Text numberOfLines={2} style={styles.discoveryDescription}>{store.description||"Cardápio disponível no CLICK-FOOD"}</Text>
        <View style={styles.discoveryServices}>{store.clickfood_delivery_enabled&&<View style={styles.discoveryServiceChip}><Text style={styles.discoveryServiceText}>🛵 CLICK-FOOD</Text></View>}{store.own_delivery_enabled&&<View style={styles.discoveryServiceChip}><Text style={styles.discoveryServiceText}>🏪 Entrega da loja</Text></View>}{store.pickup_enabled&&<View style={styles.discoveryServiceChip}><Text style={styles.discoveryServiceText}>🥡 Retirada</Text></View>}{store.max_radius_km!=null&&deliveryEnabled&&<View style={styles.discoveryServiceChip}><Text style={styles.discoveryServiceText}>Até {store.max_radius_km} km</Text></View>}</View>
        <View style={styles.discoveryMetaRow}><Text style={styles.discoveryMeta}>Pedido mínimo {brl(store.minimum_order)}</Text><Text style={styles.discoveryDot}>•</Text><Text style={styles.discoveryMeta}>Preparo ~{store.average_preparation_time} min</Text></View>
        {!orderingEnabled&&<Text style={styles.discoveryUnavailableText}>Pedidos temporariamente indisponíveis</Text>}
      </View>
    </Pressable>;
  };

  const home=<ScrollView contentContainerStyle={styles.scroll}>
    <View style={styles.header}><View><Text style={styles.brand}><Text style={styles.yellow}>CLICK</Text>-FOOD</Text><Text style={styles.kicker}>LOJAS DISPONÍVEIS</Text></View><View style={styles.avatar}><Text>{String(session.user.user_metadata?.full_name??"CF").slice(0,2).toUpperCase()}</Text></View></View>
    <Pressable style={styles.searchBox} onPress={()=>setTab("search")}><Text>⌕  O que você quer pedir hoje?</Text></Pressable>
    <View style={styles.hero}><View style={{flex:1}}><Text style={styles.heroKicker}>CLICK-FOOD</Text><Text style={styles.heroTitle}>Peça, acompanhe e aproveite.</Text><Text style={styles.heroText}>Escolha a loja, personalize seu pedido e acompanhe a entrega em tempo real.</Text></View><Text style={styles.heroEmoji}>🍔</Text></View>
    <Text style={styles.section}>Restaurantes</Text>
    {stores.length?stores.map(renderStoreCard):<Text style={styles.empty}>Ainda não há lojas ativas.</Text>}
  </ScrollView>;

  const search=<ScrollView contentContainerStyle={styles.scroll}>
    <Text style={styles.pageTitle}>Buscar</Text><TextInput style={styles.input} autoFocus placeholder="Nome da loja ou tipo de comida" value={query} onChangeText={setQuery}/>
    {filtered.length?filtered.map(renderStoreCard):<Text style={styles.empty}>Nenhuma loja encontrada.</Text>}
  </ScrollView>;'''
replace_once(old,new,"vitrine inicial e busca")

old_style = '  section:{fontSize:19,fontWeight:"900",marginTop:22,marginBottom:10},pageTitle:{fontSize:28,fontWeight:"900",marginBottom:18},storeCard:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e8e8e8",borderRadius:16,padding:13,flexDirection:"row",alignItems:"center",gap:12,marginBottom:9},storeIcon:{width:50,height:50,borderRadius:14,backgroundColor:"#f1f1f1",alignItems:"center",justifyContent:"center"},storeLogoCard:{width:50,height:50,borderRadius:14,backgroundColor:"#f1f1f1"},storeTitle:{fontSize:28,fontWeight:"900",marginTop:4},'
new_style = '  section:{fontSize:19,fontWeight:"900",marginTop:22,marginBottom:10},pageTitle:{fontSize:28,fontWeight:"900",marginBottom:18},storeCard:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e8e8e8",borderRadius:16,padding:13,flexDirection:"row",alignItems:"center",gap:12,marginBottom:9},storeIcon:{width:50,height:50,borderRadius:14,backgroundColor:"#f1f1f1",alignItems:"center",justifyContent:"center"},storeLogoCard:{width:50,height:50,borderRadius:14,backgroundColor:"#f1f1f1"},discoveryCard:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e5e7eb",borderRadius:20,overflow:"hidden",marginBottom:14},discoveryCardUnavailable:{opacity:.78},discoveryCover:{width:"100%",height:112,backgroundColor:"#ececec"},discoveryCoverFallback:{height:96,alignItems:"center",justifyContent:"center"},discoveryCoverText:{fontSize:20,fontWeight:"900",letterSpacing:1.2},discoveryBody:{padding:13},discoveryTopRow:{flexDirection:"row",alignItems:"center",gap:10},discoveryLogo:{width:48,height:48,borderRadius:14,backgroundColor:"#eee"},discoveryLogoFallback:{width:48,height:48,borderRadius:14,alignItems:"center",justifyContent:"center"},discoveryLogoText:{fontSize:15,fontWeight:"900",color:"#111"},discoveryTitleBlock:{flex:1,minWidth:0},discoverySlogan:{fontSize:9,fontWeight:"900",color:"#8d7000",letterSpacing:.65,textTransform:"uppercase",marginBottom:2},discoveryName:{fontSize:16,fontWeight:"900",color:"#15171a"},discoveryDescription:{fontSize:11,color:"#707680",lineHeight:16,marginTop:10},discoveryServices:{flexDirection:"row",flexWrap:"wrap",gap:6,marginTop:10},discoveryServiceChip:{backgroundColor:"#f3f4f6",borderRadius:999,paddingHorizontal:8,paddingVertical:5},discoveryServiceText:{fontSize:8.5,fontWeight:"800",color:"#4d535b"},discoveryMetaRow:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:6,marginTop:11},discoveryMeta:{fontSize:10,fontWeight:"800",color:"#545b65"},discoveryDot:{fontSize:10,color:"#a0a5ac"},discoveryUnavailableText:{fontSize:10,fontWeight:"900",color:"#992f29",marginTop:9},storeTitle:{fontSize:28,fontWeight:"900",marginTop:4},'
replace_once(old_style,new_style,"estilos da vitrine")

path.write_text(text)
print("Vitrine profissional do Cliente aplicada.")
