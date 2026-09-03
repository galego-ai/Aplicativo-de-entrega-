from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f"[skip] {label}")
        return text
    if old not in text:
        raise SystemExit(f"[erro] trecho não encontrado: {label}")
    print(f"[ok] {label}")
    return text.replace(old, new, 1)

# ---------------- CLIENTE ----------------
path = ROOT / "apps/cliente/App.tsx"
text = path.read_text(encoding="utf-8")

text = replace_once(
    text,
    '  useEffect(()=>{if(!session||tab!=="orders"||!tracking?.driverId)return;const driverId=tracking.driverId;const channel=supabase.channel(`customer-driver-live-${driverId}`).on("postgres_changes",{event:"*",schema:"public",table:"driver_locations",filter:`driver_id=eq.${driverId}`},payload=>{const row=(payload.new??{}) as any;const latitude=Number(row.latitude),longitude=Number(row.longitude);if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return;setTracking(current=>current&&current.driverId===driverId?{...current,driverLat:latitude,driverLng:longitude}:current);}).subscribe();return()=>{void supabase.removeChannel(channel);};},[session?.user.id,tab,tracking?.driverId]);',
    '  useEffect(()=>{if(!session||tab!=="orders"||!tracking?.driverId)return;const driverId=tracking.driverId;const channel=supabase.channel(`customer-driver-live-${driverId}`).on("postgres_changes",{event:"*",schema:"public",table:"driver_locations",filter:`driver_id=eq.${driverId}`},payload=>{const row=(payload.new??{}) as any;const latitude=Number(row.latitude),longitude=Number(row.longitude);if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return;setTracking(current=>current&&current.driverId===driverId?{...current,driverLat:latitude,driverLng:longitude}:current);}).subscribe();return()=>{void supabase.removeChannel(channel);};},[session?.user.id,tab,tracking?.driverId]);\n  useEffect(()=>{if(!session||tab!=="orders"||tracking?.deliveryStatus!=="DRIVER_AT_CUSTOMER"||!tracking.deliveryId||deliveryCode)return;const deliveryId=tracking.deliveryId;const refresh=()=>void fetchDeliveryCode(deliveryId);void refresh();const timer=setInterval(refresh,4000);return()=>clearInterval(timer);},[session?.user.id,tab,tracking?.deliveryId,tracking?.deliveryStatus,deliveryCode]);',
    "polling do código de entrega",
)

helper = '''  async function fetchDeliveryCode(deliveryId:string){
    setDeliveryCodeBusy(true);
    const codeResult=await supabase.functions.invoke("delivery-code",{body:{deliveryId,kind:"DELIVERY"}});
    setDeliveryCodeBusy(false);
    if(!codeResult.error&&!codeResult.data?.error&&/^\\d{4}$/.test(String(codeResult.data?.code??""))){
      setDeliveryCode(String(codeResult.data.code));
      return true;
    }
    setDeliveryCode(null);
    return false;
  }

'''
text = replace_once(
    text,
    '  async function loadTracking(currentOrders:Order[]){',
    helper + '  async function loadTracking(currentOrders:Order[]){',
    "helper de código de entrega",
)

old_code = '''    if(String(delivery.status)==="DRIVER_AT_CUSTOMER"){
      setDeliveryCodeBusy(true);
      const codeResult=await supabase.functions.invoke("delivery-code",{body:{deliveryId:delivery.id,kind:"DELIVERY"}});
      setDeliveryCodeBusy(false);
      if(!codeResult.error&&!codeResult.data?.error&&codeResult.data?.code)setDeliveryCode(String(codeResult.data.code));else setDeliveryCode(null);
    }else{setDeliveryCode(null);setDeliveryCodeBusy(false);}'''
new_code = '''    if(String(delivery.status)==="DRIVER_AT_CUSTOMER"){
      await fetchDeliveryCode(String(delivery.id));
    }else{setDeliveryCode(null);setDeliveryCodeBusy(false);}'''
text = replace_once(text, old_code, new_code, "usar helper no tracking")

old_card = '{!!selectedAddressId&&<View style={styles.deliveryPreviewCard}><View style={{flex:1}}><Text style={styles.deliveryPreviewTitle}>{deliveryPreviewUsable&&deliveryPreview?`Frete para ${deliveryPreview.distanceKm.toFixed(2)} km`:"Calcule o frete antes de finalizar"}</Text><Text style={styles.deliveryPreviewMeta}>{deliveryPreviewUsable&&deliveryPreview?(freeDeliveryApplies&&deliveryPreview.fee>0?`Promoção ativa: de ${brl(deliveryPreview.fee)} por grátis`:`Cotação válida por até 10 minutos`):"A cotação valida distância, raio e tabela configurada pela loja."}</Text></View>{deliveryPreviewUsable&&deliveryPreview&&<Text style={styles.deliveryPreviewPrice}>{freeDeliveryApplies?"GRÁTIS":brl(deliveryPreview.fee)}</Text>}<Pressable style={[styles.deliveryPreviewButton,deliveryPreviewBusy&&styles.disabled]} disabled={deliveryPreviewBusy} onPress={previewDeliveryQuote}><Text style={styles.deliveryPreviewButtonText}>{deliveryPreviewBusy?"CALCULANDO...":deliveryPreviewUsable?"RECALCULAR":"CALCULAR FRETE"}</Text></Pressable></View>}'
new_card = '{!!selectedAddressId&&<Text style={styles.freightAutoHint}>{deliveryPreviewBusy?"Calculando frete automaticamente...":deliveryPreviewUsable&&deliveryPreview?(freeDeliveryApplies&&deliveryPreview.fee>0?`Frete grátis • economia de ${brl(deliveryPreview.fee)}`:`Frete calculado automaticamente: ${brl(deliveryPreview.fee)}`):"O frete será calculado automaticamente ao finalizar o pedido."}</Text>}'
text = replace_once(text, old_card, new_card, "remover janela manual de cálculo de frete")

text = replace_once(
    text,
    '  useEffect(()=>{setDeliveryPreview(null);},[selectedStore?.id,selectedAddressId,deliveryType]);',
    '  useEffect(()=>{setDeliveryPreview(null);},[selectedStore?.id,selectedAddressId,deliveryType]);\n  useEffect(()=>{if(!cartOpen||!selectedStore||deliveryType!=="DELIVERY"||!selectedAddressId)return;void previewDeliveryQuote();},[cartOpen,selectedStore?.id,selectedAddressId,deliveryType]);',
    "frete automático no carrinho",
)

text = replace_once(
    text,
    '{deliveryCodeBusy&&<View style={styles.deliveryCodeLoading}><Text style={styles.deliveryCodeLoadingText}>Preparando seu código de entrega...</Text></View>}',
    '{deliveryCodeBusy&&<View style={styles.deliveryCodeLoading}><Text style={styles.deliveryCodeLoadingText}>Preparando seu código de entrega...</Text></View>}{tracking.deliveryStatus==="DRIVER_AT_CUSTOMER"&&!deliveryCode&&!deliveryCodeBusy&&<View style={styles.deliveryCodeRetry}><Text style={styles.deliveryCodeRetryText}>O código ainda não apareceu.</Text><Pressable style={styles.deliveryCodeRetryButton} onPress={()=>void fetchDeliveryCode(tracking.deliveryId)}><Text style={styles.deliveryCodeRetryButtonText}>GERAR CÓDIGO AGORA</Text></Pressable></View>}',
    "botão de nova tentativa do código",
)

text = replace_once(
    text,
    'scroll:{paddingHorizontal:14,paddingTop:12,paddingBottom:30}',
    'scroll:{paddingHorizontal:14,paddingTop:12,paddingBottom:108}',
    "espaço inferior cliente",
)
text = replace_once(
    text,
    'bottom:{height:68,backgroundColor:"#fff",borderTopWidth:1,borderTopColor:"#e5e5e5",flexDirection:"row"}',
    'bottom:{minHeight:90,backgroundColor:"#fff",borderTopWidth:1,borderTopColor:"#e5e5e5",flexDirection:"row",paddingTop:6,paddingBottom:22}',
    "barra inferior segura cliente",
)
text = replace_once(
    text,
    'deliveryCodeLoadingText:{color:"#ddd",fontSize:11,fontWeight:"800",textAlign:"center"},deliveryCodeCard:',
    'deliveryCodeLoadingText:{color:"#ddd",fontSize:11,fontWeight:"800",textAlign:"center"},deliveryCodeRetry:{backgroundColor:"#fff5d2",borderRadius:12,padding:11,marginBottom:10,alignItems:"center"},deliveryCodeRetryText:{fontSize:10,color:"#6b5500",fontWeight:"800",marginBottom:8},deliveryCodeRetryButton:{backgroundColor:"#111",borderRadius:9,paddingVertical:9,paddingHorizontal:13},deliveryCodeRetryButtonText:{fontSize:9,color:"#f4c400",fontWeight:"900"},deliveryCodeCard:',
    "estilos retry código",
)
text = replace_once(
    text,
    'addressSelected:{borderColor:"#d4ae00",backgroundColor:"#fffbea"},deliveryPreviewCard:',
    'addressSelected:{borderColor:"#d4ae00",backgroundColor:"#fffbea"},freightAutoHint:{fontSize:10,color:"#5f5f5f",fontWeight:"700",backgroundColor:"#f3f3f3",borderRadius:10,padding:10,marginBottom:8},deliveryPreviewCard:',
    "estilo frete automático",
)

path.write_text(text, encoding="utf-8")

# ---------------- ENTREGADOR APP ----------------
path = ROOT / "apps/entregador/App.tsx"
text = path.read_text(encoding="utf-8")

new_home = '''  const home=<View style={styles.mapHome}>
    <DriverLiveMap online={driver.online} location={driverLocation} active={active}/>
    <View style={styles.mapControlsDock}>
      {!!message&&<Text style={styles.notice}>{message}</Text>}
      {active?<ScrollView style={styles.mapControlsScroll} contentContainerStyle={styles.mapControlsContent} showsVerticalScrollIndicator={false}>
        <View style={styles.driverActiveCard}><View style={styles.driverActiveHeader}><View><Text style={styles.driverActiveKicker}>Entrega em andamento</Text><Text style={styles.driverActiveOrder}>Pedido #{active.orderNumber}</Text></View><View style={styles.driverActiveStatusDot}/></View><Text style={styles.driverStatusText}>{driverStatusLabel[active.status]??active.status}</Text><Text style={styles.driverAddress}>{active.status.includes("STORE")||active.status==="DRIVER_ASSIGNED"?active.pickup.storeName:destinationLine}</Text></View>
        <View style={styles.nextStepCard}><Text style={styles.nextStepKicker}>Próxima etapa</Text><Text style={styles.nextStepTitle}>{nextStepText}</Text>{needsCode&&<><Text style={styles.codePrompt}>{codeButtonLabel}</Text><TextInput style={styles.codeInput} placeholder="Código de 4 dígitos" placeholderTextColor="#777" keyboardType="number-pad" maxLength={4} value={code} onChangeText={setCode}/></>}{nextAction&&<Pressable style={styles.actionButton} onPress={()=>deliveryAction(nextAction[0])}><Text style={styles.actionText}>{needsCode&&codeButtonLabel?codeButtonLabel:nextAction[1]}</Text></Pressable>}{active.status==="DRIVER_AT_CUSTOMER"&&<Pressable style={styles.problemSecondary} onPress={()=>Alert.alert("Cliente não encontrado","Confirme apenas se você já está no endereço e tentou localizar o cliente.",[{text:"VOLTAR",style:"cancel"},{text:"CONFIRMAR",style:"destructive",onPress:()=>reportDeliveryProblem("CUSTOMER_UNAVAILABLE")}])}><Text style={styles.problemSecondaryText}>CLIENTE NÃO ENCONTRADO</Text></Pressable>}{["DRIVER_ASSIGNED","DRIVER_TO_STORE","DRIVER_AT_STORE","PICKUP_CONFIRMED","DRIVER_TO_CUSTOMER","DRIVER_AT_CUSTOMER","RETURN_REQUIRED"].includes(active.status)&&<Pressable style={styles.problemButton} onPress={()=>{setIncidentReason("");setIncidentModal(true)}}><Text style={styles.problemText}>REPORTAR PROBLEMA</Text></Pressable>}<Text style={styles.earning}>Ganho desta entrega: {brl(active.earning)}</Text></View>
      </ScrollView>:<View style={styles.idleMapCard}><View style={{flex:1}}><Text style={styles.idleHeroKicker}>{driver.online?"VOCÊ ESTÁ ONLINE":"VOCÊ ESTÁ OFFLINE"}</Text><Text style={styles.idleMapTitle}>{driver.online?"Aguardando entregas":"Fique online para começar"}</Text><Text style={styles.idleMapMeta}>{history.length} entregas • {driver.rating.toFixed(1)} ★ • {brl(completedTotal)}</Text></View><Pressable style={[styles.mapOnlineButton,driver.online&&styles.mapOfflineButton]} onPress={toggleOnline}><Text style={[styles.mapOnlineText,driver.online&&styles.onlineTextOffline]}>{driver.online?"OFFLINE":"ONLINE"}</Text></Pressable></View>}
    </View>
  </View>;
'''
pattern = r'  const home=<ScrollView contentContainerStyle=\{styles\.content\}>.*?</ScrollView>;\n\n  const historyView='
match = re.search(pattern, text, flags=re.S)
if not match:
    if 'const home=<View style={styles.mapHome}>' not in text:
        raise SystemExit('[erro] home entregador não encontrada')
else:
    text = text[:match.start()] + new_home + '\n  const historyView=' + text[match.end():]
    print('[ok] home entregador em mapa inteiro')

text = replace_once(
    text,
    'bottom:{minHeight:70,backgroundColor:"#101010",borderTopWidth:1,borderTopColor:"#2a2a2a",flexDirection:"row",paddingVertical:6}',
    'bottom:{minHeight:90,backgroundColor:"#101010",borderTopWidth:1,borderTopColor:"#2a2a2a",flexDirection:"row",paddingTop:6,paddingBottom:22}',
    "barra inferior segura entregador",
)

text = replace_once(
    text,
    'flex:{flex:1},center:',
    'flex:{flex:1},mapHome:{flex:1,backgroundColor:"#111"},mapControlsDock:{position:"absolute",left:10,right:10,bottom:10},mapControlsScroll:{maxHeight:330},mapControlsContent:{paddingTop:8},idleMapCard:{backgroundColor:"rgba(17,17,17,0.94)",borderWidth:1,borderColor:"#343434",borderRadius:16,padding:13,flexDirection:"row",alignItems:"center",gap:12},idleMapTitle:{fontSize:16,color:"#fff",fontWeight:"900",marginTop:4},idleMapMeta:{fontSize:9,color:"#aaa",marginTop:4},mapOnlineButton:{backgroundColor:"#f4c400",borderRadius:12,paddingVertical:12,paddingHorizontal:15},mapOfflineButton:{backgroundColor:"#242424",borderWidth:1,borderColor:"#555"},mapOnlineText:{fontSize:10,fontWeight:"900",color:"#111"},center:',
    "estilos mapa inicial entregador",
)

path.write_text(text, encoding="utf-8")
print('Patch mobile aplicado.')
