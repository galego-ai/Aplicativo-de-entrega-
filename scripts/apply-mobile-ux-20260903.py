from pathlib import Path
import json, math, struct, wave

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def write(path, text):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f"Marcador não encontrado: {label}")
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------------
# APP CLIENTE: carrinho no topo, checkout dentro do carrinho e progresso.
# ---------------------------------------------------------------------------
path = "apps/cliente/App.tsx"
s = read(path)
s = replace_once(
    s,
    'import { Alert, Image, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";',
    'import { Alert, Image, Modal, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";',
    "import Modal cliente",
)

progress_helpers = '''\nconst orderProgressSteps=["Recebido","Aceito","Preparando","A caminho","Entregue"] as const;\nfunction orderProgressIndex(status:string){\n  if(status==="DELIVERED")return 4;\n  if(["PICKUP_CONFIRMED","PICKED_UP","DRIVER_TO_CUSTOMER","ON_THE_WAY","DRIVER_AT_CUSTOMER"].includes(status))return 3;\n  if(["PREPARING","READY","WAITING_DRIVER","DRIVER_ASSIGNED","DRIVER_TO_STORE"].includes(status))return 2;\n  if(status==="ACCEPTED")return 1;\n  return 0;\n}\nfunction OrderProgress({status}:{status:string}){\n  if(["CANCELLED","REJECTED","PAYMENT_FAILED","REFUNDED"].includes(status))return null;\n  const current=orderProgressIndex(status);\n  return <View style={styles.orderProgress}><View style={styles.progressBars}>{orderProgressSteps.map((step,index)=><View key={step} style={[styles.progressBar,index<=current&&styles.progressBarActive]}/>)}</View><View style={styles.progressLabels}>{orderProgressSteps.map((step,index)=><Text key={step} numberOfLines={1} style={[styles.progressLabel,index<=current&&styles.progressLabelActive]}>{step}</Text>)}</View></View>;\n}\n'''
s = replace_once(s, '\nfunction AuthScreen(){', progress_helpers + '\nfunction AuthScreen(){', "helpers de progresso")
s = replace_once(
    s,
    'const[selectedStore,setSelectedStore]=useState<Store|null>(null); const[products,setProducts]=useState<ProductWithMedia[]>([]);',
    'const[selectedStore,setSelectedStore]=useState<Store|null>(null); const[cartOpen,setCartOpen]=useState(false); const[products,setProducts]=useState<ProductWithMedia[]>([]);',
    "estado cartOpen",
)
s = replace_once(
    s,
    'const storeScrollRef=useRef<ScrollView>(null); const[bagY,setBagY]=useState(0);',
    'const storeScrollRef=useRef<ScrollView>(null);',
    "remover bagY",
)
s = replace_once(
    s,
    'setMessage("");setSelectedStore(store);setCart([]);setSelectedProduct(null);setSelectedCategoryId("ALL");setDeliveryPreview(null);setBagY(0);',
    'setMessage("");setSelectedStore(store);setCart([]);setCartOpen(false);setSelectedProduct(null);setSelectedCategoryId("ALL");setDeliveryPreview(null);',
    "openStore cartOpen",
)

old_back = '      <Pressable onPress={()=>{setSelectedStore(null);setSelectedProduct(null);setMessage("");}}><Text style={styles.back}>‹ Voltar</Text></Pressable>'
new_back = '''      <View style={styles.storeTopbar}><Pressable onPress={()=>{setCartOpen(false);setSelectedStore(null);setSelectedProduct(null);setMessage("");}}><Text style={styles.back}>‹ Voltar</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Abrir carrinho com ${cartQuantity} ${cartQuantity===1?"item":"itens"}`} style={styles.topCartButton} onPress={()=>setCartOpen(true)}><Text style={styles.topCartIcon}>🛒</Text><View style={styles.topCartBody}><Text style={styles.topCartTitle}>Carrinho</Text><Text style={styles.topCartMeta}>{cartQuantity} {cartQuantity===1?"item":"itens"} • {brl(cartSubtotal)}</Text></View><View style={styles.topCartBadge}><Text style={styles.topCartBadgeText}>{cartQuantity}</Text></View></Pressable></View>'''
s = replace_once(s, old_back, new_back, "carrinho superior")

cart_marker = '      <View onLayout={event=>setBagY(event.nativeEvent.layout.y)}><Text style={styles.section}>Minha sacola</Text></View>\n'
modal_start = '''      <Modal visible={cartOpen} animationType="slide" onRequestClose={()=>setCartOpen(false)}><SafeAreaView style={styles.cartModalSafe}><View style={styles.cartModalHeader}><View style={{flex:1}}><Text style={styles.cartModalTitle}>Seu carrinho</Text><Text style={styles.cartModalSubtitle}>{selectedStore.name} • {cartQuantity} {cartQuantity===1?"item":"itens"}</Text></View><Pressable accessibilityLabel="Fechar carrinho" style={styles.cartModalClose} onPress={()=>setCartOpen(false)}><Text style={styles.cartModalCloseText}>×</Text></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.cartModalScroll}><Text style={styles.section}>Itens do pedido</Text>\n'''
s = replace_once(s, cart_marker, modal_start, "abrir modal do carrinho")

bag_start = '\n    {!!cart.length&&<Pressable accessibilityRole="button"'
bag_i = s.find(bag_start)
if bag_i < 0:
    raise RuntimeError("Marcador da sacola flutuante não encontrado")
parent_close_i = s.rfind('\n    </ScrollView>', 0, bag_i)
if parent_close_i < 0:
    raise RuntimeError("Fechamento do cardápio não encontrado")
modal_end = '''\n      <Pressable style={styles.continueShopping} onPress={()=>setCartOpen(false)}><Text style={styles.continueShoppingText}>CONTINUAR COMPRANDO</Text></Pressable></ScrollView></SafeAreaView></Modal>'''
s = s[:parent_close_i] + modal_end + s[parent_close_i:]
# Recalcular índices e remover antiga sacola flutuante inferior.
bag_i = s.find(bag_start)
pending_i = s.find('\n    {pendingCardOrder&&cardTokenization&&', bag_i)
if bag_i < 0 or pending_i < 0:
    raise RuntimeError("Não foi possível remover a sacola flutuante antiga")
s = s[:bag_i] + s[pending_i:]

s = replace_once(s, 'placing?"ENVIANDO PEDIDO...":"FAZER PEDIDO"', 'placing?"FINALIZANDO...":"FINALIZAR PEDIDO"', "texto finalizar pedido")
# Fechar o carrinho sempre que o pedido deixar o checkout.
s = s.replace('setCart([]);setCoupon("");setSelectedStore(null);setSelectedProduct(null);setTab("orders")', 'setCartOpen(false);setCart([]);setCoupon("");setSelectedStore(null);setSelectedProduct(null);setTab("orders")')

tracking_status = '<Text style={styles.trackingStatus}>{statusLabel[trackedOrder.status]??trackedOrder.status}</Text>'
s = replace_once(s, tracking_status, tracking_status + '<OrderProgress status={trackedOrder.status}/>', "progresso no rastreio")
order_card = '<View style={styles.orderCard}><View style={{flex:1}}><Text style={styles.productName}>{rel?.name??"CLICK-FOOD"} • #{order.order_number}</Text><Text style={styles.meta}>{statusLabel[order.status]??order.status} • {paymentStatusLabel[order.payment_status]??order.payment_status}</Text></View><Text style={styles.price}>{brl(order.total)}</Text></View>'
s = replace_once(s, order_card, order_card + '<OrderProgress status={order.status}/>', "progresso nos pedidos")

style_anchor = '  safe:{flex:1,backgroundColor:"#f7f7f7"},center:{flex:1,alignItems:"center",justifyContent:"center",gap:10},scroll:{padding:18,paddingBottom:34},scrollWithBag:{paddingBottom:118},authSafe:'
style_repl = '  safe:{flex:1,backgroundColor:"#f7f7f7"},center:{flex:1,alignItems:"center",justifyContent:"center",gap:10},scroll:{padding:18,paddingBottom:34},scrollWithBag:{paddingBottom:34},storeTopbar:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:8},topCartButton:{minWidth:166,backgroundColor:"#111",borderRadius:14,paddingVertical:9,paddingHorizontal:11,flexDirection:"row",alignItems:"center",gap:8,borderWidth:1,borderColor:"#f4c400"},topCartIcon:{fontSize:20},topCartBody:{flex:1},topCartTitle:{color:"#f4c400",fontSize:11,fontWeight:"900"},topCartMeta:{color:"#fff",fontSize:9,fontWeight:"700",marginTop:2},topCartBadge:{minWidth:24,height:24,borderRadius:12,backgroundColor:"#f4c400",alignItems:"center",justifyContent:"center",paddingHorizontal:5},topCartBadgeText:{fontSize:10,fontWeight:"900",color:"#111"},cartModalSafe:{flex:1,backgroundColor:"#f7f7f7"},cartModalHeader:{backgroundColor:"#111",padding:16,flexDirection:"row",alignItems:"center",gap:12},cartModalTitle:{color:"#fff",fontSize:25,fontWeight:"900"},cartModalSubtitle:{color:"#bbb",fontSize:10,marginTop:3},cartModalClose:{width:40,height:40,borderRadius:20,backgroundColor:"#2c2c2c",alignItems:"center",justifyContent:"center"},cartModalCloseText:{color:"#fff",fontSize:28,lineHeight:30},cartModalScroll:{padding:16,paddingBottom:38},continueShopping:{borderWidth:1,borderColor:"#111",backgroundColor:"#fff",padding:15,borderRadius:14,alignItems:"center",marginTop:10,marginBottom:12},continueShoppingText:{fontSize:10,fontWeight:"900",color:"#111"},authSafe:'
s = replace_once(s, style_anchor, style_repl, "estilos carrinho")

progress_style_anchor = '  orderBlock:{marginBottom:10},orderCard:{backgroundColor:"#fff",borderRadius:14,padding:14,flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:10},rowBetween:'
progress_style_repl = '  orderBlock:{marginBottom:10},orderCard:{backgroundColor:"#fff",borderRadius:14,padding:14,flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:10},orderProgress:{backgroundColor:"#fff",borderRadius:12,paddingHorizontal:11,paddingTop:10,paddingBottom:9,marginTop:5,borderWidth:1,borderColor:"#ececec"},progressBars:{flexDirection:"row",gap:4},progressBar:{flex:1,height:6,borderRadius:999,backgroundColor:"#e3e3e3"},progressBarActive:{backgroundColor:"#f4c400"},progressLabels:{flexDirection:"row",gap:4,marginTop:6},progressLabel:{flex:1,textAlign:"center",fontSize:7.5,fontWeight:"800",color:"#999"},progressLabelActive:{color:"#5f4c00"},rowBetween:'
s = replace_once(s, progress_style_anchor, progress_style_repl, "estilos progresso")
write(path, s)

# ---------------------------------------------------------------------------
# NOTIFICAÇÕES CLIENTE: só úteis + limpar localmente sem apagar trilha do banco.
# ---------------------------------------------------------------------------
path = "apps/cliente/CustomerProfessionalShell.tsx"
s = read(path)
s = replace_once(s, 'type NotificationRow={id:string;title:string;body:string;read_at:string|null;created_at:string};', 'type NotificationRow={id:string;notification_type:string|null;title:string;body:string;read_at:string|null;created_at:string};', "tipo notificação cliente")
helper = '''\nconst importantCustomerNotificationTypes=new Set(["ORDER_PENDING_PAYMENT","ORDER_ACCEPTED","ORDER_PREPARING","ORDER_READY","ORDER_DRIVER_ASSIGNED","ORDER_DRIVER_TO_CUSTOMER","ORDER_ON_THE_WAY","ORDER_DRIVER_AT_CUSTOMER","ORDER_DELIVERED","ORDER_CANCELLED","ORDER_REJECTED","ORDER_PAYMENT_FAILED"]);\nfunction usefulCustomerNotification(item:NotificationRow){const type=String(item.notification_type||"");if(type)return importantCustomerNotificationTypes.has(type);return /(pagamento|aceit|prepara|pronto|entregador confirmado|a caminho|chegou|entregue|cancel|recus)/i.test(`${item.title} ${item.body}`);}\n'''
s = replace_once(s, '\nasync function installationId(){', helper + '\nasync function installationId(){', "filtro cliente")
s = replace_once(s, 'const row=payload.new as NotificationRow;setNotifications(current=>[row,...current.filter(item=>item.id!==row.id)].slice(0,50));', 'const row=payload.new as NotificationRow;if(!usefulCustomerNotification(row))return;setNotifications(current=>[row,...current.filter(item=>item.id!==row.id)].slice(0,50));', "realtime cliente")
old_load = 'async function loadNotifications(){if(!session)return;const{data}=await supabase.from("notifications").select("id,title,body,read_at,created_at").eq("user_id",session.user.id).order("created_at",{ascending:false}).limit(50);setNotifications((data??[]) as NotificationRow[]);}'
new_load = 'async function loadNotifications(){if(!session)return;const{data}=await supabase.from("notifications").select("id,notification_type,title,body,read_at,created_at").eq("user_id",session.user.id).order("created_at",{ascending:false}).limit(80);const cutoff=await AsyncStorage.getItem(`@clickfood/customer/notifications-cleared-${session.user.id}`);const rows=((data??[]) as NotificationRow[]).filter(item=>usefulCustomerNotification(item)&&(!cutoff||new Date(item.created_at).getTime()>new Date(cutoff).getTime()));setNotifications(rows.slice(0,50));}'
s = replace_once(s, old_load, new_load, "load cliente")
mark = 'async function markAllNotifications(){if(!session||!unread)return;const now=new Date().toISOString();setNotifications(current=>current.map(item=>item.read_at?item:{...item,read_at:now}));await supabase.from("notifications").update({read_at:now}).eq("user_id",session.user.id).is("read_at",null);}'
clear = mark + '\n async function clearNotifications(){if(!session||!notifications.length)return;const now=new Date().toISOString();await AsyncStorage.setItem(`@clickfood/customer/notifications-cleared-${session.user.id}`,now);setNotifications([]);try{await Notifications.setBadgeCountAsync(0);}catch{}}'
s = replace_once(s, mark, clear, "limpar cliente")
action_old = '{unread>0&&<Pressable style={styles.markAll} onPress={()=>void markAllNotifications()}><Text style={styles.markAllText}>MARCAR TODAS COMO LIDAS</Text></Pressable>}<ScrollView contentContainerStyle={styles.notificationList}>'
action_new = '<View style={styles.notificationActions}>{unread>0&&<Pressable style={styles.markAll} onPress={()=>void markAllNotifications()}><Text style={styles.markAllText}>MARCAR COMO LIDAS</Text></Pressable>}{notifications.length>0&&<Pressable style={styles.clearNotifications} onPress={()=>void clearNotifications()}><Text style={styles.clearNotificationsText}>LIMPAR NOTIFICAÇÕES</Text></Pressable>}</View><ScrollView contentContainerStyle={styles.notificationList}>'
s = replace_once(s, action_old, action_new, "ações notificações cliente")
style_old = 'markAll:{padding:13,alignItems:"flex-end"},markAllText:{fontSize:9,fontWeight:"900",color:"#806600"},notificationList:'
style_new = 'notificationActions:{padding:12,flexDirection:"row",justifyContent:"flex-end",alignItems:"center",gap:8,flexWrap:"wrap"},markAll:{paddingHorizontal:10,paddingVertical:9,backgroundColor:"#fff4bf",borderRadius:10},markAllText:{fontSize:9,fontWeight:"900",color:"#806600"},clearNotifications:{paddingHorizontal:10,paddingVertical:9,backgroundColor:"#111",borderRadius:10},clearNotificationsText:{fontSize:9,fontWeight:"900",color:"#f4c400"},notificationList:'
s = replace_once(s, style_old, style_new, "estilo limpar cliente")
write(path, s)

# ---------------------------------------------------------------------------
# NOTIFICAÇÕES ENTREGADOR: só chamadas/alertas úteis + botão limpar + canal.
# ---------------------------------------------------------------------------
path = "apps/entregador/DriverProfessionalShell.tsx"
s = read(path)
s = replace_once(s, 'type NotificationRow={id:string;title:string;body:string;read_at:string|null;created_at:string};', 'type NotificationRow={id:string;notification_type:string|null;title:string;body:string;read_at:string|null;created_at:string};', "tipo notificação entregador")
helper = '''\nconst importantDriverNotificationTypes=new Set(["DRIVER_OFFER","DRIVER_DRIVER_ASSIGNED","DRIVER_DELIVERY_CANCELLED","DRIVER_RETURN_REQUIRED","DRIVER_INCIDENT"]);\nfunction usefulDriverNotification(item:NotificationRow){const type=String(item.notification_type||"");if(type)return importantDriverNotificationTypes.has(type);return /(nova entrega|entrega confirmada|cancel|retorno|ocorrência|incidente)/i.test(`${item.title} ${item.body}`);}\n'''
s = replace_once(s, '\nasync function installationId(){', helper + '\nasync function installationId(){', "filtro entregador")
s = replace_once(s, 'const row=payload.new as NotificationRow;setNotifications(current=>[row,...current.filter(item=>item.id!==row.id)].slice(0,50));', 'const row=payload.new as NotificationRow;if(!usefulDriverNotification(row))return;setNotifications(current=>[row,...current.filter(item=>item.id!==row.id)].slice(0,50));', "realtime entregador")
old_channel = 'if(Platform.OS==="android")await Notifications.setNotificationChannelAsync("clickfood-default",{name:"CLICK-FOOD",importance:Notifications.AndroidImportance.MAX,vibrationPattern:[0,250,180,250],lightColor:"#F4C400"});'
new_channel = 'if(Platform.OS==="android"){await Notifications.setNotificationChannelAsync("clickfood-default",{name:"CLICK-FOOD",importance:Notifications.AndroidImportance.DEFAULT,vibrationPattern:[0,180],lightColor:"#F4C400"});await Notifications.setNotificationChannelAsync("clickfood-chamadas",{name:"Chamadas CLICK-FOOD",description:"Novas chamadas de entrega",importance:Notifications.AndroidImportance.MAX,sound:"clickfood_chamada.wav",vibrationPattern:[0,300,120,300,120,450],lightColor:"#F4C400"});}'
s = replace_once(s, old_channel, new_channel, "canal chamadas")
old_load = 'async function loadNotifications(){if(!session)return;const{data}=await supabase.from("notifications").select("id,title,body,read_at,created_at").eq("user_id",session.user.id).order("created_at",{ascending:false}).limit(50);setNotifications((data??[]) as NotificationRow[]);}'
new_load = 'async function loadNotifications(){if(!session)return;const{data}=await supabase.from("notifications").select("id,notification_type,title,body,read_at,created_at").eq("user_id",session.user.id).order("created_at",{ascending:false}).limit(80);const cutoff=await AsyncStorage.getItem(`@clickfood/driver/notifications-cleared-${session.user.id}`);const rows=((data??[]) as NotificationRow[]).filter(item=>usefulDriverNotification(item)&&(!cutoff||new Date(item.created_at).getTime()>new Date(cutoff).getTime()));setNotifications(rows.slice(0,50));}'
s = replace_once(s, old_load, new_load, "load entregador")
mark = 'async function markAllNotifications(){if(!session||!unread)return;const now=new Date().toISOString();setNotifications(current=>current.map(item=>item.read_at?item:{...item,read_at:now}));await supabase.from("notifications").update({read_at:now}).eq("user_id",session.user.id).is("read_at",null);}'
clear = mark + '\n async function clearNotifications(){if(!session||!notifications.length)return;const now=new Date().toISOString();await AsyncStorage.setItem(`@clickfood/driver/notifications-cleared-${session.user.id}`,now);setNotifications([]);try{await Notifications.setBadgeCountAsync(0);}catch{}}'
s = replace_once(s, mark, clear, "limpar entregador")
action_old = '{unread>0&&<Pressable style={styles.markAll} onPress={()=>void markAllNotifications()}><Text style={styles.markAllText}>MARCAR TODAS COMO LIDAS</Text></Pressable>}<ScrollView contentContainerStyle={styles.notificationList}>'
action_new = '<View style={styles.notificationActions}>{unread>0&&<Pressable style={styles.markAll} onPress={()=>void markAllNotifications()}><Text style={styles.markAllText}>MARCAR COMO LIDAS</Text></Pressable>}{notifications.length>0&&<Pressable style={styles.clearNotifications} onPress={()=>void clearNotifications()}><Text style={styles.clearNotificationsText}>LIMPAR NOTIFICAÇÕES</Text></Pressable>}</View><ScrollView contentContainerStyle={styles.notificationList}>'
s = replace_once(s, action_old, action_new, "ações notificações entregador")
style_old = 'markAll:{padding:13,alignItems:"flex-end"},markAllText:{fontSize:9,fontWeight:"900",color:"#806600"},notificationList:'
style_new = 'notificationActions:{padding:12,flexDirection:"row",justifyContent:"flex-end",alignItems:"center",gap:8,flexWrap:"wrap"},markAll:{paddingHorizontal:10,paddingVertical:9,backgroundColor:"#fff4bf",borderRadius:10},markAllText:{fontSize:9,fontWeight:"900",color:"#806600"},clearNotifications:{paddingHorizontal:10,paddingVertical:9,backgroundColor:"#111",borderRadius:10},clearNotificationsText:{fontSize:9,fontWeight:"900",color:"#f4c400"},notificationList:'
s = replace_once(s, style_old, style_new, "estilo limpar entregador")
write(path, s)

# Remover a duplicação de notificação de oferta: o trigger DRIVER_OFFER já é a fonte oficial.
path = "supabase/functions/dispatch-delivery/index.ts"
s = read(path)
start = s.find('    const notificationRows=created.map((c)=>({')
if start >= 0:
    end_marker = '    }\n\n    return new Response(JSON.stringify({deliveryId:delivery.id,offers:created.map(({userId,...rest})=>rest)}),'
    end = s.find(end_marker, start)
    if end < 0:
        raise RuntimeError("Fim da notificação duplicada em dispatch-delivery não encontrado")
    s = s[:start] + '    // DRIVER_OFFER é criado pelo trigger central de delivery_offers para evitar alertas duplicados.\n\n' + s[end+6:]
write(path, s)

# ---------------------------------------------------------------------------
# Configurar o arquivo WAV como som nativo do expo-notifications.
# ---------------------------------------------------------------------------
path = ROOT / "apps/entregador/app.json"
config = json.loads(path.read_text(encoding="utf-8"))
plugins = config["expo"].setdefault("plugins", [])
if not any((p == "expo-notifications") or (isinstance(p, list) and p and p[0] == "expo-notifications") for p in plugins):
    plugins.insert(1, ["expo-notifications", {"sounds": ["./assets/clickfood_chamada.wav"]}])
path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# Toque próprio CLICK-FOOD: motivo curto de três notas, sem material de terceiros.
audio_path = ROOT / "apps/entregador/assets/clickfood_chamada.wav"
audio_path.parent.mkdir(parents=True, exist_ok=True)
sr = 44100
segments = [
    (0.00, 0.28, 659.25, 0.62),
    (0.34, 0.30, 783.99, 0.68),
    (0.72, 0.42, 987.77, 0.72),
    (1.24, 0.24, 783.99, 0.48),
]
total = 1.62
frames = []
for i in range(int(total * sr)):
    t = i / sr
    sample = 0.0
    for start, duration, freq, amp in segments:
        local = t - start
        if 0 <= local < duration:
            attack = min(1.0, local / 0.018)
            release = min(1.0, (duration - local) / 0.055)
            env = max(0.0, min(attack, release))
            fundamental = math.sin(2 * math.pi * freq * local)
            overtone = 0.16 * math.sin(2 * math.pi * freq * 2 * local)
            sample += amp * env * (fundamental + overtone)
    sample = max(-0.95, min(0.95, sample))
    frames.append(struct.pack('<h', int(sample * 32767)))
with wave.open(str(audio_path), 'wb') as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(sr)
    wf.writeframes(b''.join(frames))

# ---------------------------------------------------------------------------
# Migração: não enviar pushes intermediários e usar o toque na DRIVER_OFFER.
# ---------------------------------------------------------------------------
migration = r'''create or replace function private.notification_push_allowed(p_user_id uuid, p_type text, p_data jsonb)
returns boolean
language sql
stable
security definer
set search_path=public,private
as $$
  select case
    when coalesce(p.push_enabled,true)=false then false
    when p_type in (
      'DELIVERY_OFFER',
      'ORDER_WAITING_STORE','ORDER_WAITING_DRIVER','ORDER_DRIVER_TO_STORE','ORDER_PICKUP_CONFIRMED',
      'DRIVER_DRIVER_TO_STORE','DRIVER_DRIVER_AT_STORE','DRIVER_PICKUP_CONFIRMED',
      'DRIVER_DRIVER_TO_CUSTOMER','DRIVER_DRIVER_AT_CUSTOMER','DRIVER_DELIVERED'
    ) then false
    when (coalesce(p_data->>'category','')='MARKETING' or p_type in ('MARKETING','PROMOTION','CAMPAIGN')) then coalesce(p.marketing_enabled,true)
    when p_type like 'ORDER_%' then coalesce(p.order_updates_enabled,true)
    when p_type like 'DELIVERY_%' or p_type like 'DRIVER_%' then coalesce(p.delivery_updates_enabled,true)
    else true
  end
  from (select 1) x
  left join public.notification_preferences p on p.user_id=p_user_id;
$$;
revoke all on function private.notification_push_allowed(uuid,text,jsonb) from public, anon, authenticated;

create or replace function private.dispatch_notification_push_batch(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path=public,private,net,extensions
as $$
declare
  v_ids uuid[];
  v_payload jsonb;
  v_request_id bigint;
  v_count integer;
begin
  update public.notification_push_deliveries d
  set status='SKIPPED',last_error='TOKEN_DISABLED',updated_at=now()
  from public.device_push_tokens t
  where d.token_id=t.id and d.status='PENDING' and t.enabled=false;

  with candidates as materialized (
    select d.id
    from public.notification_push_deliveries d
    join public.device_push_tokens t on t.id=d.token_id and t.enabled=true
    where d.status='PENDING' and d.available_at<=now()
    order by d.created_at
    limit least(greatest(coalesce(p_limit,100),1),100)
    for update of d skip locked
  ), picked as (
    select d.id,
           row_number() over(order by d.created_at,d.id)-1 as pos,
           jsonb_build_object(
             'to',t.token,
             'title',n.title,
             'body',n.body,
             'sound',case when n.notification_type='DRIVER_OFFER' then 'clickfood_chamada.wav' else 'default' end,
             'channelId',case when n.notification_type='DRIVER_OFFER' then 'clickfood-chamadas' else 'clickfood-default' end,
             'priority',case when n.notification_type='DRIVER_OFFER' or n.notification_type in ('ORDER_DRIVER_AT_CUSTOMER','DRIVER_DRIVER_ASSIGNED','DRIVER_DELIVERY_CANCELLED','DRIVER_RETURN_REQUIRED','DRIVER_INCIDENT') then 'high' else 'default' end,
             'ttl',case when n.notification_type='DRIVER_OFFER' then 25 else 86400 end,
             'data',coalesce(n.data,'{}'::jsonb)||jsonb_build_object('notificationId',n.id,'notificationType',n.notification_type)
           ) as message
    from candidates c
    join public.notification_push_deliveries d on d.id=c.id
    join public.notifications n on n.id=d.notification_id
    join public.device_push_tokens t on t.id=d.token_id
  )
  select array_agg(id order by pos),jsonb_agg(message order by pos),count(*)::int
  into v_ids,v_payload,v_count
  from picked;

  if coalesce(v_count,0)=0 then return 0; end if;
  v_request_id:=net.http_post(url:='https://exp.host/--/api/v2/push/send',body:=v_payload,headers:=jsonb_build_object('Content-Type','application/json','Accept','application/json','Accept-Encoding','gzip, deflate'),timeout_milliseconds:=5000);
  update public.notification_push_deliveries d set status='REQUESTED',request_id=v_request_id,batch_position=array_position(v_ids,d.id)-1,attempts=d.attempts+1,requested_at=now(),updated_at=now() where d.id=any(v_ids);
  return v_count;
end;
$$;
revoke all on function private.dispatch_notification_push_batch(integer) from public,anon,authenticated;
'''
write("supabase/migrations/202609031300_mobile_notifications_and_driver_call_sound.sql", migration)

print("Patch CLICK-FOOD mobile aplicado com sucesso.")
