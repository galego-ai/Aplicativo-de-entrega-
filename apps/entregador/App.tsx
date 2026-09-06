import React, { useEffect, useMemo, useState } from "react";
import {
  Alert, Modal, Platform, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Vibration,
  Text, TextInput, View,
} from "react-native";
import * as Location from "expo-location";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import {
  disableBackgroundTracking,
  enableBackgroundTracking,
  resumeBackgroundTrackingIfAuthorized,
} from "./BackgroundLocation";
import { PasswordResetLink, DeleteAccountButton } from "./AccountLifecycle";
import DriverWallet from "./DriverWallet";
import DriverLiveMap from "./DriverLiveMap";
import { canUseFloatingBubble, hasFloatingBubbleNativeModule, requestFloatingBubblePermission, startFloatingBubble, stopFloatingBubble } from "./FloatingBubble";

type Screen = "home" | "history" | "wallet" | "profile";
type Driver = { id: string; status: string; online: boolean; rating: number; acceptance_rate: number; city_id: string | null };
type City = { id: string; name: string; state: string };
type Offer = { id: string; deliveryId: string; storeName: string; pickupDistanceKm: number | null; deliveryDistanceKm: number | null; earning: number; expiresAt: string };
type ActiveDelivery = {
  id: string; status: string; earning: number; orderNumber: number; orderStatus: string;
  pickup: { storeName: string; latitude: number | null; longitude: number | null };
  destination: { street: string; number: string | null; complement: string | null; district: string | null; reference: string | null; latitude: number | null; longitude: number | null } | null;
};
type HistoryItem = { id:string; orderNumber:number|null; storeName:string; deliveryFee:number; driverEarning:number; pickupAt:string|null; deliveredAt:string|null; durationMinutes:number|null };
type DriverLocation = { latitude:number; longitude:number; heading:number|null; recordedAt:string };

const brl = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

const driverStatusLabel:Record<string,string>={DRIVER_ASSIGNED:"Entrega confirmada",DRIVER_TO_STORE:"Indo até a loja",DRIVER_AT_STORE:"Na loja",PICKUP_CONFIRMED:"Pedido retirado",DRIVER_TO_CUSTOMER:"A caminho do cliente",DRIVER_AT_CUSTOMER:"Chegou ao cliente",CUSTOMER_UNAVAILABLE:"Cliente não localizado",INCIDENT:"Ocorrência registrada",RETURN_REQUIRED:"Retorno necessário",DELIVERED:"Entregue"};

function AuthScreen() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true); setMessage("");
    if (mode === "register") {
      if (!name.trim() || !phone.trim() || password.length < 8) {
        setMessage("Informe nome, telefone e senha com pelo menos 8 caracteres."); setBusy(false); return;
      }
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim(), phone: phone.trim() } } });
      if (error) setMessage(error.message);
      else if (!data.session) setMessage("Conta criada. Confirme seu e-mail para continuar o cadastro.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setMessage("E-mail ou senha inválidos.");
    }
    setBusy(false);
  }

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.authWrap} keyboardShouldPersistTaps="handled">
    <Text style={styles.brand}><Text style={styles.yellow}>CLICK</Text>-FOOD</Text><Text style={styles.subtitle}>ENTREGADOR</Text>
    <Text style={styles.authTitle}>{mode === "login" ? "Entrar" : "Quero ser entregador"}</Text>
    {mode === "register" && <><TextInput style={styles.input} placeholder="Nome completo" value={name} onChangeText={setName}/><TextInput style={styles.input} placeholder="Telefone" keyboardType="phone-pad" value={phone} onChangeText={setPhone}/></>}
    <TextInput style={styles.input} placeholder="E-mail" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail}/>
    <TextInput style={styles.input} placeholder="Senha" secureTextEntry value={password} onChangeText={setPassword}/>
    {!!message && <Text style={styles.notice}>{message}</Text>}
    <Pressable style={[styles.primary, busy && styles.disabled]} onPress={submit} disabled={busy}><Text style={styles.primaryText}>{busy ? "AGUARDE..." : mode === "login" ? "ENTRAR" : "CRIAR CONTA"}</Text></Pressable>
    <Pressable onPress={()=>{setMode(mode === "login" ? "register" : "login");setMessage("");}}><Text style={styles.switchText}>{mode === "login" ? "Quero me cadastrar como entregador" : "Já tenho uma conta"}</Text></Pressable>
    {mode==="login"&&<PasswordResetLink scheme="clickfood-entregador"/>}
  </ScrollView></SafeAreaView>;
}

function DriverRegistration({ cities, onDone }: { cities: City[]; onDone: () => void }) {
  const [cityId, setCityId] = useState(cities[0]?.id ?? "");
  const [vehicleType, setVehicleType] = useState<"MOTORCYCLE"|"CAR"|"BICYCLE">("MOTORCYCLE");
  const [brand, setBrand] = useState(""); const [model, setModel] = useState(""); const [plate, setPlate] = useState("");
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);

  async function submit() {
    if (!cityId) { setMessage("Nenhuma cidade foi liberada para cadastro ainda."); return; }
    setBusy(true); setMessage("");
    const { data, error } = await supabase.functions.invoke("register-driver", { body: { cityId, vehicleType, brand, model, plate } });
    if (error || data?.error) setMessage("Não foi possível enviar o cadastro."); else onDone();
    setBusy(false);
  }

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.brand}><Text style={styles.yellow}>CLICK</Text>-FOOD</Text><Text style={styles.pageTitle}>Cadastro de entregador</Text>
    <Text style={styles.label}>Cidade de atuação</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.choices}>{cities.length ? cities.map(city=><Pressable key={city.id} onPress={()=>setCityId(city.id)} style={[styles.chip,cityId===city.id&&styles.chipActive]}><Text style={cityId===city.id?styles.chipTextActive:styles.chipText}>{city.name} - {city.state}</Text></Pressable>) : <Text style={styles.notice}>A Matriz ainda não liberou cidades para novos entregadores.</Text>}</ScrollView>
    <Text style={styles.label}>Veículo</Text><View style={styles.choiceRow}>{[["MOTORCYCLE","Moto"],["CAR","Carro"],["BICYCLE","Bicicleta"]].map(([value,label])=><Pressable key={value} onPress={()=>setVehicleType(value as any)} style={[styles.chip,vehicleType===value&&styles.chipActive]}><Text style={vehicleType===value?styles.chipTextActive:styles.chipText}>{label}</Text></Pressable>)}</View>
    <TextInput style={styles.input} placeholder="Marca" value={brand} onChangeText={setBrand}/><TextInput style={styles.input} placeholder="Modelo" value={model} onChangeText={setModel}/>{vehicleType!=="BICYCLE"&&<TextInput style={styles.input} placeholder="Placa" autoCapitalize="characters" value={plate} onChangeText={setPlate}/>} 
    {!!message&&<Text style={styles.notice}>{message}</Text>}<Pressable style={[styles.primary,busy&&styles.disabled]} onPress={submit} disabled={busy}><Text style={styles.primaryText}>{busy?"ENVIANDO...":"ENVIAR PARA APROVAÇÃO"}</Text></Pressable>
    <Pressable onPress={()=>supabase.auth.signOut()}><Text style={styles.switchText}>Sair da conta</Text></Pressable>
    <DeleteAccountButton/>
  </ScrollView></SafeAreaView>;
}

export default function App() {
  const [session,setSession]=useState<Session|null>(null); const [driver,setDriver]=useState<Driver|null>(null); const [cities,setCities]=useState<City[]>([]);
  const [screen,setScreen]=useState<Screen>("home"); const [offer,setOffer]=useState<Offer|null>(null); const [active,setActive]=useState<ActiveDelivery|null>(null);
  const [history,setHistory]=useState<HistoryItem[]>([]); const [code,setCode]=useState(""); const [message,setMessage]=useState(""); const [loading,setLoading]=useState(true);
  const [incidentModal,setIncidentModal]=useState(false); const [incidentReason,setIncidentReason]=useState(""); const [incidentBusy,setIncidentBusy]=useState(false);
  const [driverLocation,setDriverLocation]=useState<DriverLocation|null>(null); const [mapOpen,setMapOpen]=useState(false); const [earningsVisible,setEarningsVisible]=useState(true); const [statusBusy,setStatusBusy]=useState(false);

  useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)});const {data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>data.subscription.unsubscribe();},[]);
  useEffect(()=>{if(session) bootstrap(); else {setDriver(null);setActive(null);setOffer(null);setDriverLocation(null)}},[session]);
  useEffect(()=>{
    if(!driver||driver.status!=="ACTIVE")return;
    const driverId=driver.id;
    const isOnline=driver.online;
    let subscription:Location.LocationSubscription|undefined;
    let cancelled=false;
    async function applyPosition(position:Location.LocationObject,persist:boolean){
      const recordedAt=new Date(position.timestamp||Date.now()).toISOString();
      if(cancelled)return;
      setDriverLocation({latitude:position.coords.latitude,longitude:position.coords.longitude,heading:position.coords.heading,recordedAt});
      if(!persist)return;
      await supabase.from("driver_locations").upsert({driver_id:driverId,latitude:position.coords.latitude,longitude:position.coords.longitude,heading:position.coords.heading,speed:position.coords.speed,accuracy:position.coords.accuracy,recorded_at:recordedAt},{onConflict:"driver_id"});
    }
    (async()=>{
      const permission=await Location.requestForegroundPermissionsAsync();
      if(permission.status!=="granted"){if(!cancelled)setMessage("Ative a localização para visualizar o mapa e receber entregas próximas.");return;}
      try{
        const current=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
        await applyPosition(current,isOnline);
      }catch{}
      if(cancelled||!isOnline)return;
      subscription=await Location.watchPositionAsync({accuracy:Location.Accuracy.High,distanceInterval:20,timeInterval:10000},position=>{void applyPosition(position,true);});
    })();
    return()=>{cancelled=true;subscription?.remove();};
  },[driver?.online,driver?.id,driver?.status]);

  useEffect(()=>{
    if(driver?.id&&driver.online&&driver.status==="ACTIVE")void resumeBackgroundTrackingIfAuthorized(driver.id);
    else void disableBackgroundTracking();
  },[driver?.id,driver?.online,driver?.status]);

  // CLICKFOOD_EXTERNAL_RELEASE_REFRESH: se Loja/Matriz concluir ou liberar a entrega por contingência,
  // o app deve abandonar a tela antiga automaticamente sem exigir ação do entregador.
  useEffect(()=>{
    if(!session?.user.id||!driver?.id||driver.status!=="ACTIVE")return;
    let cancelled=false;
    const refresh=async()=>{if(cancelled)return;try{await loadActive();}catch{}};
    void refresh();
    const timer=setInterval(()=>void refresh(),2500);
    const channel=supabase.channel(`driver-active-release-${driver.id}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"deliveries",filter:`driver_id=eq.${driver.id}`},()=>void refresh())
      .subscribe();
    return()=>{cancelled=true;clearInterval(timer);void supabase.removeChannel(channel);};
  },[session?.user.id,driver?.id,driver?.status]);


  useEffect(()=>{
    if(!session?.user.id||!driver?.id||driver.status!=="ACTIVE"||!driver.online||active){setOffer(null);return;}
    const userId=session.user.id;
    const driverId=driver.id;
    let cancelled=false;
    const refresh=async()=>{if(!cancelled)await loadOffers();};
    void refresh();
    const timer=setInterval(()=>void refresh(),3000);
    const channel=supabase.channel(`driver-offer-feed-${driverId}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications",filter:`user_id=eq.${userId}`},payload=>{
      const type=String((payload.new as any).notification_type??"");
      if(type!=="DRIVER_OFFER"&&type!=="DELIVERY_OFFER")return;
      Vibration.vibrate([0,300,120,300]);
      void refresh();
    }).subscribe();
    return()=>{cancelled=true;clearInterval(timer);void supabase.removeChannel(channel);};
  },[session?.user.id,driver?.id,driver?.online,driver?.status,active?.id]);

  useEffect(()=>{
    if(!session?.user.id||!driver?.id||driver.status!=="ACTIVE"||!driver.online)return;
    let cancelled=false;
    (async()=>{
      try{
        if(Platform.OS==="android")await Notifications.setNotificationChannelAsync("clickfood-chamadas",{name:"Chamadas CLICK-FOOD",description:"Novas chamadas de entrega",importance:Notifications.AndroidImportance.MAX,sound:"clickfood_chamada.wav",vibrationPattern:[0,300,120,300,120,450],lightColor:"#F4C400"});
        let permission=await Notifications.getPermissionsAsync();
        if(permission.status!=="granted")permission=await Notifications.requestPermissionsAsync();
        if(permission.status!=="granted"){if(!cancelled)setMessage("Ative as notificações do CLICK-FOOD para receber chamadas com o app minimizado.");return;}
        const projectId=Constants.expoConfig?.extra?.eas?.projectId??Constants.easConfig?.projectId;
        if(!projectId){if(!cancelled)setMessage("Não foi possível identificar o serviço de notificações.");return;}
        const token=(await Notifications.getExpoPushTokenAsync({projectId})).data;
        const platform:"ANDROID"|"IOS"|"UNKNOWN"=Platform.OS==="android"?"ANDROID":Platform.OS==="ios"?"IOS":"UNKNOWN";
        const {data,error}=await supabase.functions.invoke("register-push-token",{body:{token,app:"DRIVER",platform,appIdentifier:"br.com.clickfood.entregador"}});
        if((error||data?.error)&&!cancelled)setMessage("Não foi possível ativar as chamadas em segundo plano. Mantenha o app aberto e tente novamente.");
      }catch{if(!cancelled)setMessage("Não foi possível ativar as chamadas em segundo plano. Verifique as notificações do aparelho.");}
    })();
    return()=>{cancelled=true;};
  },[session?.user.id,driver?.id,driver?.online,driver?.status]);

  async function bootstrap(){setLoading(true);const [{data:cityData},{data:driverData}]=await Promise.all([supabase.from("cities").select("id,name,state").eq("active",true).order("name"),supabase.from("drivers").select("id,status,online,rating,acceptance_rate,city_id").maybeSingle()]);setCities(cityData??[]);if(driverData){setDriver({...driverData,rating:Number(driverData.rating),acceptance_rate:Number(driverData.acceptance_rate)} as Driver);await Promise.all([loadActive(),loadHistory(driverData.id),loadDriverLocation(driverData.id)]);}else{setDriver(null);setDriverLocation(null)}setLoading(false);}
  async function loadOffers(){const {data,error}=await supabase.functions.invoke("driver-offers",{body:{}});if(error||data?.error)return;const next=(data?.offers??[])[0] as Offer|undefined;setOffer(next??null);}
  async function loadActive(){const {data}=await supabase.functions.invoke("driver-active-delivery",{body:{}});const next=data?.delivery??null;setActive(next);if(!next)setMapOpen(false);}
  async function loadHistory(_driverId?:string){const {data,error}=await supabase.functions.invoke("driver-delivery-history",{body:{}});if(error||data?.error){setMessage("Não foi possível atualizar o histórico de entregas.");return;}setHistory((data?.history??[]) as HistoryItem[]);}
  async function loadDriverLocation(driverId:string){const {data}=await supabase.from("driver_locations").select("latitude,longitude,heading,recorded_at").eq("driver_id",driverId).maybeSingle();if(!data)return;setDriverLocation({latitude:Number(data.latitude),longitude:Number(data.longitude),heading:data.heading==null?null:Number(data.heading),recordedAt:String(data.recorded_at)});}
  async function toggleOnline(){
    if(!driver||statusBusy)return;
    const driverId=driver.id;
    const previous=driver.online;
    const next=!previous;
    setStatusBusy(true);
    setMessage(next?"Entrando ONLINE...":"Ficando OFFLINE...");
    setDriver(current=>current?.id===driverId?{...current,online:next}:current);
    try{
      const {data,error}=await supabase.functions.invoke("driver-status",{body:{online:next}});
      if(error||data?.error){
        setDriver(current=>current?.id===driverId?{...current,online:previous}:current);
        setMessage(data?.error==="ACTIVE_DELIVERY_PREVENTS_OFFLINE"?"Finalize a entrega atual antes de ficar OFFLINE.":"Não foi possível alterar seu status. Tente novamente.");
        return;
      }
      const {data:verified,error:verifyError}=await supabase.from("drivers").select("online").eq("id",driverId).maybeSingle();
      const confirmed=verifyError||!verified?Boolean(data?.driver?.online):Boolean(verified.online);
      setDriver(current=>current?.id===driverId?{...current,online:confirmed}:current);
      if(confirmed!==next){
        setMessage("O status não foi confirmado pelo servidor. Toque novamente.");
        return;
      }
      if(!confirmed){
        setOffer(null);
        await Promise.allSettled([disableBackgroundTracking(),stopFloatingBubble()]);
        setMessage("Você está OFFLINE. As novas chamadas foram pausadas.");
        return;
      }
      await loadOffers();
      setMessage("Você está ONLINE e disponível para receber chamadas.");
      Alert.alert(
        "Rastreamento durante entregas",
        "Para receber chamadas e manter o acompanhamento mesmo com a tela bloqueada, permita ao CLICK-FOOD usar sua localização em segundo plano enquanto você estiver online.",
        [
          {text:"AGORA NÃO",style:"cancel"},
          {text:"ATIVAR",onPress:async()=>{
            const enabled=await enableBackgroundTracking(driverId);
            setMessage(enabled?"Localização em segundo plano ativada enquanto você estiver ONLINE.":"A localização em segundo plano não foi autorizada. O app continuará atualizando sua posição enquanto estiver aberto.");
          }},
        ],
      );
    }finally{
      setStatusBusy(false);
    }
  }
  async function activateFloatingBubble(){
    if(!driver)return;
    setMessage("");
    if(Platform.OS!=="android"){setMessage("A bolinha flutuante está disponível no Android.");return;}
    if(!driver.online){setMessage("Fique ONLINE para ativar a bolinha flutuante.");return;}
    if(!hasFloatingBubbleNativeModule()){setMessage("A bolinha flutuante precisa do APK mais recente do CLICK-FOOD Entregador.");return;}
    if(await canUseFloatingBubble()){const started=await startFloatingBubble();setMessage(started?"Bolinha flutuante ativada.":"Não foi possível iniciar a bolinha flutuante.");return;}
    const granted=await requestFloatingBubblePermission();
    if(granted){const started=await startFloatingBubble();setMessage(started?"Bolinha flutuante ativada.":"Permissão concedida. Toque novamente em BOLINHA para iniciar.");}
    else setMessage("Autorize 'Aparecer sobre outros apps'. Ao voltar ao CLICK-FOOD, toque em BOLINHA novamente.");
  }
  async function acceptOffer(){if(!offer)return;const {data,error}=await supabase.functions.invoke("accept-delivery",{body:{offerId:offer.id}});if(error||data?.error){setMessage("Este chamado não está mais disponível.");setOffer(null);return;}setOffer(null);await loadActive();}
  async function rejectOffer(){if(!offer)return;await supabase.functions.invoke("reject-delivery",{body:{offerId:offer.id}});setOffer(null);}
  async function deliveryAction(action:string){if(!active)return;setMessage("");const body:any={deliveryId:active.id,action};if(action==="CONFIRM_PICKUP"||action==="CONFIRM_DELIVERY")body.code=code;const {data,error}=await supabase.functions.invoke("driver-delivery-action",{body});if(error||data?.error){setMessage(data?.error==="INVALID_DELIVERY_CODE"?"Código incorreto.":"Não foi possível atualizar a entrega.");return;}setCode("");await loadActive();if(action==="CONFIRM_DELIVERY"){await loadHistory();setMessage("Entrega concluída com sucesso.");}}
  async function reportDeliveryProblem(kind:"CUSTOMER_UNAVAILABLE"|"INCIDENT"){if(!active||incidentBusy)return;const reason=kind==="INCIDENT"?incidentReason.trim():incidentReason.trim()||"Cliente não localizado no endereço informado";if(kind==="INCIDENT"&&reason.length<5){setMessage("Descreva rapidamente o problema antes de enviar.");return;}setIncidentBusy(true);setMessage("");const action=kind==="INCIDENT"?"REPORT_INCIDENT":"REPORT_CUSTOMER_UNAVAILABLE";const{data,error}=await supabase.functions.invoke("driver-delivery-action",{body:{deliveryId:active.id,action,reason}});setIncidentBusy(false);if(error||data?.error){setMessage(data?.error==="CUSTOMER_UNAVAILABLE_REQUIRES_ARRIVAL"?"Confirme sua chegada ao cliente antes de informar que ele não foi localizado.":"Não foi possível acionar o suporte agora. Tente novamente.");return;}setIncidentModal(false);setIncidentReason("");await loadActive();setMessage(kind==="INCIDENT"?"Incidente registrado. O suporte e a loja foram avisados.":"Cliente não localizado. O suporte e a loja foram avisados.");}

  const completedTotal=useMemo(()=>history.reduce((sum,item)=>sum+item.driverEarning,0),[history]);
  const todayKey=new Date().toLocaleDateString("pt-BR");
  const todayTotal=useMemo(()=>history.filter(item=>item.deliveredAt&&new Date(item.deliveredAt).toLocaleDateString("pt-BR")===todayKey).reduce((sum,item)=>sum+item.driverEarning,0),[history,todayKey]);
  const earningsText=(value:number)=>earningsVisible?brl(value):"R$ ••••";
  if(loading)return<SafeAreaView style={styles.center}><Text style={styles.brand}><Text style={styles.yellow}>CLICK</Text>-FOOD</Text><Text>Carregando...</Text></SafeAreaView>;
  if(!session)return<AuthScreen/>;
  if(!driver)return<DriverRegistration cities={cities} onDone={bootstrap}/>;
  if(driver.status!=="ACTIVE")return<SafeAreaView style={styles.safe}><View style={styles.pending}><Text style={styles.brand}><Text style={styles.yellow}>CLICK</Text>-FOOD</Text><Text style={styles.pendingIcon}>⌛</Text><Text style={styles.pageTitle}>Cadastro em análise</Text><Text style={styles.pendingText}>Status: {driver.status}. Você poderá ficar online assim que a Matriz aprovar seus documentos e cadastro.</Text><Pressable style={styles.secondary} onPress={bootstrap}><Text style={styles.secondaryText}>ATUALIZAR STATUS</Text></Pressable><Pressable onPress={()=>supabase.auth.signOut()}><Text style={styles.switchText}>Sair</Text></Pressable><DeleteAccountButton/></View></SafeAreaView>;

  const nextAction=active?.status==="DRIVER_ASSIGNED"?["START_TO_STORE","IR PARA A LOJA"]:active?.status==="DRIVER_TO_STORE"?["ARRIVED_STORE","CONFIRMAR CHEGADA À LOJA"]:active?.status==="DRIVER_AT_STORE"?["CONFIRM_PICKUP","VALIDAR CÓDIGO DE RETIRADA"]:active?.status==="PICKUP_CONFIRMED"?["START_TO_CUSTOMER","INICIAR ENTREGA"]:active?.status==="DRIVER_TO_CUSTOMER"?["ARRIVED_CUSTOMER","CONFIRMAR CHEGADA AO CLIENTE"]:active?.status==="DRIVER_AT_CUSTOMER"?["CONFIRM_DELIVERY","VALIDAR CÓDIGO E CONCLUIR"]:null;
  const needsCode=nextAction?.[0]==="CONFIRM_PICKUP"||nextAction?.[0]==="CONFIRM_DELIVERY";

  const nextStepText=active?.status==="DRIVER_AT_CUSTOMER"?"Aguardando código do cliente para finalizar a entrega.":active?.status==="DRIVER_AT_STORE"?"Aguardando o código de retirada fornecido pela loja.":nextAction?.[1]??"Aguardando próxima atualização.";
  const codeButtonLabel=active?.status==="DRIVER_AT_CUSTOMER"?"JÁ TENHO O CÓDIGO":active?.status==="DRIVER_AT_STORE"?"DIGITAR CÓDIGO DE RETIRADA":null;
  const destinationLine=active?.destination?`${active.destination.street}, ${active.destination.number??"s/n"}${active.destination.district?` • ${active.destination.district}`:""}`:"Endereço será exibido quando a rota ao cliente for liberada.";

  const home=<View style={styles.mapHome}>
    <DriverLiveMap online={driver.online} location={driverLocation} active={active}/>
    <View style={styles.todayEarningsTop}><View style={{flex:1}}><Text style={styles.todayEarningsLabel}>GANHOS DE HOJE</Text><Text style={styles.todayEarningsValue}>{earningsText(todayTotal)}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={earningsVisible?"Ocultar ganhos":"Mostrar ganhos"} style={styles.earningsEyeOnly} onPress={()=>setEarningsVisible(value=>!value)}><Text style={styles.earningsEyeIcon}>👁️</Text></Pressable></View>
    <View style={styles.mapControlsDock}>
      {!!message&&<Text numberOfLines={2} style={styles.noticeCompact}>{message}</Text>}
      {active?<View style={styles.mapControlsContent}>
        <View style={styles.driverActiveCard}><View style={styles.driverActiveHeader}><View style={{flex:1}}><Text style={styles.driverActiveKicker}>Entrega em andamento</Text><Text style={styles.driverActiveOrder}>Pedido #{active.orderNumber}</Text></View><View style={styles.driverActiveStatusDot}/></View><Text numberOfLines={1} style={styles.driverStatusText}>{driverStatusLabel[active.status]??active.status}</Text><Text numberOfLines={2} style={styles.driverAddress}>{active.status.includes("STORE")||active.status==="DRIVER_ASSIGNED"?active.pickup.storeName:destinationLine}</Text></View>
        <View style={styles.nextStepCard}><Text style={styles.nextStepKicker}>Próxima etapa</Text><Text numberOfLines={2} style={styles.nextStepTitle}>{nextStepText}</Text>{needsCode&&<><Text style={styles.codePrompt}>{codeButtonLabel}</Text><TextInput style={styles.codeInput} placeholder="Código de 4 dígitos" placeholderTextColor="#777" keyboardType="number-pad" maxLength={4} value={code} onChangeText={setCode}/></>}{nextAction&&<Pressable style={styles.actionButton} onPress={()=>deliveryAction(nextAction[0])}><Text style={styles.actionText}>{needsCode&&codeButtonLabel?codeButtonLabel:nextAction[1]}</Text></Pressable>}{active.status==="DRIVER_AT_CUSTOMER"&&<Pressable style={styles.problemSecondary} onPress={()=>Alert.alert("Cliente não encontrado","Confirme apenas se você já está no endereço e tentou localizar o cliente.",[{text:"VOLTAR",style:"cancel"},{text:"CONFIRMAR",style:"destructive",onPress:()=>reportDeliveryProblem("CUSTOMER_UNAVAILABLE")}])}><Text style={styles.problemSecondaryText}>CLIENTE NÃO ENCONTRADO</Text></Pressable>}{["DRIVER_ASSIGNED","DRIVER_TO_STORE","DRIVER_AT_STORE","PICKUP_CONFIRMED","DRIVER_TO_CUSTOMER","DRIVER_AT_CUSTOMER","RETURN_REQUIRED"].includes(active.status)&&<Pressable style={styles.problemButton} onPress={()=>{setIncidentReason("");setIncidentModal(true)}}><Text style={styles.problemText}>REPORTAR PROBLEMA</Text></Pressable>}<Text style={styles.earning}>Ganho desta entrega: {earningsText(active.earning)}</Text></View>
      </View>:<View style={styles.idleMapCard}><View style={{flex:1}}><Text style={styles.idleHeroKicker}>{driver.online?"VOCÊ ESTÁ ONLINE":"VOCÊ ESTÁ OFFLINE"}</Text><Text style={styles.idleMapTitle}>{driver.online?"Aguardando entregas":"Fique online para começar"}</Text><Text style={styles.idleMapMeta}>{history.length} entregas • {driver.rating.toFixed(1)} ★</Text></View><Pressable disabled={statusBusy} style={[styles.mapOnlineButton,driver.online&&styles.mapOfflineButton,statusBusy&&styles.disabled]} onPress={toggleOnline}><Text style={[styles.mapOnlineText,driver.online&&styles.onlineTextOffline]}>{statusBusy?"ALTERANDO...":driver.online?"ONLINE":"OFFLINE"}</Text></Pressable></View>}
    </View>
  </View>;

  const historyView=<ScrollView contentContainerStyle={styles.content}><View style={styles.rowBetween}><View><Text style={styles.pageTitle}>Minhas entregas</Text><Text style={styles.listMeta}>{history.length} entrega(s) no histórico • {earningsText(completedTotal)} em ganhos</Text></View><Pressable onPress={()=>loadHistory()}><Text style={styles.link}>Atualizar</Text></Pressable></View>{history.length?history.map(item=><View style={styles.listRow} key={item.id}><View style={{flex:1}}><Text style={styles.listTitle}>{item.orderNumber!=null?`Pedido #${item.orderNumber}`:"Entrega concluída"} • {item.storeName}</Text><Text style={styles.listMeta}>{item.deliveredAt?new Date(item.deliveredAt).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}):"Concluída"}{item.durationMinutes!=null?` • ${item.durationMinutes} min`:""} • taxa {brl(item.deliveryFee)}</Text></View><Text style={styles.listValue}>+ {earningsText(item.driverEarning)}</Text></View>):<Text style={styles.notice}>Nenhuma entrega concluída ainda.</Text>}</ScrollView>;
  const wallet=<ScrollView contentContainerStyle={styles.content}><Text style={styles.pageTitle}>Ganhos e repasses</Text><DriverWallet/></ScrollView>;
  const profile=<ScrollView contentContainerStyle={styles.content}><Text style={styles.pageTitle}>Minha conta</Text><View style={styles.profileCard}><Text style={styles.listTitle}>{session.user.user_metadata?.full_name??"Entregador CLICK-FOOD"}</Text><Text style={styles.listMeta}>{session.user.email}</Text><Text style={styles.listMeta}>Status: {driver.status}</Text></View><DeleteAccountButton/><Pressable style={styles.secondary} onPress={()=>supabase.auth.signOut()}><Text style={styles.secondaryText}>SAIR</Text></Pressable></ScrollView>;
  const current=screen==="home"?home:screen==="history"?historyView:screen==="wallet"?wallet:profile;
  const tabs:Array<[Screen,string,string]>=[["home","⌂","Entregas"],["history","▤","Histórico"],["wallet","▣","Carteira"],["profile","○","Perfil"]];
  return<SafeAreaView style={styles.safe}><StatusBar barStyle="light-content" backgroundColor="#0d0d0d"/><View style={styles.flex}>{current}</View><Modal visible={mapOpen&&!!active} animationType="slide" onRequestClose={()=>setMapOpen(false)}><SafeAreaView style={styles.mapModalSafe}><View style={styles.mapModalHeader}><View style={{flex:1}}><Text style={styles.mapModalKicker}>CLICK-FOOD ENTREGADOR</Text><Text style={styles.mapModalTitle}>Mapa da entrega</Text></View><Pressable style={styles.mapModalClose} onPress={()=>setMapOpen(false)}><Text style={styles.mapModalCloseText}>FECHAR</Text></Pressable></View><View style={styles.mapModalBody}><DriverLiveMap online={driver.online} location={driverLocation} active={active}/></View></SafeAreaView></Modal><View style={styles.bottom}>{tabs.map(([key,icon,label])=><Pressable key={key} onPress={()=>setScreen(key)} style={styles.tab}><Text style={[styles.tabIcon,screen===key&&styles.tabActive]}>{icon}</Text><Text style={[styles.tabText,screen===key&&styles.tabActive]}>{label}</Text></Pressable>)}</View><Modal visible={!!offer} transparent animationType="fade"><View style={styles.modalBackdrop}>{offer&&<View style={styles.offerCard}><View style={styles.offerHeader}><Text style={styles.offerLabel}>NOVA ENTREGA</Text><Text style={styles.timerText}>{Math.max(0,Math.ceil((new Date(offer.expiresAt).getTime()-Date.now())/1000))}s</Text></View><Text style={styles.offerStore}>{offer.storeName}</Text><View style={styles.offerRoute}><View><Text style={styles.offerSmall}>ATÉ A LOJA</Text><Text style={styles.offerBig}>{offer.pickupDistanceKm==null?"—":`${offer.pickupDistanceKm.toFixed(1)} km`}</Text></View><Text style={styles.arrow}>→</Text><View><Text style={styles.offerSmall}>ENTREGA</Text><Text style={styles.offerBig}>{offer.deliveryDistanceKm==null?"—":`${offer.deliveryDistanceKm.toFixed(1)} km`}</Text></View></View><Text style={styles.offerSmall}>SEU GANHO</Text><Text style={styles.offerAmount}>{earningsText(offer.earning)}</Text><View style={styles.offerActions}><Pressable style={styles.reject} onPress={rejectOffer}><Text style={styles.rejectText}>RECUSAR</Text></Pressable><Pressable style={styles.accept} onPress={acceptOffer}><Text style={styles.acceptText}>ACEITAR</Text></Pressable></View></View>}</View></Modal><Modal visible={incidentModal} transparent animationType="fade" onRequestClose={()=>!incidentBusy&&setIncidentModal(false)}><View style={styles.modalBackdrop}><View style={styles.incidentCard}><Text style={styles.incidentTitle}>Reportar problema</Text><Text style={styles.incidentHint}>Descreva o que aconteceu. O suporte e a loja receberão o chamado.</Text><TextInput style={styles.incidentInput} placeholder="Ex.: pneu furou, acidente, problema no pedido..." multiline value={incidentReason} onChangeText={setIncidentReason}/><View style={styles.offerActions}><Pressable style={styles.reject} disabled={incidentBusy} onPress={()=>setIncidentModal(false)}><Text style={styles.rejectText}>VOLTAR</Text></Pressable><Pressable style={[styles.accept,incidentBusy&&styles.disabled]} disabled={incidentBusy} onPress={()=>reportDeliveryProblem("INCIDENT")}><Text style={styles.acceptText}>{incidentBusy?"ENVIANDO...":"ENVIAR"}</Text></Pressable></View></View></View></Modal></SafeAreaView>;
}

const styles=StyleSheet.create({floatingBubbleButton:{position:"absolute",top:122,right:10,zIndex:31,elevation:10,backgroundColor:"rgba(17,17,17,0.96)",borderWidth:2,borderColor:"#f4c400",borderRadius:22,paddingVertical:8,paddingHorizontal:11,flexDirection:"row",alignItems:"center",gap:6},floatingBubbleDot:{color:"#f4c400",fontSize:20,lineHeight:20},floatingBubbleText:{color:"#fff",fontSize:9,fontWeight:"900",letterSpacing:.6},earningsEyeButton:{position:"absolute",top:78,left:10,zIndex:30,elevation:9,backgroundColor:"rgba(17,17,17,0.94)",borderWidth:1,borderColor:"#f4c400",borderRadius:20,paddingVertical:7,paddingHorizontal:10,flexDirection:"row",alignItems:"center",gap:6},earningsEyeIcon:{fontSize:15},earningsEyeText:{color:"#f4c400",fontSize:8,fontWeight:"900",letterSpacing:.5},problemButton:{borderWidth:1,borderColor:"#8f3d36",paddingVertical:8,paddingHorizontal:10,borderRadius:10,alignItems:"center",marginTop:6,backgroundColor:"#1b1010"},problemText:{fontWeight:"900",color:"#ff9f96",fontSize:10},problemSecondary:{borderWidth:1,borderColor:"#7b6712",paddingVertical:8,paddingHorizontal:10,borderRadius:10,alignItems:"center",marginTop:6,backgroundColor:"#211d0b"},problemSecondaryText:{fontWeight:"900",color:"#f4c400",fontSize:10},supportActive:{backgroundColor:"#211d0b",color:"#f4c400",padding:10,borderRadius:10,marginTop:10,fontWeight:"800",fontSize:10},incidentCard:{backgroundColor:"#fff",borderRadius:22,padding:20,width:"90%",maxWidth:460},incidentTitle:{fontSize:22,fontWeight:"900"},incidentHint:{color:"#666",fontSize:12,lineHeight:17,marginTop:6,marginBottom:12},incidentInput:{minHeight:100,borderWidth:1,borderColor:"#ddd",borderRadius:13,padding:12,textAlignVertical:"top",marginBottom:4},safe:{flex:1,backgroundColor:"#0d0d0d"},flex:{flex:1},mapHome:{flex:1,backgroundColor:"#111",overflow:"hidden"},mapControlsDock:{position:"absolute",left:0,right:0,bottom:0,paddingHorizontal:10,paddingTop:8,paddingBottom:8,justifyContent:"flex-end"},mapControlsScroll:{maxHeight:330},mapControlsContent:{gap:8},idleMapCard:{backgroundColor:"rgba(17,17,17,0.94)",borderWidth:1,borderColor:"#343434",borderRadius:16,paddingVertical:11,paddingHorizontal:12,flexDirection:"row",alignItems:"center",gap:10},idleMapTitle:{fontSize:16,color:"#fff",fontWeight:"900",marginTop:4},idleMapMeta:{fontSize:9,color:"#aaa",marginTop:4},mapOnlineButton:{backgroundColor:"#d83b32",borderRadius:12,paddingVertical:11,paddingHorizontal:14,borderWidth:1,borderColor:"#a92620"},mapOfflineButton:{backgroundColor:"#20a85a",borderWidth:1,borderColor:"#15743e"},mapOnlineText:{fontSize:10,fontWeight:"900",color:"#fff"},center:{flex:1,alignItems:"center",justifyContent:"center",gap:10},content:{paddingHorizontal:14,paddingTop:12,paddingBottom:30,backgroundColor:"#0d0d0d",flexGrow:1},authWrap:{flexGrow:1,justifyContent:"center",padding:26},brand:{fontSize:24,fontWeight:"900"},yellow:{color:"#f4c400"},subtitle:{fontSize:9,fontWeight:"900",letterSpacing:2,color:"#777",marginTop:3},authTitle:{fontSize:30,fontWeight:"900",marginVertical:22},pageTitle:{fontSize:28,fontWeight:"900",marginBottom:20},input:{backgroundColor:"#fff",borderWidth:1,borderColor:"#ddd",borderRadius:14,padding:14,marginBottom:10},label:{fontSize:12,fontWeight:"900",marginTop:12,marginBottom:8},notice:{backgroundColor:"#2b250c",color:"#f4c400",padding:11,borderRadius:11,marginVertical:8,borderWidth:1,borderColor:"#5b4b00"},noticeCompact:{backgroundColor:"rgba(43,37,12,0.96)",color:"#f4c400",paddingVertical:7,paddingHorizontal:10,borderRadius:10,marginBottom:6,borderWidth:1,borderColor:"#5b4b00",fontSize:10,lineHeight:13},primary:{backgroundColor:"#111",padding:15,borderRadius:14,alignItems:"center",marginTop:8},primaryText:{color:"#fff",fontWeight:"900"},disabled:{opacity:.5},switchText:{textAlign:"center",color:"#8e7000",fontWeight:"800",padding:18},choices:{marginBottom:12},choiceRow:{flexDirection:"row",gap:8,marginBottom:14},chip:{borderWidth:1,borderColor:"#ddd",backgroundColor:"#fff",paddingVertical:9,paddingHorizontal:12,borderRadius:20,marginRight:8},chipActive:{backgroundColor:"#111",borderColor:"#111"},chipText:{fontSize:11,fontWeight:"700"},chipTextActive:{fontSize:11,fontWeight:"800",color:"#fff"},pending:{flex:1,justifyContent:"center",alignItems:"center",padding:28},pendingIcon:{fontSize:55,marginVertical:18},pendingText:{textAlign:"center",color:"#666",lineHeight:20},secondary:{borderWidth:1,borderColor:"#ddd",backgroundColor:"#fff",padding:14,borderRadius:14,alignItems:"center",marginTop:18},secondaryText:{fontWeight:"900"},header:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:20},dot:{width:12,height:12,borderRadius:6,backgroundColor:"#bbb"},dotOnline:{backgroundColor:"#21a366"},earningsCard:{backgroundColor:"#151515",borderRadius:17,padding:17,borderWidth:1,borderColor:"#292929",marginTop:12},earningsLabel:{fontSize:9,fontWeight:"900",letterSpacing:1,color:"#a5a5a5"},earningsValue:{fontSize:30,fontWeight:"900",color:"#fff",marginTop:5},stats:{flexDirection:"row",justifyContent:"space-between",marginTop:20},statValue:{color:"#fff",fontSize:16,fontWeight:"900"},statLabel:{color:"#8d8d8d",fontSize:10,marginTop:3},onlineButton:{backgroundColor:"#f4c400",paddingVertical:16,borderRadius:13,alignItems:"center",marginTop:13},offlineButton:{backgroundColor:"#171717",borderWidth:1,borderColor:"#444"},onlineText:{fontWeight:"900",fontSize:12,color:"#111"},map:{height:220,borderRadius:22,backgroundColor:"#e8e8e8",marginTop:18,alignItems:"center",justifyContent:"center",padding:20},mapTitle:{fontSize:16,fontWeight:"900"},mapEmoji:{fontSize:45,marginVertical:18},mapText:{fontSize:12,color:"#666",textAlign:"center"},deliveryCard:{backgroundColor:"#fff",borderRadius:18,padding:16,marginTop:14,borderWidth:1,borderColor:"#e8e8e8"},mapActionButton:{backgroundColor:"#f4c400",borderRadius:10,paddingVertical:14,alignItems:"center",marginTop:15},mapActionText:{color:"#111",fontWeight:"900",fontSize:10},mapModalSafe:{flex:1,backgroundColor:"#111"},mapModalHeader:{paddingHorizontal:16,paddingVertical:12,backgroundColor:"#111",flexDirection:"row",alignItems:"center",gap:12},mapModalKicker:{color:"#f4c400",fontSize:9,fontWeight:"900",letterSpacing:1.2},mapModalTitle:{color:"#fff",fontSize:20,fontWeight:"900",marginTop:2},mapModalClose:{backgroundColor:"#f4c400",borderRadius:11,paddingVertical:10,paddingHorizontal:13},mapModalCloseText:{fontSize:9,fontWeight:"900",color:"#111"},mapModalBody:{flex:1},deliveryBadge:{fontSize:10,fontWeight:"900",color:"#a27e00"},deliveryTitle:{fontSize:20,fontWeight:"900",marginTop:7},deliveryMeta:{color:"#666",fontSize:12,marginVertical:8},address:{fontSize:13,fontWeight:"800",marginVertical:8},codePrompt:{fontSize:10,color:"#f4c400",fontWeight:"900",marginTop:14,marginBottom:2},codeInput:{borderWidth:1,borderColor:"#555",backgroundColor:"#0b0b0b",color:"#fff",borderRadius:10,paddingVertical:8,paddingHorizontal:10,fontSize:18,textAlign:"center",letterSpacing:6,marginTop:5},actionButton:{backgroundColor:"#f4c400",paddingVertical:10,borderRadius:10,alignItems:"center",marginTop:7},actionText:{fontWeight:"900",fontSize:10,color:"#111"},earning:{textAlign:"center",color:"#74d99a",fontWeight:"900",marginTop:7,fontSize:10},rowBetween:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},link:{color:"#9c7900",fontWeight:"900"},listRow:{backgroundColor:"#fff",borderRadius:16,padding:16,marginBottom:9,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},listTitle:{fontWeight:"800"},listMeta:{fontSize:11,color:"#777",marginTop:4},listValue:{fontWeight:"900",color:"#16784b"},profileCard:{backgroundColor:"#fff",padding:18,borderRadius:18},bottom:{minHeight:92,backgroundColor:"#101010",borderTopWidth:1,borderTopColor:"#2a2a2a",flexDirection:"row",paddingTop:7,paddingBottom:8,elevation:16},tab:{flex:1,minHeight:70,alignItems:"center",justifyContent:"center",paddingHorizontal:2},tabIcon:{fontSize:32,lineHeight:36,minWidth:36,textAlign:"center",color:"#8b8b8b"},tabText:{fontSize:11,fontWeight:"800",color:"#999",marginTop:2},tabActive:{color:"#f4c400",fontWeight:"900"},modalBackdrop:{flex:1,backgroundColor:"rgba(0,0,0,.65)",justifyContent:"center",padding:20},offerCard:{backgroundColor:"#fff",borderRadius:26,padding:22},offerHeader:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},offerLabel:{fontSize:12,fontWeight:"900",letterSpacing:1},timerText:{backgroundColor:"#111",color:"#f4c400",fontWeight:"900",padding:11,borderRadius:22},offerStore:{fontSize:27,fontWeight:"900",marginTop:18},offerRoute:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",backgroundColor:"#f4f4f4",borderRadius:18,padding:16,marginVertical:16},offerSmall:{fontSize:9,fontWeight:"900",color:"#777"},offerBig:{fontSize:18,fontWeight:"900",marginTop:3},arrow:{fontSize:25,color:"#999"},offerAmount:{fontSize:31,fontWeight:"900",color:"#16784b",marginTop:3},offerActions:{flexDirection:"row",gap:10,marginTop:20},reject:{flex:1,borderWidth:1,borderColor:"#ddd",paddingVertical:16,borderRadius:14,alignItems:"center"},rejectText:{fontWeight:"900",color:"#555"},accept:{flex:1,backgroundColor:"#f4c400",paddingVertical:16,borderRadius:14,alignItems:"center"},acceptText:{fontWeight:"900"},
  onlineTextOffline:{color:"#fff"},
  idleHero:{backgroundColor:"#151515",borderRadius:18,padding:18,borderWidth:1,borderColor:"#292929"},
  idleHeroKicker:{fontSize:9,fontWeight:"900",letterSpacing:1.1,color:"#f4c400"},
  idleHeroTitle:{fontSize:23,fontWeight:"900",color:"#fff",marginTop:7},
  idleHeroText:{fontSize:11,color:"#aaa",lineHeight:17,marginTop:6},
  driverActiveCard:{backgroundColor:"rgba(21,21,21,0.96)",borderRadius:15,paddingVertical:10,paddingHorizontal:12,borderWidth:1,borderColor:"#343434"},
  driverActiveHeader:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  driverActiveKicker:{fontSize:9,color:"#ddd",fontWeight:"800"},
  driverActiveOrder:{fontSize:16,color:"#fff",fontWeight:"900",marginTop:2},
  driverActiveStatusDot:{width:12,height:12,borderRadius:6,backgroundColor:"#39c872",shadowColor:"#39c872",shadowOpacity:.5,shadowRadius:5},
  driverDivider:{height:1,backgroundColor:"#343434",marginVertical:13},
  driverFieldLabel:{fontSize:9,color:"#a4a4a4",fontWeight:"800",textTransform:"uppercase"},
  driverFieldValue:{fontSize:16,color:"#fff",fontWeight:"900",marginTop:5},
  driverAddress:{fontSize:12,color:"#fff",fontWeight:"800",lineHeight:16,marginTop:3},
  driverStatusText:{fontSize:9,color:"#f4c400",fontWeight:"900",marginTop:5},
  nextStepCard:{backgroundColor:"rgba(16,16,16,0.97)",borderRadius:15,paddingVertical:10,paddingHorizontal:12,borderWidth:1,borderColor:"#252525"},
  nextStepKicker:{fontSize:9,color:"#aaa",fontWeight:"900"},
  nextStepTitle:{fontSize:12,color:"#fff",fontWeight:"800",lineHeight:16,marginTop:3},
  todayEarningsTop:{position:"absolute",top:78,left:10,zIndex:30,elevation:9,minWidth:170,maxWidth:220,backgroundColor:"rgba(17,17,17,0.95)",borderWidth:1,borderColor:"#f4c400",borderRadius:14,paddingVertical:8,paddingLeft:11,paddingRight:7,flexDirection:"row",alignItems:"center",gap:8},
  todayEarningsLabel:{fontSize:8,color:"#aaa",fontWeight:"900",letterSpacing:.8},
  todayEarningsValue:{fontSize:18,color:"#fff",fontWeight:"900",marginTop:2},
  earningsEyeOnly:{width:32,height:32,borderRadius:16,alignItems:"center",justifyContent:"center",backgroundColor:"#272727"},
});