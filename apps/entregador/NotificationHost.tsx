import React, { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type MobileApp="CUSTOMER"|"DRIVER";
type NotificationRow={id:string;notification_type:string;title:string;body:string;data:Record<string,unknown>|null;read_at:string|null;created_at:string};
type Preferences={push_enabled:boolean;marketing_enabled:boolean;order_updates_enabled:boolean;delivery_updates_enabled:boolean};
type Props={children:React.ReactNode;app:MobileApp;appIdentifier:string};

type PushState="UNKNOWN"|"ACTIVE"|"PERMISSION_DENIED"|"PENDING_BUILD"|"ERROR";

Notifications.setNotificationHandler({
  handleNotification:async()=>({shouldPlaySound:true,shouldSetBadge:true,shouldShowBanner:true,shouldShowList:true}),
});

const defaultPreferences:Preferences={push_enabled:true,marketing_enabled:true,order_updates_enabled:true,delivery_updates_enabled:true};
const timeLabel=(value:string)=>new Date(value).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});

async function installationId(app:MobileApp){
  const key=`@clickfood/${app.toLowerCase()}/installation-id`;
  let value=await AsyncStorage.getItem(key);
  if(!value){value=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;await AsyncStorage.setItem(key,value);}
  return value;
}

export default function NotificationHost({children,app,appIdentifier}:Props){
  const[session,setSession]=useState<Session|null>(null);
  const[rows,setRows]=useState<NotificationRow[]>([]);
  const[open,setOpen]=useState(false);
  const[loading,setLoading]=useState(false);
  const[preferences,setPreferences]=useState<Preferences>(defaultPreferences);
  const[pushState,setPushState]=useState<PushState>("UNKNOWN");

  const unread=useMemo(()=>rows.filter(row=>!row.read_at).length,[rows]);

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>setSession(data.session));
    const{data}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));
    return()=>data.subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    if(!session){setRows([]);setPushState("UNKNOWN");return;}
    loadNotifications();loadPreferences();registerPush();
    const channel=supabase.channel(`mobile-notifications-${app}-${session.user.id}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications",filter:`user_id=eq.${session.user.id}`},payload=>{
        const next=payload.new as NotificationRow;
        setRows(current=>[next,...current.filter(item=>item.id!==next.id)].slice(0,50));
      }).subscribe();
    const received=Notifications.addNotificationReceivedListener(()=>loadNotifications());
    const response=Notifications.addNotificationResponseReceivedListener(()=>{setOpen(true);loadNotifications();});
    return()=>{supabase.removeChannel(channel);received.remove();response.remove();};
  },[session?.user.id]);

  async function loadNotifications(){
    if(!session)return;setLoading(true);
    const{data}=await supabase.from("notifications").select("id,notification_type,title,body,data,read_at,created_at").eq("user_id",session.user.id).order("created_at",{ascending:false}).limit(50);
    setRows((data??[]) as NotificationRow[]);setLoading(false);
  }

  async function loadPreferences(){
    if(!session)return;
    const{data}=await supabase.from("notification_preferences").select("push_enabled,marketing_enabled,order_updates_enabled,delivery_updates_enabled").eq("user_id",session.user.id).maybeSingle();
    setPreferences(data?{push_enabled:Boolean(data.push_enabled),marketing_enabled:Boolean(data.marketing_enabled),order_updates_enabled:Boolean(data.order_updates_enabled),delivery_updates_enabled:Boolean(data.delivery_updates_enabled)}:defaultPreferences);
  }

  async function savePreferences(next:Preferences){
    if(!session)return;setPreferences(next);
    await supabase.from("notification_preferences").upsert({user_id:session.user.id,...next,updated_at:new Date().toISOString()},{onConflict:"user_id"});
  }

  async function registerPush(){
    if(!session)return;
    try{
      if(Platform.OS==="android")await Notifications.setNotificationChannelAsync("clickfood-default",{name:"CLICK-FOOD",importance:Notifications.AndroidImportance.MAX,vibrationPattern:[0,250,180,250],lightColor:"#F4C400"});
      let permission=await Notifications.getPermissionsAsync();
      if(permission.status!=="granted")permission=await Notifications.requestPermissionsAsync();
      if(permission.status!=="granted"){setPushState("PERMISSION_DENIED");return;}
      const projectId=Constants.expoConfig?.extra?.eas?.projectId??Constants.easConfig?.projectId;
      if(!projectId){setPushState("PENDING_BUILD");return;}
      const token=(await Notifications.getExpoPushTokenAsync({projectId})).data;
      const deviceId=await installationId(app);
      const platform=Platform.OS==="android"?"ANDROID":Platform.OS==="ios"?"IOS":Platform.OS==="web"?"WEB":"UNKNOWN";
      const{error}=await supabase.functions.invoke("register-push-token",{body:{token,app,platform,deviceId,appIdentifier}});
      setPushState(error?"ERROR":"ACTIVE");
    }catch{setPushState("ERROR");}
  }

  async function markRead(row:NotificationRow){
    if(row.read_at)return;
    const now=new Date().toISOString();
    setRows(current=>current.map(item=>item.id===row.id?{...item,read_at:now}:item));
    await supabase.from("notifications").update({read_at:now}).eq("id",row.id);
  }

  async function markAll(){
    if(!session||unread===0)return;
    const now=new Date().toISOString();
    setRows(current=>current.map(item=>item.read_at?item:{...item,read_at:now}));
    await supabase.from("notifications").update({read_at:now}).eq("user_id",session.user.id).is("read_at",null);
  }

  const pushLabel=pushState==="ACTIVE"?"Push ativo":pushState==="PERMISSION_DENIED"?"Notificações bloqueadas no aparelho":pushState==="PENDING_BUILD"?"Push será ativado no build instalado":pushState==="ERROR"?"Push aguardando nova tentativa":"Sincronizando notificações";

  return <View style={styles.root}>
    {children}
    {session&&<Pressable accessibilityRole="button" accessibilityLabel={`Notificações. ${unread} não lidas`} style={styles.fab} onPress={()=>{setOpen(true);loadNotifications();}}>
      <Text style={styles.fabIcon}>🔔</Text>{unread>0&&<View style={styles.badge}><Text style={styles.badgeText}>{unread>99?"99+":unread}</Text></View>}
    </Pressable>}
    <Modal visible={open} animationType="slide" onRequestClose={()=>setOpen(false)}>
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}><View><Text style={styles.title}>Notificações</Text><Text style={styles.subtitle}>{unread} não lidas • {pushLabel}</Text></View><Pressable style={styles.close} onPress={()=>setOpen(false)}><Text style={styles.closeText}>×</Text></Pressable></View>
        <View style={styles.preferences}>
          <View style={styles.preferenceRow}><View style={styles.preferenceText}><Text style={styles.preferenceTitle}>Notificações no celular</Text><Text style={styles.preferenceHint}>Chamados, entregas e avisos importantes.</Text></View><Switch value={preferences.push_enabled} onValueChange={value=>savePreferences({...preferences,push_enabled:value})} trackColor={{false:"#d8d8d8",true:"#f4c400"}}/></View>
          <View style={styles.preferenceRow}><View style={styles.preferenceText}><Text style={styles.preferenceTitle}>Campanhas e bônus</Text><Text style={styles.preferenceHint}>Metas, campanhas e oportunidades do CLICK-FOOD.</Text></View><Switch value={preferences.marketing_enabled} onValueChange={value=>savePreferences({...preferences,marketing_enabled:value})} trackColor={{false:"#d8d8d8",true:"#f4c400"}}/></View>
        </View>
        <View style={styles.listHeader}><Text style={styles.listTitle}>Caixa de entrada</Text>{unread>0&&<Pressable onPress={markAll}><Text style={styles.markAll}>Marcar todas como lidas</Text></Pressable>}</View>
        <ScrollView contentContainerStyle={styles.list}>
          {loading&&!rows.length?<Text style={styles.empty}>Carregando...</Text>:rows.length?rows.map(row=><Pressable key={row.id} onPress={()=>markRead(row)} style={[styles.card,!row.read_at&&styles.cardUnread]}>
            <View style={styles.cardTop}><Text style={styles.cardTitle}>{row.title}</Text>{!row.read_at&&<View style={styles.unreadDot}/>}</View>
            <Text style={styles.cardBody}>{row.body}</Text><Text style={styles.cardTime}>{timeLabel(row.created_at)}</Text>
          </Pressable>):<Text style={styles.empty}>Nenhuma notificação por enquanto.</Text>}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </View>;
}

const styles=StyleSheet.create({
  root:{flex:1},fab:{position:"absolute",right:16,bottom:86,width:52,height:52,borderRadius:26,backgroundColor:"#111",borderWidth:3,borderColor:"#f4c400",alignItems:"center",justifyContent:"center",zIndex:9999,elevation:12},fabIcon:{fontSize:20},badge:{position:"absolute",right:-5,top:-6,minWidth:22,height:22,borderRadius:11,paddingHorizontal:5,backgroundColor:"#d52d2d",alignItems:"center",justifyContent:"center"},badgeText:{color:"#fff",fontSize:10,fontWeight:"900"},
  modalSafe:{flex:1,backgroundColor:"#f7f7f5"},modalHeader:{backgroundColor:"#111",paddingHorizontal:18,paddingVertical:16,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},title:{color:"#fff",fontSize:26,fontWeight:"900"},subtitle:{color:"#c9c9c9",fontSize:11,marginTop:4},close:{width:42,height:42,borderRadius:21,backgroundColor:"#2a2a2a",alignItems:"center",justifyContent:"center"},closeText:{color:"#fff",fontSize:29,lineHeight:31},
  preferences:{backgroundColor:"#fff",margin:14,borderRadius:16,borderWidth:1,borderColor:"#e5e5df",overflow:"hidden"},preferenceRow:{padding:14,flexDirection:"row",alignItems:"center",gap:12,borderBottomWidth:1,borderBottomColor:"#eeeeea"},preferenceText:{flex:1},preferenceTitle:{fontWeight:"900",fontSize:14},preferenceHint:{fontSize:11,color:"#777",marginTop:3},
  listHeader:{paddingHorizontal:18,paddingVertical:8,flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:12},listTitle:{fontSize:18,fontWeight:"900"},markAll:{fontSize:11,fontWeight:"900",color:"#876c00"},list:{padding:14,paddingBottom:40},card:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e7e7e2",borderRadius:15,padding:15,marginBottom:9},cardUnread:{borderColor:"#e5c000",backgroundColor:"#fffbed"},cardTop:{flexDirection:"row",alignItems:"center",gap:8},cardTitle:{flex:1,fontSize:15,fontWeight:"900"},unreadDot:{width:9,height:9,borderRadius:5,backgroundColor:"#f4c400"},cardBody:{fontSize:13,lineHeight:19,color:"#424242",marginTop:7},cardTime:{fontSize:10,color:"#898989",marginTop:10,fontWeight:"700"},empty:{textAlign:"center",color:"#777",padding:32}
});