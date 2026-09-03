from pathlib import Path

path = Path("apps/entregador/App.tsx")
text = path.read_text(encoding="utf-8")

old_map = '    <DriverLiveMap online={driver.online} location={driverLocation} active={active}/>\n'
if old_map not in text:
    raise SystemExit("Mapa permanente do entregador não encontrado.")
text = text.replace(old_map, "", 1)

old_card = '''        <View style={styles.driverActiveCard}><View style={styles.driverActiveHeader}><View><Text style={styles.driverActiveKicker}>Entrega em andamento</Text><Text style={styles.driverActiveOrder}>Pedido #{active.orderNumber}</Text></View><View style={styles.driverActiveStatusDot}/></View><Text style={styles.driverStatusText}>{driverStatusLabel[active.status]??active.status}</Text><Text style={styles.driverAddress}>{active.status.includes("STORE")||active.status==="DRIVER_ASSIGNED"?active.pickup.storeName:destinationLine}</Text></View>\n        <View style={styles.nextStepCard}>'''
new_card = '''        <View style={styles.driverActiveCard}><View style={styles.driverActiveHeader}><View><Text style={styles.driverActiveKicker}>Entrega em andamento</Text><Text style={styles.driverActiveOrder}>Pedido #{active.orderNumber}</Text></View><View style={styles.driverActiveStatusDot}/></View><Text style={styles.driverStatusText}>{driverStatusLabel[active.status]??active.status}</Text><Text style={styles.driverAddress}>{active.status.includes("STORE")||active.status==="DRIVER_ASSIGNED"?active.pickup.storeName:destinationLine}</Text><Pressable style={styles.mapActionButton} onPress={()=>setMapOpen(true)}><Text style={styles.mapActionText}>⌖ VER MAPA / ROTA</Text></Pressable></View>\n        <View style={styles.nextStepCard}>'''
if old_card not in text:
    raise SystemExit("Card ativo esperado não encontrado.")
text = text.replace(old_card, new_card, 1)

old_style = 'mapControlsDock:{position:"absolute",left:10,right:10,bottom:10}'
new_style = 'mapControlsDock:{flex:1,paddingHorizontal:10,paddingTop:58,paddingBottom:10,justifyContent:"flex-end"}'
if old_style not in text:
    raise SystemExit("Estilo do dock esperado não encontrado.")
text = text.replace(old_style, new_style, 1)

path.write_text(text, encoding="utf-8")
print("Mapa permanente removido; mapa/rota disponível somente por botão em entrega ativa.")
