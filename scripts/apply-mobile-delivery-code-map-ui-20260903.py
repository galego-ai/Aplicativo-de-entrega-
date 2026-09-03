from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: esperado 1 ocorrência, encontrado {count}")
    return text.replace(old, new, 1)


# -------------------------
# App Cliente
# -------------------------
customer_path = Path("apps/cliente/App.tsx")
customer = customer_path.read_text(encoding="utf-8")

customer = replace_once(
    customer,
    '  const[tracking,setTracking]=useState<Tracking|null>(null); const[driverCard,setDriverCard]=useState<DriverCard|null>(null); const[reviewedOrderIds,setReviewedOrderIds]=useState<Set<string>>(new Set()); const[ratingOrderId,setRatingOrderId]=useState<string|null>(null); const[stars,setStars]=useState(5); const[reviewComment,setReviewComment]=useState(""); const[submittingReview,setSubmittingReview]=useState(false);\n',
    '  const[tracking,setTracking]=useState<Tracking|null>(null); const[driverCard,setDriverCard]=useState<DriverCard|null>(null); const[trackingMapOpen,setTrackingMapOpen]=useState(false); const[deliveryCode,setDeliveryCode]=useState<string|null>(null); const[deliveryCodeBusy,setDeliveryCodeBusy]=useState(false); const[reviewedOrderIds,setReviewedOrderIds]=useState<Set<string>>(new Set()); const[ratingOrderId,setRatingOrderId]=useState<string|null>(null); const[stars,setStars]=useState(5); const[reviewComment,setReviewComment]=useState(""); const[submittingReview,setSubmittingReview]=useState(false);\n',
    "customer tracking states",
)

customer = replace_once(
    customer,
    '    if(!activeOrder){setTracking(null);setDriverCard(null);return;}\n',
    '    if(!activeOrder){setTracking(null);setDriverCard(null);setDeliveryCode(null);setTrackingMapOpen(false);return;}\n',
    "customer no active order",
)
customer = replace_once(
    customer,
    '    if(!delivery){setTracking(null);setDriverCard(null);return;}\n',
    '    if(!delivery){setTracking(null);setDriverCard(null);setDeliveryCode(null);setTrackingMapOpen(false);return;}\n',
    "customer no delivery",
)
customer = replace_once(
    customer,
    '    setTracking({orderId:activeOrder.id,deliveryId:delivery.id,deliveryStatus:delivery.status,driverId:delivery.driver_id,driverLat,driverLng,storeLat:relation?.latitude==null?null:Number(relation.latitude),storeLng:relation?.longitude==null?null:Number(relation.longitude),destinationLat,destinationLng});\n',
    '    setTracking({orderId:activeOrder.id,deliveryId:delivery.id,deliveryStatus:delivery.status,driverId:delivery.driver_id,driverLat,driverLng,storeLat:relation?.latitude==null?null:Number(relation.latitude),storeLng:relation?.longitude==null?null:Number(relation.longitude),destinationLat,destinationLng});\n    if(["PICKUP_CONFIRMED","DRIVER_TO_CUSTOMER","DRIVER_AT_CUSTOMER"].includes(String(delivery.status))){\n      setDeliveryCodeBusy(true);\n      const codeResult=await supabase.functions.invoke("delivery-code",{body:{deliveryId:delivery.id,kind:"DELIVERY"}});\n      setDeliveryCodeBusy(false);\n      if(!codeResult.error&&!codeResult.data?.error&&codeResult.data?.code)setDeliveryCode(String(codeResult.data.code));else setDeliveryCode(null);\n    }else{setDeliveryCode(null);setDeliveryCodeBusy(false);}\n',
    "customer load delivery code",
)

old_customer_map = '''      {mapCenter?<MapView style={styles.trackingMap} region={{...mapCenter,latitudeDelta:0.018,longitudeDelta:0.018}}>
        {tracking.storeLat!=null&&tracking.storeLng!=null&&<Marker coordinate={{latitude:tracking.storeLat,longitude:tracking.storeLng}} title="Loja"><View style={styles.mapPin}><Text>🏪</Text></View></Marker>}
        {tracking.destinationLat!=null&&tracking.destinationLng!=null&&<Marker coordinate={{latitude:tracking.destinationLat,longitude:tracking.destinationLng}} title="Seu endereço"><View style={styles.mapPin}><Text>🏠</Text></View></Marker>}
        {tracking.driverLat!=null&&tracking.driverLng!=null&&<Marker coordinate={{latitude:tracking.driverLat,longitude:tracking.driverLng}} title="Seu entregador"><View style={styles.driverPin}><Text style={styles.driverEmoji}>🛵</Text></View></Marker>}
      </MapView>:<View style={styles.mapWaiting}><Text style={styles.driverEmoji}>🛵</Text><Text style={styles.meta}>{tracking.driverId?"Aguardando atualização da localização do entregador.":"Aguardando um entregador aceitar o chamado."}</Text></View>}
      <Text style={styles.liveHint}>{tracking.driverId?"O ícone do veículo agora acompanha as atualizações do GPS em tempo real enquanto o entregador estiver online e na entrega.":"Assim que um entregador aceitar, ele aparecerá aqui."}</Text>
'''
new_customer_tracking_actions = '''      {deliveryCodeBusy&&<View style={styles.deliveryCodeLoading}><Text style={styles.deliveryCodeLoadingText}>Preparando seu código de entrega...</Text></View>}
      {!!deliveryCode&&<View style={styles.deliveryCodeCard}><Text style={styles.deliveryCodeKicker}>CÓDIGO DA ENTREGA</Text><Text selectable style={styles.deliveryCodeValue}>{deliveryCode}</Text><Text style={styles.deliveryCodeHint}>Informe este código ao entregador somente quando ele estiver com você. A entrega só será liberada após a confirmação.</Text></View>}
      {tracking.driverId&&<Pressable style={styles.trackDeliveryButton} onPress={()=>setTrackingMapOpen(true)}><Text style={styles.trackDeliveryButtonText}>⌖ RASTREAR ENTREGA</Text></Pressable>}
      {!tracking.driverId&&<Text style={styles.liveHint}>Assim que um entregador aceitar o chamado, o rastreamento ficará disponível.</Text>}
'''
customer = replace_once(customer, old_customer_map, new_customer_tracking_actions, "customer remove inline map")

customer = replace_once(
    customer,
    '    </ScrollView>\n    {pendingCardOrder&&cardTokenization&&<EfiCardPayment visible config={cardTokenization} order={pendingCardOrder} defaults={{name:String(session.user.user_metadata?.full_name??""),email:String(session.user.email??""),phone:String(session.user.user_metadata?.phone??"")}} onCancel={cancelPendingCardPayment} onComplete={completeCardPayment}/>}\n',
    '    </ScrollView>\n    {!!cart.length&&<Pressable accessibilityRole="button" accessibilityLabel={`Abrir carrinho com ${cartQuantity} ${cartQuantity===1?"item":"itens"}`} style={styles.bagFloating} onPress={()=>setCartOpen(true)}><View><Text style={styles.bagFloatingTitle}>🛒 VER CARRINHO</Text><Text style={styles.bagFloatingMeta}>{cartQuantity} {cartQuantity===1?"item":"itens"} • toque para finalizar</Text></View><Text style={styles.bagFloatingTotal}>{brl(cartSubtotal)}</Text></Pressable>}\n    {pendingCardOrder&&cardTokenization&&<EfiCardPayment visible config={cardTokenization} order={pendingCardOrder} defaults={{name:String(session.user.user_metadata?.full_name??""),email:String(session.user.email??""),phone:String(session.user.user_metadata?.phone??"")}} onCancel={cancelPendingCardPayment} onComplete={completeCardPayment}/>}\n',
    "customer floating cart",
)

customer = replace_once(
    customer,
    '  return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content"/><View style={{flex:1}}>{screen}</View><CustomerOrderReceipt orderId={receiptOrderId} onClose={()=>setReceiptOrderId(null)}/><View style={styles.bottom}>{tabs.map(([key,icon,label])=><Pressable style={styles.tab} key={key} onPress={()=>setTab(key)}><Text style={[styles.tabIcon,tab===key&&styles.tabActive]}>{icon}</Text><Text style={[styles.tabLabel,tab===key&&styles.tabActive]}>{label}</Text></Pressable>)}</View></SafeAreaView>;\n',
    '  return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content"/><View style={{flex:1}}>{screen}</View><Modal visible={trackingMapOpen&&!!tracking} animationType="slide" onRequestClose={()=>setTrackingMapOpen(false)}><SafeAreaView style={styles.trackingModalSafe}><View style={styles.trackingModalHeader}><View style={{flex:1}}><Text style={styles.trackingModalKicker}>CLICK-FOOD</Text><Text style={styles.trackingModalTitle}>Rastrear entrega</Text></View><Pressable style={styles.trackingModalClose} onPress={()=>setTrackingMapOpen(false)}><Text style={styles.trackingModalCloseText}>FECHAR</Text></Pressable></View>{tracking&&mapCenter?<MapView style={styles.trackingModalMap} region={{...mapCenter,latitudeDelta:0.018,longitudeDelta:0.018}}>{tracking.storeLat!=null&&tracking.storeLng!=null&&<Marker coordinate={{latitude:tracking.storeLat,longitude:tracking.storeLng}} title="Loja"><View style={styles.mapPin}><Text>🏪</Text></View></Marker>}{tracking.destinationLat!=null&&tracking.destinationLng!=null&&<Marker coordinate={{latitude:tracking.destinationLat,longitude:tracking.destinationLng}} title="Seu endereço"><View style={styles.mapPin}><Text>🏠</Text></View></Marker>}{tracking.driverLat!=null&&tracking.driverLng!=null&&<Marker coordinate={{latitude:tracking.driverLat,longitude:tracking.driverLng}} title="Seu entregador"><View style={styles.driverPin}><Text style={styles.driverEmoji}>🛵</Text></View></Marker>}</MapView>:<View style={styles.trackingModalWaiting}><Text style={styles.driverEmoji}>🛵</Text><Text style={styles.trackingModalWaitingText}>Aguardando a localização do entregador.</Text></View>}</SafeAreaView></Modal><CustomerOrderReceipt orderId={receiptOrderId} onClose={()=>setReceiptOrderId(null)}/><View style={styles.bottom}>{tabs.map(([key,icon,label])=><Pressable style={styles.tab} key={key} onPress={()=>setTab(key)}><Text style={[styles.tabIcon,tab===key&&styles.tabActive]}>{icon}</Text><Text style={[styles.tabLabel,tab===key&&styles.tabActive]}>{label}</Text></Pressable>)}</View></SafeAreaView>;\n',
    "customer tracking modal",
)

customer = replace_once(
    customer,
    'scrollWithBag:{paddingBottom:34},storeTopbar:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:8},topCartButton:{minWidth:166,backgroundColor:"#111",borderRadius:14,paddingVertical:9,paddingHorizontal:11,flexDirection:"row",alignItems:"center",gap:8,borderWidth:1,borderColor:"#f4c400"}',
    'scrollWithBag:{paddingBottom:112},storeTopbar:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:8},topCartButton:{minWidth:0,maxWidth:"72%",flexShrink:1,backgroundColor:"#111",borderRadius:14,paddingVertical:9,paddingHorizontal:11,flexDirection:"row",alignItems:"center",gap:8,borderWidth:1,borderColor:"#f4c400"}',
    "customer responsive top cart",
)

customer = replace_once(
    customer,
    '  trackingCard:{backgroundColor:"#111",borderRadius:20,padding:14,marginBottom:16,overflow:"hidden"},trackingKicker:{color:"#f4c400",fontWeight:"900",fontSize:9,letterSpacing:1.2},trackingTitle:{color:"#fff",fontSize:20,fontWeight:"900",marginTop:5},trackingStatus:{color:"#ccc",fontSize:12,marginTop:4,marginBottom:12},driverCardBox:{backgroundColor:"#242424",borderRadius:14,padding:11,marginBottom:12,flexDirection:"row",alignItems:"center",gap:10},driverAvatar:{width:48,height:48,borderRadius:24,backgroundColor:"#444"},driverAvatarFallback:{width:48,height:48,borderRadius:24,backgroundColor:"#f4c400",alignItems:"center",justifyContent:"center"},driverAvatarInitials:{fontWeight:"900",color:"#111"},driverCardBody:{flex:1},driverCardName:{color:"#fff",fontSize:15,fontWeight:"900"},driverCardMeta:{color:"#ccc",fontSize:10,marginTop:4},trackingMap:{height:250,borderRadius:15,overflow:"hidden"},mapWaiting:{height:180,borderRadius:15,backgroundColor:"#292929",alignItems:"center",justifyContent:"center",padding:20},mapPin:{backgroundColor:"#fff",borderRadius:18,padding:7,borderWidth:2,borderColor:"#111"},driverPin:{backgroundColor:"#f4c400",borderRadius:22,padding:8,borderWidth:2,borderColor:"#111"},driverEmoji:{fontSize:25},liveHint:{color:"#aaa",fontSize:10,marginTop:9,lineHeight:14},arrivedBanner:{backgroundColor:"#f4c400",borderRadius:13,padding:13,marginBottom:12},arrivedTitle:{fontSize:18,fontWeight:"900"},arrivedText:{fontSize:11,marginTop:3},\n',
    '  trackingCard:{backgroundColor:"#111",borderRadius:20,padding:14,marginBottom:16,overflow:"hidden"},trackingKicker:{color:"#f4c400",fontWeight:"900",fontSize:9,letterSpacing:1.2},trackingTitle:{color:"#fff",fontSize:20,fontWeight:"900",marginTop:5},trackingStatus:{color:"#ccc",fontSize:12,marginTop:4,marginBottom:12},driverCardBox:{backgroundColor:"#242424",borderRadius:14,padding:11,marginBottom:12,flexDirection:"row",alignItems:"center",gap:10},driverAvatar:{width:48,height:48,borderRadius:24,backgroundColor:"#444"},driverAvatarFallback:{width:48,height:48,borderRadius:24,backgroundColor:"#f4c400",alignItems:"center",justifyContent:"center"},driverAvatarInitials:{fontWeight:"900",color:"#111"},driverCardBody:{flex:1},driverCardName:{color:"#fff",fontSize:15,fontWeight:"900"},driverCardMeta:{color:"#ccc",fontSize:10,marginTop:4},mapPin:{backgroundColor:"#fff",borderRadius:18,padding:7,borderWidth:2,borderColor:"#111"},driverPin:{backgroundColor:"#f4c400",borderRadius:22,padding:8,borderWidth:2,borderColor:"#111"},driverEmoji:{fontSize:25},liveHint:{color:"#aaa",fontSize:10,marginTop:9,lineHeight:14},arrivedBanner:{backgroundColor:"#f4c400",borderRadius:13,padding:13,marginBottom:12},arrivedTitle:{fontSize:18,fontWeight:"900"},arrivedText:{fontSize:11,marginTop:3},deliveryCodeLoading:{backgroundColor:"#242424",borderRadius:13,padding:12,marginBottom:10},deliveryCodeLoadingText:{color:"#ddd",fontSize:11,fontWeight:"800",textAlign:"center"},deliveryCodeCard:{backgroundColor:"#f4c400",borderRadius:16,padding:15,marginBottom:11,alignItems:"center"},deliveryCodeKicker:{fontSize:9,fontWeight:"900",letterSpacing:1.2,color:"#5b4900"},deliveryCodeValue:{fontSize:36,fontWeight:"900",letterSpacing:9,color:"#111",marginVertical:5},deliveryCodeHint:{fontSize:10,lineHeight:14,fontWeight:"700",color:"#3f3500",textAlign:"center"},trackDeliveryButton:{backgroundColor:"#fff",borderRadius:13,paddingVertical:13,alignItems:"center",marginTop:2},trackDeliveryButtonText:{fontSize:11,fontWeight:"900",color:"#111"},trackingModalSafe:{flex:1,backgroundColor:"#111"},trackingModalHeader:{backgroundColor:"#111",paddingHorizontal:16,paddingVertical:12,flexDirection:"row",alignItems:"center",gap:12},trackingModalKicker:{fontSize:9,color:"#f4c400",fontWeight:"900",letterSpacing:1.2},trackingModalTitle:{fontSize:20,color:"#fff",fontWeight:"900",marginTop:2},trackingModalClose:{backgroundColor:"#f4c400",borderRadius:11,paddingVertical:10,paddingHorizontal:13},trackingModalCloseText:{fontSize:9,fontWeight:"900",color:"#111"},trackingModalMap:{flex:1,width:"100%"},trackingModalWaiting:{flex:1,alignItems:"center",justifyContent:"center",padding:24,backgroundColor:"#f4f4f4"},trackingModalWaitingText:{marginTop:10,fontSize:12,color:"#555",textAlign:"center"},\n',
    "customer tracking styles",
)

customer_path.write_text(customer, encoding="utf-8")


# -------------------------
# App Entregador
# -------------------------
driver_path = Path("apps/entregador/App.tsx")
driver = driver_path.read_text(encoding="utf-8")

driver = replace_once(
    driver,
    '  const [driverLocation,setDriverLocation]=useState<DriverLocation|null>(null);\n',
    '  const [driverLocation,setDriverLocation]=useState<DriverLocation|null>(null); const [mapOpen,setMapOpen]=useState(false);\n',
    "driver map state",
)

driver = replace_once(
    driver,
    '  async function loadActive(){const {data}=await supabase.functions.invoke("driver-active-delivery",{body:{}});setActive(data?.delivery??null);}\n',
    '  async function loadActive(){const {data}=await supabase.functions.invoke("driver-active-delivery",{body:{}});const next=data?.delivery??null;setActive(next);if(!next)setMapOpen(false);}\n',
    "driver load active",
)

driver = replace_once(
    driver,
    '    <DriverLiveMap online={driver.online} location={driverLocation} active={active}/>\n',
    '',
    "driver remove always open map",
)

driver = replace_once(
    driver,
    '}{needsCode&&<TextInput style={styles.codeInput}',
    '}{active&&<Pressable style={styles.mapActionButton} onPress={()=>setMapOpen(true)}><Text style={styles.mapActionText}>⌖ VER MAPA / ROTA</Text></Pressable>}{needsCode&&<TextInput style={styles.codeInput}',
    "driver map button",
)

driver = replace_once(
    driver,
    '<View style={styles.flex}>{current}</View><View style={styles.bottom}>',
    '<View style={styles.flex}>{current}</View><Modal visible={mapOpen&&!!active} animationType="slide" onRequestClose={()=>setMapOpen(false)}><SafeAreaView style={styles.mapModalSafe}><View style={styles.mapModalHeader}><View style={{flex:1}}><Text style={styles.mapModalKicker}>CLICK-FOOD ENTREGADOR</Text><Text style={styles.mapModalTitle}>Mapa da entrega</Text></View><Pressable style={styles.mapModalClose} onPress={()=>setMapOpen(false)}><Text style={styles.mapModalCloseText}>FECHAR</Text></Pressable></View><View style={styles.mapModalBody}><DriverLiveMap online={driver.online} location={driverLocation} active={active}/></View></SafeAreaView></Modal><View style={styles.bottom}>',
    "driver map modal",
)

driver = replace_once(
    driver,
    'content:{padding:18,paddingBottom:32}',
    'content:{padding:15,paddingBottom:30}',
    "driver responsive padding",
)

driver = replace_once(
    driver,
    'deliveryCard:{backgroundColor:"#fff",borderRadius:20,padding:18,marginTop:16,borderWidth:1,borderColor:"#e8e8e8"}',
    'deliveryCard:{backgroundColor:"#fff",borderRadius:18,padding:16,marginTop:14,borderWidth:1,borderColor:"#e8e8e8"},mapActionButton:{backgroundColor:"#111",borderRadius:13,paddingVertical:13,alignItems:"center",marginTop:10},mapActionText:{color:"#f4c400",fontWeight:"900",fontSize:10},mapModalSafe:{flex:1,backgroundColor:"#111"},mapModalHeader:{paddingHorizontal:16,paddingVertical:12,backgroundColor:"#111",flexDirection:"row",alignItems:"center",gap:12},mapModalKicker:{color:"#f4c400",fontSize:9,fontWeight:"900",letterSpacing:1.2},mapModalTitle:{color:"#fff",fontSize:20,fontWeight:"900",marginTop:2},mapModalClose:{backgroundColor:"#f4c400",borderRadius:11,paddingVertical:10,paddingHorizontal:13},mapModalCloseText:{fontSize:9,fontWeight:"900",color:"#111"},mapModalBody:{flex:1}',
    "driver map styles",
)

driver_path.write_text(driver, encoding="utf-8")


# -------------------------
# DriverLiveMap: usado apenas sob demanda, sem marcador do próprio entregador
# -------------------------
map_path = Path("apps/entregador/DriverLiveMap.tsx")
map_text = map_path.read_text(encoding="utf-8")

map_text = replace_once(
    map_text,
    '  const center = current ?? pickup ?? destination;\n\n  const customerPhase = Boolean(',
    '  const customerPhase = Boolean(',
    "driver map reorder center 1",
)
map_text = replace_once(
    map_text,
    '  const targetLabel = customerPhase ? "CLIENTE" : "LOJA";\n\n  function fitMap() {',
    '  const targetLabel = customerPhase ? "CLIENTE" : "LOJA";\n  const center = navigationTarget ?? pickup ?? destination ?? current;\n\n  function fitMap() {',
    "driver map reorder center 2",
)
map_text = replace_once(
    map_text,
    '    const points = [current, navigationTarget].filter((item): item is Coordinate => Boolean(item));\n',
    '    const points = [navigationTarget, pickup, destination].filter((item): item is Coordinate => Boolean(item));\n',
    "driver map fit target only",
)
map_text = replace_once(
    map_text,
    '  }, [location?.latitude, location?.longitude, active?.status, active?.orderNumber]);\n',
    '  }, [active?.status, active?.orderNumber]);\n',
    "driver map stop self follow",
)
map_text = replace_once(
    map_text,
    '      {current && <Marker coordinate={current} title="Você" description={online ? "Localização sendo atualizada" : "Última localização registrada"} anchor={{ x: 0.5, y: 0.5 }}>\n        <View style={styles.driverPin}><Text style={styles.driverEmoji}>🛵</Text></View>\n      </Marker>}\n',
    '',
    "driver remove self marker",
)
map_text = replace_once(
    map_text,
    '      {active && navigationTarget\n        ? `O mapa acompanha sua posição e mantém o próximo destino (${targetLabel.toLowerCase()}) visível automaticamente.`\n        : online\n          ? "Sua posição é atualizada pelo GPS e enviada ao CLICK-FOOD enquanto você estiver online."\n          : "O rastreamento fica pausado quando você está offline."}\n',
    '      {active && navigationTarget\n        ? `O mapa mostra o próximo destino (${targetLabel.toLowerCase()}). Sua localização continua sendo enviada ao CLICK-FOOD em segundo plano para o cliente acompanhar a entrega.`\n        : online\n          ? "Sua localização continua sendo enviada em segundo plano enquanto você estiver online."\n          : "O rastreamento fica pausado quando você está offline."}\n',
    "driver map hint",
)
map_text = replace_once(
    map_text,
    '  card: { backgroundColor: "#111", borderRadius: 22, marginTop: 18, overflow: "hidden" },',
    '  card: { flex: 1, backgroundColor: "#111", overflow: "hidden" },',
    "driver map no card",
)
map_text = replace_once(
    map_text,
    '  map: { height: 270, width: "100%" },',
    '  map: { flex: 1, minHeight: 420, width: "100%" },',
    "driver map full screen",
)

map_path.write_text(map_text, encoding="utf-8")

print("Ajustes mobile aplicados com sucesso.")
