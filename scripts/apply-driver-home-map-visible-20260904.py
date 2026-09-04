from pathlib import Path

APP = Path('apps/entregador/App.tsx')
MAP = Path('apps/entregador/DriverLiveMap.tsx')

app = APP.read_text(encoding='utf-8')

# 1) Mantem a localizacao da home disponivel mesmo offline, sem rastrear em segundo plano offline.
start = app.index('  useEffect(()=>{if(!driver?.online||driver.status!=="ACTIVE") return;')
end = app.index('\n\n  useEffect(()=>{\n    if(driver?.id&&driver.online&&driver.status==="ACTIVE")', start)
new_effect = '''  useEffect(()=>{\n    if(!driver||driver.status!=="ACTIVE")return;\n    let subscription:Location.LocationSubscription|undefined;\n    let cancelled=false;\n    async function applyPosition(position:Location.LocationObject,persist:boolean){\n      const recordedAt=new Date(position.timestamp||Date.now()).toISOString();\n      if(cancelled)return;\n      setDriverLocation({latitude:position.coords.latitude,longitude:position.coords.longitude,heading:position.coords.heading,recordedAt});\n      if(!persist)return;\n      await supabase.from("driver_locations").upsert({driver_id:driver.id,latitude:position.coords.latitude,longitude:position.coords.longitude,heading:position.coords.heading,speed:position.coords.speed,accuracy:position.coords.accuracy,recorded_at:recordedAt},{onConflict:"driver_id"});\n    }\n    (async()=>{\n      const permission=await Location.requestForegroundPermissionsAsync();\n      if(permission.status!=="granted"){if(!cancelled)setMessage("Ative a localização para visualizar o mapa e receber entregas próximas.");return;}\n      try{\n        const current=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});\n        await applyPosition(current,driver.online);\n      }catch{}\n      if(cancelled||!driver.online)return;\n      subscription=await Location.watchPositionAsync({accuracy:Location.Accuracy.High,distanceInterval:20,timeInterval:10000},position=>{void applyPosition(position,true);});\n    })();\n    return()=>{cancelled=true;subscription?.remove();};\n  },[driver?.online,driver?.id,driver?.status]);'''
app = app[:start] + new_effect + app[end:]

# 2) Home sem rolagem: mapa permanente como base + controles compactos sobrepostos.
home_start = app.index('  const home=<View style={styles.mapHome}>')
home_end = app.index('\n\n  const historyView=', home_start)
new_home = '''  const home=<View style={styles.mapHome}>\n    <DriverLiveMap online={driver.online} location={driverLocation} active={active}/>\n    <Pressable accessibilityRole="button" accessibilityLabel={earningsVisible?"Ocultar ganhos":"Mostrar ganhos"} style={styles.earningsEyeButton} onPress={()=>setEarningsVisible(value=>!value)}><Text style={styles.earningsEyeIcon}>{earningsVisible?"👁️":"🙈"}</Text><Text style={styles.earningsEyeText}>{earningsVisible?"OCULTAR GANHOS":"MOSTRAR GANHOS"}</Text></Pressable>\n    <View style={styles.mapControlsDock}>\n      {!!message&&<Text numberOfLines={2} style={styles.noticeCompact}>{message}</Text>}\n      {active?<View style={styles.mapControlsContent}>\n        <View style={styles.driverActiveCard}><View style={styles.driverActiveHeader}><View style={{flex:1}}><Text style={styles.driverActiveKicker}>Entrega em andamento</Text><Text style={styles.driverActiveOrder}>Pedido #{active.orderNumber}</Text></View><View style={styles.driverActiveStatusDot}/></View><Text numberOfLines={1} style={styles.driverStatusText}>{driverStatusLabel[active.status]??active.status}</Text><Text numberOfLines={2} style={styles.driverAddress}>{active.status.includes("STORE")||active.status==="DRIVER_ASSIGNED"?active.pickup.storeName:destinationLine}</Text></View>\n        <View style={styles.nextStepCard}><Text style={styles.nextStepKicker}>Próxima etapa</Text><Text numberOfLines={2} style={styles.nextStepTitle}>{nextStepText}</Text>{needsCode&&<><Text style={styles.codePrompt}>{codeButtonLabel}</Text><TextInput style={styles.codeInput} placeholder="Código de 4 dígitos" placeholderTextColor="#777" keyboardType="number-pad" maxLength={4} value={code} onChangeText={setCode}/></>}{nextAction&&<Pressable style={styles.actionButton} onPress={()=>deliveryAction(nextAction[0])}><Text style={styles.actionText}>{needsCode&&codeButtonLabel?codeButtonLabel:nextAction[1]}</Text></Pressable>}{active.status==="DRIVER_AT_CUSTOMER"&&<Pressable style={styles.problemSecondary} onPress={()=>Alert.alert("Cliente não encontrado","Confirme apenas se você já está no endereço e tentou localizar o cliente.",[{text:"VOLTAR",style:"cancel"},{text:"CONFIRMAR",style:"destructive",onPress:()=>reportDeliveryProblem("CUSTOMER_UNAVAILABLE")}])}><Text style={styles.problemSecondaryText}>CLIENTE NÃO ENCONTRADO</Text></Pressable>}{["DRIVER_ASSIGNED","DRIVER_TO_STORE","DRIVER_AT_STORE","PICKUP_CONFIRMED","DRIVER_TO_CUSTOMER","DRIVER_AT_CUSTOMER","RETURN_REQUIRED"].includes(active.status)&&<Pressable style={styles.problemButton} onPress={()=>{setIncidentReason("");setIncidentModal(true)}}><Text style={styles.problemText}>REPORTAR PROBLEMA</Text></Pressable>}<Text style={styles.earning}>Ganho desta entrega: {earningsText(active.earning)}</Text></View>\n      </View>:<View style={styles.idleMapCard}><View style={{flex:1}}><Text style={styles.idleHeroKicker}>{driver.online?"VOCÊ ESTÁ ONLINE":"VOCÊ ESTÁ OFFLINE"}</Text><Text style={styles.idleMapTitle}>{driver.online?"Aguardando entregas":"Fique online para começar"}</Text><Text style={styles.idleMapMeta}>{history.length} entregas • {driver.rating.toFixed(1)} ★ • {earningsText(completedTotal)}</Text></View><Pressable style={[styles.mapOnlineButton,driver.online&&styles.mapOfflineButton]} onPress={toggleOnline}><Text style={[styles.mapOnlineText,driver.online&&styles.onlineTextOffline]}>{driver.online?"OFFLINE":"ONLINE"}</Text></Pressable></View>}\n    </View>\n  </View>;'''
app = app[:home_start] + new_home + app[home_end:]

# 3) Compacta apenas a home/navegacao para caber sem rolagem vertical.
replacements = {
    'earningsEyeButton:{position:"absolute",top:12,right:12,zIndex:30,elevation:9,backgroundColor:"rgba(17,17,17,0.94)",borderWidth:1,borderColor:"#f4c400",borderRadius:20,paddingVertical:7,paddingHorizontal:10,flexDirection:"row",alignItems:"center",gap:6}':
    'earningsEyeButton:{position:"absolute",top:78,left:10,zIndex:30,elevation:9,backgroundColor:"rgba(17,17,17,0.94)",borderWidth:1,borderColor:"#f4c400",borderRadius:20,paddingVertical:7,paddingHorizontal:10,flexDirection:"row",alignItems:"center",gap:6}',
    'mapHome:{flex:1,backgroundColor:"#111"}':
    'mapHome:{flex:1,backgroundColor:"#111",overflow:"hidden"}',
    'mapControlsDock:{flex:1,paddingHorizontal:10,paddingTop:58,paddingBottom:10,justifyContent:"flex-end"}':
    'mapControlsDock:{position:"absolute",left:0,right:0,bottom:0,paddingHorizontal:10,paddingTop:8,paddingBottom:8,justifyContent:"flex-end"}',
    'mapControlsScroll:{maxHeight:330}':
    'mapControlsScroll:{maxHeight:330}',
    'mapControlsContent:{paddingTop:8}':
    'mapControlsContent:{gap:8}',
    'idleMapCard:{backgroundColor:"rgba(17,17,17,0.94)",borderWidth:1,borderColor:"#343434",borderRadius:16,padding:13,flexDirection:"row",alignItems:"center",gap:12}':
    'idleMapCard:{backgroundColor:"rgba(17,17,17,0.94)",borderWidth:1,borderColor:"#343434",borderRadius:16,paddingVertical:11,paddingHorizontal:12,flexDirection:"row",alignItems:"center",gap:10}',
    'mapOnlineButton:{backgroundColor:"#f4c400",borderRadius:12,paddingVertical:12,paddingHorizontal:15}':
    'mapOnlineButton:{backgroundColor:"#f4c400",borderRadius:12,paddingVertical:11,paddingHorizontal:14}',
    'bottom:{minHeight:116,backgroundColor:"#101010",borderTopWidth:1,borderTopColor:"#2a2a2a",flexDirection:"row",paddingTop:10,paddingBottom:34,elevation:16}':
    'bottom:{minHeight:78,backgroundColor:"#101010",borderTopWidth:1,borderTopColor:"#2a2a2a",flexDirection:"row",paddingTop:5,paddingBottom:7,elevation:16}',
    'tab:{flex:1,minHeight:68,alignItems:"center",justifyContent:"center",paddingHorizontal:2}':
    'tab:{flex:1,minHeight:58,alignItems:"center",justifyContent:"center",paddingHorizontal:2}',
    'tabIcon:{fontSize:28,lineHeight:32,minWidth:32,textAlign:"center",color:"#8b8b8b"}':
    'tabIcon:{fontSize:24,lineHeight:28,minWidth:28,textAlign:"center",color:"#8b8b8b"}',
    'tabText:{fontSize:11,fontWeight:"800",color:"#999",marginTop:4}':
    'tabText:{fontSize:10,fontWeight:"800",color:"#999",marginTop:2}',
    'driverActiveCard:{backgroundColor:"#151515",borderRadius:18,padding:16,borderWidth:1,borderColor:"#343434"}':
    'driverActiveCard:{backgroundColor:"rgba(21,21,21,0.96)",borderRadius:15,paddingVertical:10,paddingHorizontal:12,borderWidth:1,borderColor:"#343434"}',
    'driverActiveKicker:{fontSize:11,color:"#ddd",fontWeight:"800"}':
    'driverActiveKicker:{fontSize:9,color:"#ddd",fontWeight:"800"}',
    'driverActiveOrder:{fontSize:19,color:"#fff",fontWeight:"900",marginTop:5}':
    'driverActiveOrder:{fontSize:16,color:"#fff",fontWeight:"900",marginTop:2}',
    'driverAddress:{fontSize:14,color:"#fff",fontWeight:"800",lineHeight:20,marginTop:5}':
    'driverAddress:{fontSize:12,color:"#fff",fontWeight:"800",lineHeight:16,marginTop:3}',
    'driverStatusText:{fontSize:10,color:"#f4c400",fontWeight:"900",marginTop:10}':
    'driverStatusText:{fontSize:9,color:"#f4c400",fontWeight:"900",marginTop:5}',
    'nextStepCard:{backgroundColor:"#101010",borderRadius:16,padding:16,borderWidth:1,borderColor:"#252525",marginTop:12}':
    'nextStepCard:{backgroundColor:"rgba(16,16,16,0.97)",borderRadius:15,paddingVertical:10,paddingHorizontal:12,borderWidth:1,borderColor:"#252525"}',
    'nextStepKicker:{fontSize:10,color:"#aaa",fontWeight:"900"}':
    'nextStepKicker:{fontSize:9,color:"#aaa",fontWeight:"900"}',
    'nextStepTitle:{fontSize:15,color:"#fff",fontWeight:"800",lineHeight:21,marginTop:7}':
    'nextStepTitle:{fontSize:12,color:"#fff",fontWeight:"800",lineHeight:16,marginTop:3}',
    'codeInput:{borderWidth:1,borderColor:"#555",backgroundColor:"#0b0b0b",color:"#fff",borderRadius:11,padding:13,fontSize:20,textAlign:"center",letterSpacing:7,marginTop:8}':
    'codeInput:{borderWidth:1,borderColor:"#555",backgroundColor:"#0b0b0b",color:"#fff",borderRadius:10,paddingVertical:8,paddingHorizontal:10,fontSize:18,textAlign:"center",letterSpacing:6,marginTop:5}',
    'actionButton:{backgroundColor:"#f4c400",paddingVertical:14,borderRadius:11,alignItems:"center",marginTop:11}':
    'actionButton:{backgroundColor:"#f4c400",paddingVertical:10,borderRadius:10,alignItems:"center",marginTop:7}',
    'problemButton:{borderWidth:1,borderColor:"#8f3d36",padding:11,borderRadius:11,alignItems:"center",marginTop:9,backgroundColor:"#1b1010"}':
    'problemButton:{borderWidth:1,borderColor:"#8f3d36",paddingVertical:8,paddingHorizontal:10,borderRadius:10,alignItems:"center",marginTop:6,backgroundColor:"#1b1010"}',
    'problemSecondary:{borderWidth:1,borderColor:"#7b6712",padding:11,borderRadius:11,alignItems:"center",marginTop:9,backgroundColor:"#211d0b"}':
    'problemSecondary:{borderWidth:1,borderColor:"#7b6712",paddingVertical:8,paddingHorizontal:10,borderRadius:10,alignItems:"center",marginTop:6,backgroundColor:"#211d0b"}',
    'earning:{textAlign:"center",color:"#74d99a",fontWeight:"900",marginTop:12}':
    'earning:{textAlign:"center",color:"#74d99a",fontWeight:"900",marginTop:7,fontSize:10}',
}
for old, new in replacements.items():
    if old not in app:
        raise SystemExit(f'Estilo esperado nao encontrado: {old[:70]}')
    app = app.replace(old, new, 1)

# Estilo exclusivo para aviso compacto na Home.
needle = 'notice:{backgroundColor:"#2b250c",color:"#f4c400",padding:11,borderRadius:11,marginVertical:8,borderWidth:1,borderColor:"#5b4b00"},'
if needle not in app:
    raise SystemExit('Estilo notice nao encontrado.')
app = app.replace(needle, needle + 'noticeCompact:{backgroundColor:"rgba(43,37,12,0.96)",color:"#f4c400",paddingVertical:7,paddingHorizontal:10,borderRadius:10,marginBottom:6,borderWidth:1,borderColor:"#5b4b00",fontSize:10,lineHeight:13},', 1)

APP.write_text(app, encoding='utf-8')

# 4) O mapa usa a localizacao atual do entregador como centro quando nao ha entrega ativa.
map_text = MAP.read_text(encoding='utf-8')
map_replacements = {
    '  location: _location,': '  location,',
    '  const destination = coordinate(active?.destination?.latitude, active?.destination?.longitude);':
    '  const destination = coordinate(active?.destination?.latitude, active?.destination?.longitude);\n  const driverPosition = coordinate(location?.latitude, location?.longitude);',
    '  const center = navigationTarget ?? pickup ?? destination;':
    '  const center = navigationTarget ?? pickup ?? destination ?? driverPosition;',
    '    const points = [pickup, destination].filter((item): item is Coordinate => Boolean(item));':
    '    const points = [driverPosition, pickup, destination].filter((item): item is Coordinate => Boolean(item));',
    '      <Text style={styles.waitingText}>Aguardando as coordenadas da loja ou do cliente para abrir a rota.</Text>':
    '      <Text style={styles.waitingText}>Ative a localização do aparelho para visualizar sua área de entregas.</Text>',
    '        <Text style={styles.kicker}>{active ? `PEDIDO #${active.orderNumber}` : "MAPA DA ENTREGA"}</Text>':
    '        <Text style={styles.kicker}>{active ? `PEDIDO #${active.orderNumber}` : "MAPA CLICK-FOOD"}</Text>',
    '        <Text style={styles.title}>{active ? `Próximo destino: ${targetLabel}` : "Aguardando uma entrega ativa"}</Text>':
    '        <Text style={styles.title}>{active ? `Próximo destino: ${targetLabel}` : driverPosition ? "Sua área de entregas" : "Obtendo sua localização"}</Text>',
}
for old, new in map_replacements.items():
    if old not in map_text:
        raise SystemExit(f'Trecho do mapa esperado nao encontrado: {old[:80]}')
    map_text = map_text.replace(old, new, 1)

MAP.write_text(map_text, encoding='utf-8')

print('Home do entregador ajustada: mapa permanente, GPS inicial e controles sem rolagem.')
