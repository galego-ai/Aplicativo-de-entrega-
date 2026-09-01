import React,{ReactNode,useEffect,useRef,useState}from"react";
import{Alert,AppState,Platform,View}from"react-native";
import type{Session}from"@supabase/supabase-js";
import{supabase}from"./supabase";
import{canUseFloatingBubble,requestFloatingBubblePermission,startFloatingBubble,stopFloatingBubble}from"./FloatingBubble";

type DriverState={id:string;online:boolean};

export default function DriverFloatingBubbleHost({children}:{children:ReactNode}){
 const[session,setSession]=useState<Session|null>(null);const[driver,setDriver]=useState<DriverState|null>(null);const lastOnline=useRef<boolean|null>(null);const asking=useRef(false);
 useEffect(()=>{supabase.auth.getSession().then(({data})=>setSession(data.session));const{data}=supabase.auth.onAuthStateChange((_e,next)=>setSession(next));return()=>data.subscription.unsubscribe();},[]);
 useEffect(()=>{if(!session){setDriver(null);lastOnline.current=null;void stopFloatingBubble();return;}void loadDriver();},[session?.user.id]);
 useEffect(()=>{if(!driver)return;const channel=supabase.channel(`driver-floating-bubble-${driver.id}`).on("postgres_changes",{event:"UPDATE",schema:"public",table:"drivers",filter:`id=eq.${driver.id}`},payload=>{const next={id:driver.id,online:Boolean((payload.new as any).online)};setDriver(next);void sync(next.online,true);}).subscribe();return()=>{supabase.removeChannel(channel);};},[driver?.id]);
 useEffect(()=>{const sub=AppState.addEventListener("change",state=>{if(state==="active")void refreshAndStart();});return()=>sub.remove();},[driver?.id]);
 async function loadDriver(){if(!session)return;const{data}=await supabase.from("drivers").select("id,online").eq("user_id",session.user.id).maybeSingle();if(!data){setDriver(null);return;}const next={id:String(data.id),online:Boolean(data.online)};setDriver(next);lastOnline.current=next.online;await sync(next.online,false);}
 async function refreshAndStart(){if(!session)return;const{data}=await supabase.from("drivers").select("id,online").eq("user_id",session.user.id).maybeSingle();if(!data)return;const next={id:String(data.id),online:Boolean(data.online)};setDriver(next);if(next.online&&await canUseFloatingBubble())await startFloatingBubble();else if(!next.online)await stopFloatingBubble();}
 async function sync(online:boolean,promptOnTransition:boolean){const previous=lastOnline.current;lastOnline.current=online;if(Platform.OS!=="android")return;if(!online){await stopFloatingBubble();return;}if(await canUseFloatingBubble()){await startFloatingBubble();return;}if(!promptOnTransition||previous!==false||asking.current)return;asking.current=true;Alert.alert("Ativar bolinha flutuante","Permita ao CLICK-FOOD Entregador aparecer sobre outros apps. Enquanto você estiver online, a bolinha ficará disponível para voltar rapidamente à tela inicial.",[{text:"AGORA NÃO",style:"cancel",onPress:()=>{asking.current=false;}},{text:"ATIVAR",onPress:async()=>{await requestFloatingBubblePermission();asking.current=false;}}],{cancelable:true,onDismiss:()=>{asking.current=false;}});}
 return <View style={{flex:1}}>{children}</View>;
}
