import React,{ReactNode,useEffect,useState}from"react";
import{Pressable,StyleSheet,Text,View}from"react-native";
import*as Location from"expo-location";
import DriverLiveMap from"./DriverLiveMap";
import{disableBackgroundTracking,enableBackgroundTracking,resumeBackgroundTrackingIfAuthorized}from"./BackgroundLocation";
import{supabase}from"./supabase";

type Driver={id:string;status:string;online:boolean};
type DriverLocation={latitude:number;longitude:number;heading:number|null;recordedAt:string};

export default function DriverIdleHomeShell({children}:{children:ReactNode}){
 const[ready,setReady]=useState(false);const[driver,setDriver]=useState<Driver|null>(null);const[hasActive,setHasActive]=useState(false);const[hasOffer,setHasOffer]=useState(false);const[location,setLocation]=useState<DriverLocation|null>(null);const[busy,setBusy]=useState(false);const[message,setMessage]=useState("");

 async function refresh(){
  const{data:{session}}=await supabase.auth.getSession();
  if(!session){setDriver(null);setHasActive(false);setHasOffer(false);setReady(true);return;}
  const{data:driverData}=await supabase.from("drivers").select("id,status,online").eq("user_id",session.user.id).maybeSingle();
  if(!driverData){setDriver(null);setHasActive(false);setHasOffer(false);setReady(true);return;}
  const next={id:String(driverData.id),status:String(driverData.status),online:Boolean(driverData.online)};setDriver(next);
  if(next.status!=="ACTIVE"){setHasActive(false);setHasOffer(false);setReady(true);return;}
  const[activeResult,offerResult,locationResult]=await Promise.all([
   supabase.functions.invoke("driver-active-delivery",{body:{}}),
   next.online?supabase.functions.invoke("driver-offers",{body:{}}):Promise.resolve({data:{offers:[]},error:null} as any),
   supabase.from("driver_locations").select("latitude,longitude,heading,recorded_at").eq("driver_id",next.id).maybeSingle(),
  ]);
  setHasActive(Boolean(activeResult.data?.delivery));
  setHasOffer(Boolean((offerResult.data?.offers??[]).length));
  const loc=locationResult.data;
  if(loc)setLocation({latitude:Number(loc.latitude),longitude:Number(loc.longitude),heading:loc.heading==null?null:Number(loc.heading),recordedAt:String(loc.recorded_at)});
  setReady(true);
 }

 useEffect(()=>{void refresh();const{data}=supabase.auth.onAuthStateChange(()=>void refresh());return()=>data.subscription.unsubscribe();},[]);
 useEffect(()=>{if(!driver||driver.status!=="ACTIVE")return;const timer=setInterval(()=>void refresh(),4000);return()=>clearInterval(timer);},[driver?.id,driver?.status,driver?.online]);
 useEffect(()=>{
  if(!driver?.online||driver.status!=="ACTIVE"||hasActive||hasOffer)return;
  let subscription:Location.LocationSubscription|undefined;
  let cancelled=false;
  void resumeBackgroundTrackingIfAuthorized(driver.id);
  (async()=>{
   const permission=await Location.requestForegroundPermissionsAsync();
   if(permission.status!=="granted"){if(!cancelled)setMessage("Ative a localização para receber entregas próximas.");return;}
   subscription=await Location.watchPositionAsync({accuracy:Location.Accuracy.High,distanceInterval:20,timeInterval:10000},async position=>{
    const recordedAt=new Date(position.timestamp||Date.now()).toISOString();
    const nextLocation={latitude:position.coords.latitude,longitude:position.coords.longitude,heading:position.coords.heading,recordedAt};
    if(!cancelled)setLocation(nextLocation);
    await supabase.from("driver_locations").upsert({driver_id:driver.id,latitude:position.coords.latitude,longitude:position.coords.longitude,heading:position.coords.heading,speed:position.coords.speed,accuracy:position.coords.accuracy,recorded_at:recordedAt},{onConflict:"driver_id"});
   });
  })();
  return()=>{cancelled=true;subscription?.remove();};
 },[driver?.id,driver?.online,driver?.status,hasActive,hasOffer]);

 async function toggleOnline(){
  if(!driver||busy)return;
  setBusy(true);setMessage("");
  const next=!driver.online;
  const{data,error}=await supabase.functions.invoke("driver-status",{body:{online:next}});
  if(error||data?.error){setMessage(data?.error==="ACTIVE_DELIVERY_PREVENTS_OFFLINE"?"Finalize a entrega atual antes de ficar offline.":"Não foi possível alterar seu status.");setBusy(false);return;}
  setDriver({...driver,online:Boolean(data.driver.online)});
  if(next){
   const enabled=await enableBackgroundTracking(driver.id);
   if(!enabled)setMessage("Você ficou online. Para receber chamadas com a tela bloqueada, permita localização em segundo plano nas configurações do aparelho.");
  }else{
   await disableBackgroundTracking();
   setHasOffer(false);
  }
  setBusy(false);void refresh();
 }

 if(!ready)return <>{children}</>;
 if(!driver||driver.status!=="ACTIVE"||hasActive||hasOffer)return <>{children}</>;

 return <View style={styles.page}>
   <DriverLiveMap online={driver.online} location={location} active={null}/>
   <View style={[styles.statusCard,driver.online?styles.statusOnline:styles.statusOffline]}>
     <Text style={styles.statusTitle}>{driver.online?"Aguardando entregas":"Você está offline"}</Text>
     <Text style={styles.statusText}>{driver.online?"Fique disponível. Quando surgir uma entrega compatível, o chamado aparecerá automaticamente.":"Fique online para começar a receber entregas."}</Text>
   </View>
   {!!message&&<Text style={styles.notice}>{message}</Text>}
   <Pressable disabled={busy} onPress={toggleOnline} style={[styles.toggle,driver.online?styles.goOffline:styles.goOnline,busy&&styles.disabled]}>
     <Text style={styles.toggleText}>{busy?"AGUARDE...":driver.online?"FICAR OFFLINE":"FICAR ONLINE"}</Text>
   </Pressable>
 </View>;
}

const styles=StyleSheet.create({
 page:{flex:1,paddingHorizontal:16,paddingTop:4,paddingBottom:18,backgroundColor:"#f6f6f6"},
 statusCard:{marginTop:14,borderRadius:16,paddingVertical:14,paddingHorizontal:16,borderWidth:1},
 statusOnline:{backgroundColor:"#edf9f1",borderColor:"#b8e4c6"},
 statusOffline:{backgroundColor:"#f1f1f1",borderColor:"#d9d9d9"},
 statusTitle:{fontSize:17,fontWeight:"900",color:"#111",textAlign:"center"},
 statusText:{fontSize:11,lineHeight:16,color:"#666",textAlign:"center",marginTop:4},
 notice:{fontSize:11,lineHeight:16,color:"#7a5600",backgroundColor:"#fff7d6",padding:10,borderRadius:10,marginTop:10,textAlign:"center"},
 toggle:{marginTop:14,borderRadius:16,paddingVertical:17,alignItems:"center",justifyContent:"center"},
 goOnline:{backgroundColor:"#f4c400"},
 goOffline:{backgroundColor:"#111"},
 toggleText:{fontSize:14,fontWeight:"900",color:"#fff"},
 disabled:{opacity:.55},
});
