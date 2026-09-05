from pathlib import Path
import json
import math
import struct
import wave


def must(text: str, old: str, new: str, label: str, count: int = 1) -> str:
    if old not in text:
        raise SystemExit(f"Padrao nao encontrado: {label}")
    return text.replace(old, new, count)


def patch_shell(path: str, kind: str) -> None:
    p = Path(path)
    t = p.read_text()

    t = must(
        t,
        'Notifications.setNotificationHandler({handleNotification:async()=>({shouldPlaySound:true,shouldSetBadge:true,shouldShowBanner:true,shouldShowList:true})});',
        'Notifications.setNotificationHandler({handleNotification:async(notification)=>{const type=String(notification.request.content.data?.notificationType??"");if(type==="CHAT_MESSAGE")return{shouldPlaySound:true,shouldSetBadge:false,shouldShowBanner:false,shouldShowList:false};return{shouldPlaySound:true,shouldSetBadge:true,shouldShowBanner:true,shouldShowList:true};}});',
        f'{kind} notification handler',
    )

    if kind == 'driver':
        t = must(
            t,
            ' const unread=useMemo(()=>notifications.filter(item=>!item.read_at).length,[notifications]);const totalEarnings=',
            ' const unreadMessages=useMemo(()=>notifications.filter(item=>item.notification_type==="CHAT_MESSAGE"&&!item.read_at).length,[notifications]);const unread=useMemo(()=>notifications.filter(item=>item.notification_type!=="CHAT_MESSAGE"&&!item.read_at).length,[notifications]);const alertNotifications=useMemo(()=>notifications.filter(item=>item.notification_type!=="CHAT_MESSAGE"),[notifications]);const totalEarnings=',
            'driver unread counters',
        )
    else:
        t = must(
            t,
            ' const unread=useMemo(()=>notifications.filter(item=>!item.read_at).length,[notifications]);',
            ' const unreadMessages=useMemo(()=>notifications.filter(item=>item.notification_type==="CHAT_MESSAGE"&&!item.read_at).length,[notifications]);const unread=useMemo(()=>notifications.filter(item=>item.notification_type!=="CHAT_MESSAGE"&&!item.read_at).length,[notifications]);const alertNotifications=useMemo(()=>notifications.filter(item=>item.notification_type!=="CHAT_MESSAGE"),[notifications]);',
            'customer unread counters',
        )

    t = t.replace(
        'if(!usefulDriverNotification(row))return;',
        'if(row.notification_type!=="CHAT_MESSAGE"&&!usefulDriverNotification(row))return;',
    )
    t = t.replace(
        'if(!usefulCustomerNotification(row))return;',
        'if(row.notification_type!=="CHAT_MESSAGE"&&!usefulCustomerNotification(row))return;',
    )

    if kind == 'driver':
        t = must(
            t,
            'const rows=((data??[]) as NotificationRow[]).filter(item=>usefulDriverNotification(item)&&(!cutoff||new Date(item.created_at).getTime()>new Date(cutoff).getTime()));',
            'const rows=((data??[]) as NotificationRow[]).filter(item=>item.notification_type==="CHAT_MESSAGE"||(usefulDriverNotification(item)&&(!cutoff||new Date(item.created_at).getTime()>new Date(cutoff).getTime())));',
            'driver notification loading',
        )
    else:
        t = must(
            t,
            'const rows=((data??[]) as NotificationRow[]).filter(item=>usefulCustomerNotification(item)&&(!cutoff||new Date(item.created_at).getTime()>new Date(cutoff).getTime()));',
            'const rows=((data??[]) as NotificationRow[]).filter(item=>item.notification_type==="CHAT_MESSAGE"||(usefulCustomerNotification(item)&&(!cutoff||new Date(item.created_at).getTime()>new Date(cutoff).getTime())));',
            'customer notification loading',
        )

    t = must(
        t,
        'async function markAllNotifications(){if(!session||!unread)return;const now=new Date().toISOString();setNotifications(current=>current.map(item=>item.read_at?item:{...item,read_at:now}));await supabase.from("notifications").update({read_at:now}).eq("user_id",session.user.id).is("read_at",null);}',
        'async function markAllNotifications(){if(!session||!unread)return;const now=new Date().toISOString();setNotifications(current=>current.map(item=>item.notification_type!=="CHAT_MESSAGE"&&!item.read_at?{...item,read_at:now}:item));await supabase.from("notifications").update({read_at:now}).eq("user_id",session.user.id).neq("notification_type","CHAT_MESSAGE").is("read_at",null);}',
        f'{kind} mark alert notifications',
    )

    prefix = '@clickfood/driver' if kind == 'driver' else '@clickfood/customer'
    t = must(
        t,
        f'async function clearNotifications(){{if(!session||!notifications.length)return;const now=new Date().toISOString();await AsyncStorage.setItem(`{prefix}/notifications-cleared-${{session.user.id}}`,now);setNotifications([]);try{{await Notifications.setBadgeCountAsync(0);}}catch{{}}}}',
        f'async function clearNotifications(){{if(!session||!alertNotifications.length)return;const now=new Date().toISOString();await AsyncStorage.setItem(`{prefix}/notifications-cleared-${{session.user.id}}`,now);setNotifications(current=>current.filter(item=>item.notification_type==="CHAT_MESSAGE"));try{{await Notifications.setBadgeCountAsync(unreadMessages);}}catch{{}}}}\n async function markChatNotificationsRead(){{if(!session||!unreadMessages)return;const now=new Date().toISOString();setNotifications(current=>current.map(item=>item.notification_type==="CHAT_MESSAGE"&&!item.read_at?{{...item,read_at:now}}:item));await supabase.from("notifications").update({{read_at:now}}).eq("user_id",session.user.id).eq("notification_type","CHAT_MESSAGE").is("read_at",null);}}\n function openMessageCenter(){{setNotificationsOpen(false);setSection("CHAT");void markChatNotificationsRead();}}',
        f'{kind} chat notification helpers',
    )

    t = must(
        t,
        ' useEffect(()=>{if(!conversationId)return;',
        ' useEffect(()=>{if(section==="CHAT"&&unreadMessages>0)void markChatNotificationsRead();},[section,unreadMessages]);\n useEffect(()=>{if(!conversationId)return;',
        f'{kind} mark chat read effect',
    )

    old_response = 'const response=Notifications.addNotificationResponseReceivedListener(()=>{setNotificationsOpen(true);void loadNotifications();});'
    new_response = 'const response=Notifications.addNotificationResponseReceivedListener(response=>{const type=String(response.notification.request.content.data?.notificationType??"");if(type==="CHAT_MESSAGE"){setSection("CHAT");void markChatNotificationsRead();}else setNotificationsOpen(true);void loadNotifications();});'
    t = must(t, old_response, new_response, f'{kind} notification tap routing')

    if kind == 'driver':
        old_channels = 'if(Platform.OS==="android"){await Notifications.setNotificationChannelAsync("clickfood-default",{name:"CLICK-FOOD",importance:Notifications.AndroidImportance.DEFAULT,vibrationPattern:[0,180],lightColor:"#F4C400"});await Notifications.setNotificationChannelAsync("clickfood-chamadas",{name:"Chamadas CLICK-FOOD",description:"Novas chamadas de entrega",importance:Notifications.AndroidImportance.MAX,sound:"clickfood_chamada.wav",vibrationPattern:[0,300,120,300,120,450],lightColor:"#F4C400"});}'
    else:
        old_channels = 'if(Platform.OS==="android")await Notifications.setNotificationChannelAsync("clickfood-default",{name:"CLICK-FOOD",importance:Notifications.AndroidImportance.MAX,vibrationPattern:[0,250,180,250],lightColor:"#F4C400"});'
    new_channels = 'if(Platform.OS==="android"){await Notifications.setNotificationChannelAsync("clickfood-alertas",{name:"Alertas e mensagens CLICK-FOOD",description:"Mensagens e atualizações de pedidos",importance:Notifications.AndroidImportance.HIGH,sound:"clickfood_alerta.wav",vibrationPattern:[0,180,90,180],lightColor:"#F4C400"});await Notifications.setNotificationChannelAsync("clickfood-chamadas",{name:"Chamadas CLICK-FOOD",description:"Chamadas e avisos urgentes",importance:Notifications.AndroidImportance.MAX,sound:"clickfood_chamada.wav",vibrationPattern:[0,300,120,300,120,450],lightColor:"#F4C400"});await Notifications.setNotificationChannelAsync("clickfood-default",{name:"CLICK-FOOD",importance:Notifications.AndroidImportance.DEFAULT,sound:"clickfood_alerta.wav",vibrationPattern:[0,180],lightColor:"#F4C400"});}'
    t = must(t, old_channels, new_channels, f'{kind} notification channels')

    bell = '<Pressable accessibilityLabel={`Notificações. ${unread} não lidas`} style={styles.iconButton} onPress={()=>{setNotificationsOpen(true);void loadNotifications();}}><Text style={styles.bell}>🔔</Text>{unread>0&&<View style={styles.badge}><Text style={styles.badgeText}>{unread>99?"99+":unread}</Text></View>}</Pressable>'
    top = '<View style={styles.topActions}><Pressable accessibilityLabel={`Mensagens. ${unreadMessages} não lidas`} style={styles.iconButton} onPress={openMessageCenter}><Text style={styles.messageIcon}>💬</Text>{unreadMessages>0&&<View style={styles.badge}><Text style={styles.badgeText}>{unreadMessages>99?"99+":unreadMessages}</Text></View>}</Pressable>'+bell+'</View>'
    t = must(t, bell, top, f'{kind} top message icon')

    if kind == 'customer':
        t = must(
            t,
            'section==="APP"?<React.Fragment key={appRefresh}>{children}</React.Fragment>:section==="ADDRESSES"?<AddressScreen/>:section==="HISTORY"?<HistoryScreen/>:section==="PAYMENTS"?<PaymentsScreen/>:section==="CHAT"?<ChatScreen/>:section==="SUPPORT"?<CustomerSupport/>:<AccountScreen/>',
            'section==="APP"?<React.Fragment key={appRefresh}>{children}</React.Fragment>:section==="ADDRESSES"?AddressScreen():section==="HISTORY"?HistoryScreen():section==="PAYMENTS"?PaymentsScreen():section==="CHAT"?ChatScreen():section==="SUPPORT"?<CustomerSupport/>:AccountScreen()',
            'customer stable nested screens',
        )
    else:
        t = must(
            t,
            'section==="APP"?children:section==="HISTORY"?<HistoryScreen/>:section==="REPORTS"?<DriverReports onBack={()=>setSection("APP")}/>:section==="REVIEWS"?<DriverReviews onBack={()=>setSection("APP")}/>:section==="WALLET"?<WalletScreen/>:section==="PIX"?<PixScreen/>:section==="CHAT"?<ChatScreen/>:section==="SUPPORT"?<DriverSupport/>:<AccountScreen/>',
            'section==="APP"?children:section==="HISTORY"?HistoryScreen():section==="REPORTS"?<DriverReports onBack={()=>setSection("APP")}/>:section==="REVIEWS"?<DriverReviews onBack={()=>setSection("APP")}/>:section==="WALLET"?WalletScreen():section==="PIX"?PixScreen():section==="CHAT"?ChatScreen():section==="SUPPORT"?<DriverSupport/>:AccountScreen()',
            'driver stable nested screens',
        )

    t = must(
        t,
        'behavior={Platform.OS==="ios"?"padding":"height"}',
        'behavior={Platform.OS==="ios"?"padding":undefined} keyboardVerticalOffset={0}',
        f'{kind} keyboard avoiding view',
    )
    t = t.replace(
        'contentContainerStyle={styles.messagesContent} keyboardShouldPersistTaps="handled">',
        'contentContainerStyle={styles.messagesContent} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS==="ios"?"interactive":"on-drag"}>',
    )
    t = t.replace(
        '{notifications.length>0&&<Pressable style={styles.clearNotifications}',
        '{alertNotifications.length>0&&<Pressable style={styles.clearNotifications}',
    )
    t = t.replace(
        '<ScrollView contentContainerStyle={styles.notificationList}>{notifications.length?notifications.map(item=>',
        '<ScrollView contentContainerStyle={styles.notificationList}>{alertNotifications.length?alertNotifications.map(item=>',
    )
    t = t.replace(
        'bell:{fontSize:19',
        'topActions:{flexDirection:"row",alignItems:"center",gap:2},messageIcon:{fontSize:20},bell:{fontSize:19',
    )
    t = t.replace(
        'paddingBottom:Platform.OS==="android"?16:10,flexDirection:"row"',
        'paddingBottom:Platform.OS==="android"?8:12,flexDirection:"row"',
    )
    t = t.replace(
        'borderRadius:14,padding:11,backgroundColor:"#fafafa"',
        'borderRadius:14,paddingHorizontal:12,paddingVertical:10,backgroundColor:"#fafafa",fontSize:15,lineHeight:20,textAlignVertical:"top"',
    )
    p.write_text(t)


def configure_app(path: str) -> None:
    p = Path(path)
    data = json.loads(p.read_text())
    expo = data['expo']
    expo.setdefault('android', {})['softwareKeyboardLayoutMode'] = 'resize'
    plugins = expo.setdefault('plugins', [])
    found = False
    for plugin in plugins:
        if isinstance(plugin, list) and plugin and plugin[0] == 'expo-notifications':
            while len(plugin) < 2:
                plugin.append({})
            plugin[1]['color'] = '#F4C400'
            plugin[1]['defaultChannel'] = 'clickfood-alertas'
            plugin[1]['sounds'] = ['./assets/clickfood_alerta.wav', './assets/clickfood_chamada.wav']
            found = True
    if not found:
        plugins.append(['expo-notifications', {
            'color': '#F4C400',
            'defaultChannel': 'clickfood-alertas',
            'sounds': ['./assets/clickfood_alerta.wav', './assets/clickfood_chamada.wav'],
        }])
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def tone(path: str, pattern) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    rate = 44100
    frames = []
    for freq, duration, volume in pattern:
        count = int(rate * duration)
        for i in range(count):
            sample = 0 if freq == 0 else int(32767 * volume * math.sin(2 * math.pi * freq * i / rate))
            frames.append(struct.pack('<h', sample))
    with wave.open(str(p), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b''.join(frames))


patch_shell('apps/cliente/CustomerProfessionalShell.tsx', 'customer')
patch_shell('apps/entregador/DriverProfessionalShell.tsx', 'driver')
configure_app('apps/cliente/app.json')
configure_app('apps/entregador/app.json')

alert = [(880, .11, .42), (0, .05, 0), (1175, .13, .38)]
call = []
for _ in range(3):
    call += [(690, .22, .48), (0, .07, 0), (920, .22, .48), (0, .09, 0)]
for base in ['apps/cliente/assets', 'apps/entregador/assets']:
    tone(f'{base}/clickfood_alerta.wav', alert)
    tone(f'{base}/clickfood_chamada.wav', call)

# Keep repository copies aligned with the production card backend already deployed.
for f in [
    'supabase/functions/efi-card-charge/index.ts',
    'supabase/functions/efi-card-status/index.ts',
    'supabase/functions/efi-card-refund/index.ts',
    'supabase/functions/efi-card-webhook/index.ts',
    'supabase/functions/efi-card-reconcile-worker/index.ts',
]:
    p = Path(f)
    if not p.exists():
        continue
    s = p.read_text()
    s = s.replace(
        'const base=()=>env("EFI_PIX_SANDBOX")==="false"?"https://cobrancas.api.efipay.com.br":"https://cobrancas-h.api.efipay.com.br";',
        'const base=()=>"https://cobrancas.api.efipay.com.br";',
    )
    s = s.replace(
        '.eq("provider","EFI").maybeSingle()',
        '.eq("provider","EFI_BANK").eq("environment","PRODUCTION").maybeSingle()',
    )
    s = s.replace(
        'metadata:{custom_id:order.id,notification_url:notificationUrl}',
        'metadata:{custom_id:`CLICKFOOD_${order.id}`,notification_url:notificationUrl}',
    )
    p.write_text(s)

pm = Path('supabase/functions/payment-methods/index.ts')
if pm.exists():
    s = pm.read_text()
    old = 'const efi=providers.find((row:any)=>String(row.provider)==="EFI");\n  const efiMethods=(efi?.supported_methods??[]).map((method:any)=>String(method));\n  const accountId=Deno.env.get("EFI_ACCOUNT_ID")?.trim()??"";\n  const globalPixEnabled=!!efi&&efiMethods.includes("PIX");\n  const globalCardEnabled=!!efi&&efiMethods.includes("CREDIT_CARD")&&!!accountId;'
    new = 'const efiPix=providers.find((row:any)=>String(row.provider)==="EFI");\n  const efiCard=providers.find((row:any)=>String(row.provider)==="EFI_BANK"&&String(row.environment)==="PRODUCTION")??providers.find((row:any)=>String(row.provider)==="EFI"&&String(row.environment)==="PRODUCTION");\n  const pixMethods=(efiPix?.supported_methods??[]).map((method:any)=>String(method));\n  const cardMethods=(efiCard?.supported_methods??[]).map((method:any)=>String(method));\n  const accountId=Deno.env.get("EFI_ACCOUNT_ID")?.trim()??"";\n  const globalPixEnabled=!!efiPix&&String(efiPix.environment)==="PRODUCTION"&&pixMethods.includes("PIX")&&Deno.env.get("EFI_PIX_SANDBOX")==="false";\n  const globalCardEnabled=!!efiCard&&cardMethods.includes("CREDIT_CARD")&&!!accountId;'
    s = must(s, old, new, 'payment-methods production split')
    s = s.replace(
        'environment:Deno.env.get("EFI_PIX_SANDBOX")==="false"?"production":"sandbox",',
        'environment:"production",',
    )
    pm.write_text(s)

print('CLICK-FOOD mobile patch applied')
