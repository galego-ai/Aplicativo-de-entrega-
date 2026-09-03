import React, { useEffect, useMemo, useState } from "react";
import {
  Alert, Modal, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Vibration,
  Text, TextInput, View,
} from "react-native";
import * as Location from "expo-location";
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
  const [driverLocation,setDriverLocation]=useState<DriverLocation|null>(null); const [mapOpen,setMapOpen]=useState(false);

  useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)});const {data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>data.subscription.unsubscribe();},[]);
  useEffect(()=>{if(session) bootstrap(); else {setDriver(null);setActive(null);setOffer(null);setDriverLocation(null)}},[session]);
  useEffect(()=>{if(!driver?.online||driver.status!=="ACTIVE") return; const timer=setInterval(()=>{loadOffers();loadActive();},6000);loadOffers();loadActive();return()=>clearInterval(timer);},[driver?.online,driver?.status]);
  useEffect(()=>{if(!offer){Vibration.cancel();return;}Vibration.vibrate([0,650,350,650,350,950],true);return()=>Vibration.cancel();},[offer?.id]);
  useEffect(()=>{if(!driver?.online||driver.status!=="ACTIVE") return; let subscription:Location.LocationSubscription|undefined; (async()=>{const permission=await Location.requestForegroundPermissionsAsync();if(permission.status!=="granted"){setMessage("Ative a localização para receber entregas próximas.");return;}subscription=await Location.watchPositionAsync({accuracy:Location.Accuracy.High,distanceInterval:20,timeInterval:10000},async position=>{const recordedAt=new Date(position.timestamp||Date.now()).toISOString();setDriverLocation({latitude:position.coords.latitude,longitude:position.coords.longitude,heading:position.coords.heading,recordedAt});await supabase.from("driver_locations").upsert({driver_id:driver.id,latitude:position.coords.latitude,longitude:position.coords.longitude,heading:position.coords.heading,speed:position.coords.speed,accuracy:position.coords.accuracy,recorded_at:recordedAt},{onConflict:"driver_id"});});})();return()=>subscription?.remove();},[driver?.online,driver?.id,driver?.status]);

  useEffect(()=>{
    if(driver?.id&&driver.online&&driver.status==="ACTIVE")void resumeBackgroundTrackingIfAuthorized(driver.id);
    else void disableBackgroundTracking();
  },[driver?.id,driver?.online,driver?.status]);

  async function bootstrap(){setLoading(true);const [{data:cityData},{data:driverData}]=await Promise.all([supabase.from("cities").select("id,name,state").eq("active",true).order("name"),supabase.from("drivers").select("id,status,online,rating,acceptance_rate,city_id").maybeSingle()]);setCities(cityData??[]);if(driverData){setDriver({...driverData,rating:Number(driverData.rating),acceptance_rate:Number(driverData.acceptance_rate)} as Driver);await Promise.all([loadActive(),loadHistory(driverData.id),loadDriverLocation(driverData.id)]);}else{setDriver(null);setDriverLocation(null)}setLoading(false);}
  async function loadOffers(){const {data}=await supabase.functions.invoke("driver-offers",{body:{}});const next=(data?.offers??[])[0] as Offer|undefined;setOffer(next??null);}
  async function loadActive(){const {data}=await supabase.functions.invoke("driver-active-delivery",{body:{}});const next=data?.delivery??null;setActive(next);if(!next)setMapOpen(false);}
  async function loadHistory(_driverId?:string){const {data,error}=await supabase.functions.invoke("driver-delivery-history",{body:{}});if(error||data?.error){setMessage("Não foi possível atualizar o histórico de entregas.");return;}setHistory((data?.history??[]) as HistoryItem[]);}
  async function loadDriverLocation(driverId:string){const {data}=await supabase.from("driver_locations").select("latitude,longitude,heading,recorded_at").eq("driver_id",driverId).maybeSingle();if(!data)return;setDriverLocation({latitude:Number(data.latitude),longitude:Number(data.longitude),heading:data.heading==null?null:Number(data.heading),recordedAt:String(data.recorded_at)});}
  async function toggleOnline(){
    if(!driver)return;
    setMessage("");
    const next=!driver.online;
    const {data,error}=await supabase.functions.invoke("driver-status",{body:{online:next}});
    if(error||data?.error){
      setMessage(data?.error==="ACTIVE_DELIVERY_PREVENTS_OFFLINE"?"Finalize a entrega atual antes de ficar offline.":"Não foi possível alterar seu status.");
      return;
    }
    setDriver({...driver,online:Boolean(data.driver.online)});
    if(!next){
      await disableBackgroundTracking();
      return;
    }
    await loadOffers();
    Alert.alert(
      "Rastreamento durante entregas",
      "Para receber chamadas e manter o acompanhamento mesmo com a tela bloqueada, permita ao CLICK-FOOD usar sua localização em segundo plano enquanto você estiver online.",
      [
        {text:"AGORA NÃO",style:"cancel"},
        {text:"ATIVAR",onPress:async()=>{
          const enabled=await enableBackgroundTracking(driver.id);
          setMessage(enabled?"Localização em segundo plano ativada enquanto você estiver online.":"A localização em segundo plano não foi autorizada. O app continuará atualizando sua posição enquanto estiver aberto.");
        }},
      ],
    );
  }
  async function acceptOffer(){if(!offer)return;const {data,error}=await supabase.functions.invoke("accept-delivery",{body:{offerId:offer.id}});if(error||data?.error){setMessage("Este chamado não está mais disponível.");setOffer(null);return;}setOffer(null);await loadActive();}
  async function rejectOffer(){if(!offer)return;await supabase.functions.invoke("reject-delivery",{body:{offerId:offer.id}});setOffer(null);}
  async function deliveryAction(action:string){if(!active)return;setMessage("");const body:any={deliveryId:active.id,action};if(action==="CONFIRM_PICKUP"||action==="CONFIRM_DELIVERY")body.code=code;const {data,error}=await supabase.functions.invoke("driver-delivery-action",{body});if(error||data?.error){setMessage(data?.error==="INVALID_DELIVERY_CODE"?"Código incorreto.":"Não foi possível atualizar a entrega.");return;}setCode("");await loadActive();if(action==="CONFIRM_DELIVERY"){await loadHistory();setMessage("Entrega concluída com sucesso.");}}
  async function reportDeliveryProblem(kind:"CUSTOMER_UNAVAILABLE"|"INCIDENT"){if(!active||incidentBusy)return;const reason=kind==="INCIDENT"?incidentReason.trim():incidentReason.trim()||"Cliente não localizado no endereço informado";if(kind==="INCIDENT"&&reason.length<5){setMessage("Descreva rapidamente o problema antes de enviar.");return;}setIncidentBusy(true);setMessage("");const action=kind==="INCIDENT"?"REPORT_INCIDENT":"REPORT_CUSTOMER_UNAVAILABLE";const{data,error}=await supabase.functions.invoke("driver-delivery-action",{body:{deliveryId:active.id,action,reason}});setIncidentBusy(false);if(error||data?.error){setMessage(data?.error==="CUSTOMER_UNAVAILABLE_REQUIRES_ARRIVAL"?"Confirme sua chegada ao cliente antes de informar que ele não foi localizado.":"Não foi possível acionar o suporte agora. Tente novamente.");return;}setIncidentModal(false);setIncidentReason("");await loadActive();setMessage(kind==="INCIDENT"?"Incidente registrado. O suporte e a loja foram avisados.":"Cliente não localizado. O suporte e a loja foram avisados.");}

  const completedTotal=useMemo(()=>history.reduce((sum,item)=>sum+item.driverEarning,0),[history]);
  if(loading)return<SafeAreaView style={styles.center}><Text style={styles.brand}><Text style={styles.yellow}>CLICK</Text>-FOOD</Text><Text>Carregando...</Text></SafeAreaView>;
  if(!session)return<AuthScreen/>;
  if(!driver)return<DriverRegistration cities={cities} onDone={bootstrap}/>;
  if(driver.status!=="ACTIVE")return<SafeAreaView style={styles.safe}><View style={styles.pending}><Text style={styles.brand}><Text style={styles.yellow}>CLICK</Text>-FOOD</Text><Text style={styles.pendingIcon}>⌛</Text><Text style={styles.pageTitle}>Cadastro em análise</Text><Text style={styles.pendingText}>Status: {driver.status}. Você poderá ficar online assim que a Matriz aprovar seus documentos e cadastro.</Text><Pressable style={styles.secondary} onPress={bootstrap}><Text style={styles.secondaryText}>ATUALIZAR STATUS</Text></Pressable><Pressable onPress={()=>supabase.auth.signOut()}><Text style={styles.switchText}>Sair</Text></Pressable><DeleteAccountButton/></View></SafeAreaView>;

  const nextAction=active?.status==="DRIVER_ASSIGNED"?["START_TO_STORE","IR PARA A LOJA"]:active?.status==="DRIVER_TO_STORE"?["ARRIVED_STORE","CONFIRMAR CHEGADA À LOJA"]:active?.status==="DRIVER_AT_STORE"?["CONFIRM_PICKUP","VALIDAR CÓDIGO DE RETIRADA"]:active?.status==="PICKUP_CONFIRMED"?["START_TO_CUSTOMER","INICIAR ENTREGA"]:active?.status==="DRIVER_TO_CUSTOMER"?["ARRIVED_CUSTOMER","CONFIRMAR CHEGADA AO CLIENTE"]:active?.status==="DRIVER_AT_CUSTOMER"?["CONFIRM_DELIVERY","VALIDAR CÓDIGO E CONCLUIR"]:null;
  const needsCode=nextAction?.[0]==="CONFIRM_PICKUP"||nextAction?.[0]==="CONFIRM_DELIVERY";

  const home=<ScrollView contentContainerStyle={styles.content}><View style={styles.header}><View><Text style={styles.brand}><Text style={styles.yellow}>CLICK</Text>-FOOD</Text><Text style={styles.subtitle}>ENTREGADOR</Text></View><View style={[styles.dot,driver.online&&styles.dotOnline]}/></View>
    <View style={styles.earningsCard}><Text style={styles.earningsLabel}>GANHOS CONCLUÍDOS</Text><Text style={styles.earningsValue}>{brl(completedTotal)}</Text><View style={styles.stats}><View><Text style={styles.statValue}>{history.length}</Text><Text style={styles.statLabel}>entregas</Text></View><View><Text style={styles.statValue}>{driver.rating.toFixed(1)} ★</Text><Text style={styles.statLabel}>avaliação</Text></View><View><Text style={styles.statValue}>{Math.round(driver.acceptance_rate)}%</Text><Text style={styles.statLabel}>aceitação</Text></View></View></View>
    {!!message&&<Text style={styles.notice}>{message}</Text>}<Pressable style={[styles.onlineButton,driver.online&&styles.offlineButton]} onPress={toggleOnline}><Text style={styles.onlineText}>{driver.online?"FICAR OFFLINE":"FICAR ONLINE"}</Text></Pressable>
    {active&&<View style={styles.deliveryCard}><Text style={styles.deliveryBadge}>PEDIDO #{active.orderNumber}</Text><Text style={styles.deliveryTitle}>{active.status.includes("CUSTOMER")||active.status==="PICKUP_CONFIRMED"?"Entrega ao cliente":active.pickup.storeName}</Text><Text style={styles.deliveryMeta}>Status: {active.status}</Text>{active.destination&&active.status!=="DRIVER_ASSIGNED"&&active.status!=="DRIVER_TO_STORE"&&active.status!=="DRIVER_AT_STORE"&&<Text style={styles.address}>{active.destination.street}, {active.destination.number??"s/n"}{active.destination.district?` • ${active.destination.district}`:""}</Text>}{active&&<Pressable style={styles.mapActionButton} onPress={()=>setMapOpen(true)}><Text style={styles.mapActionText}>⌖ VER MAPA / ROTA</Text></Pressable>}{needsCode&&<TextInput style={styles.codeInput} placeholder="Código de 4 dígitos" keyboardType="number-pad" maxLength={4} value={code} onChangeText={setCode}/>} {nextAction&&<Pressable style={styles.actionButton} onPress={()=>deliveryAction(nextAction[0])}><Text style={styles.actionText}>{nextAction[1]}</Text></Pressable>}{active.status==="DRIVER_AT_CUSTOMER"&&<Pressable style={styles.problemSecondary} onPress={()=>Alert.alert("Cliente não encontrado","Confirme apenas se você já está no endereço e tentou localizar o cliente.",[{text:"VOLTAR",style:"cancel"},{text:"CONFIRMAR",style:"destructive",onPress:()=>reportDeliveryProblem("CUSTOMER_UNAVAILABLE")}])}><Text style={styles.problemSecondaryText}>CLIENTE NÃO ENCONTRADO</Text></Pressable>}{["DRIVER_ASSIGNED","DRIVER_TO_STORE","DRIVER_AT_STORE","PICKUP_CONFIRMED","DRIVER_TO_CUSTOMER","DRIVER_AT_CUSTOMER","RETURN_REQUIRED"].includes(active.status)&&<Pressable style={styles.problemButton} onPress={()=>{setIncidentReason("");setIncidentModal(true)}}><Text style={styles.problemText}>REPORTAR PROBLEMA</Text></Pressable>}{["CUSTOMER_UNAVAILABLE","INCIDENT","RETURN_REQUIRED"].includes(active.status)&&<Text style={styles.supportActive}>Suporte acionado. Aguarde orientação no aplicativo.</Text>}<Text style={styles.earning}>Ganho desta entrega: {brl(active.earning)}</Text></View>}
  </ScrollView>;

  const historyView=<ScrollView contentContainerStyle={styles.content}><View style={styles.rowBetween}><View><Text style={styles.pageTitle}>Minhas entregas</Text><Text style={styles.listMeta}>{history.length} entrega(s) no histórico • {brl(completedTotal)} em ganhos</Text></View><Pressable onPress={()=>loadHistory()}><Text style={styles.link}>Atualizar</Text></Pressable></View>{history.length?history.map(item=><View style={styles.listRow} key={item.id}><View style={{flex:1}}><Text style={styles.listTitle}>{item.orderNumber!=null?`Pedido #${item.orderNumber}`:"Entrega concluída"} • {item.storeName}</Text><Text style={styles.listMeta}>{item.deliveredAt?new Date(item.deliveredAt).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}):"Concluída"}{item.durationMinutes!=null?` • ${item.durationMinutes} min`:""} • taxa {brl(item.deliveryFee)}</Text></View><Text style={styles.listValue}>+ {brl(item.driverEarning)}</Text></View>):<Text style={styles.notice}>Nenhuma entrega concluída ainda.</Text>}</ScrollView>;
  const wallet=<ScrollView contentContainerStyle={styles.content}><Text style={styles.pageTitle}>Ganhos e repasses</Text><DriverWallet/></ScrollView>;
  const profile=<ScrollView contentContainerStyle={styles.content}><Text style={styles.pageTitle}>Minha conta</Text><View style={styles.profileCard}><Text style={styles.listTitle}>{session.user.user_metadata?.full_name??"Entregador CLICK-FOOD"}</Text><Text style={styles.listMeta}>{session.user.email}</Text><Text style={styles.listMeta}>Status: {driver.status}</Text></View><DeleteAccountButton/><Pressable style={styles.secondary} onPress={()=>supabase.auth.signOut()}><Text style={styles.secondaryText}>SAIR</Text></Pressable></ScrollView>;
  const current=screen==="home"?home:screen==="history"?historyView:screen==="wallet"?wallet:profile;
  const tabs:Array<[Screen,string,string]>=[["home","⌂","Início"],["history","▤","Entregas"],["wallet","$","Ganhos"],["profile","○","Perfil"]];
  return<SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" backgroundColor="#f6f6f6"/><View style={styles.flex}>{current}</View><Modal visible={mapOpen&&!!active} animationType="slide" onRequestClose={()=>setMapOpen(false)}><SafeAreaView style={styles.mapModalSafe}><View style={styles.mapModalHeader}><View style={{flex:1}}><Text style={styles.mapModalKicker}>CLICK-FOOD ENTREGADOR</Text><Text style={styles.mapModalTitle}>Mapa da entrega</Text></View><Pressable style={styles.mapModalClose} onPress={()=>setMapOpen(false)}><Text style={styles.mapModalCloseText}>FECHAR</Text></Pressable></View><View style={styles.mapModalBody}><DriverLiveMap online={driver.online} location={driverLocation} active={active}/></View></SafeAreaView></Modal><View style={styles.bottom}>{tabs.map(([key,icon,label])=><Pressable key={key} onPress={()=>setScreen(key)} style={styles.tab}><Text style={[styles.tabIcon,screen===key&&styles.tabActive]}>{icon}</Text><Text style={[styles.tabText,screen===key&&styles.tabActive]}>{label}</Text></Pressable>)}</View><Modal visible={!!offer} transparent animationType="fade"><View style={styles.modalBackdrop}>{offer&&<View style={styles.offerCard}><View style={styles.offerHeader}><Text style={styles.offerLabel}>NOVA ENTREGA</Text><Text style={styles.timerText}>{Math.max(0,Math.ceil((new Date(offer.expiresAt).getTime()-Date.now())/1000))}s</Text></View><Text style={styles.offerStore}>{offer.storeName}</Text><View style={styles.offerRoute}><View><Text style={styles.offerSmall}>ATÉ A LOJA</Text><Text style={styles.offerBig}>{offer.pickupDistanceKm==null?"—":`${offer.pickupDistanceKm.toFixed(1)} km`}</Text></View><Text style={styles.arrow}>→</Text><View><Text style={styles.offerSmall}>ENTREGA</Text><Text style={styles.offerBig}>{offer.deliveryDistanceKm==null?"—":`${offer.deliveryDistanceKm.toFixed(1)} km`}</Text></View></View><Text style={styles.offerSmall}>SEU GANHO</Text><Text style={styles.offerAmount}>{brl(offer.earning)}</Text><View style={styles.offerActions}><Pressable style={styles.reject} onPress={rejectOffer}><Text style={styles.rejectText}>RECUSAR</Text></Pressable><Pressable style={styles.accept} onPress={acceptOffer}><Text style={styles.acceptText}>ACEITAR</Text></Pressable></View></View>}</View></Modal><Modal visible={incidentModal} transparent animationType="fade" onRequestClose={()=>!incidentBusy&&setIncidentModal(false)}><View style={styles.modalBackdrop}><View style={styles.incidentCard}><Text style={styles.incidentTitle}>Reportar problema</Text><Text style={styles.incidentHint}>Descreva o que aconteceu. O suporte e a loja receberão o chamado.</Text><TextInput style={styles.incidentInput} placeholder="Ex.: pneu furou, acidente, problema no pedido..." multiline value={incidentReason} onChangeText={setIncidentReason}/><View style={styles.offerActions}><Pressable style={styles.reject} disabled={incidentBusy} onPress={()=>setIncidentModal(false)}><Text style={styles.rejectText}>VOLTAR</Text></Pressable><Pressable style={[styles.accept,incidentBusy&&styles.disabled]} disabled={incidentBusy} onPress={()=>reportDeliveryProblem("INCIDENT")}><Text style={styles.acceptText}>{incidentBusy?"ENVIANDO...":"ENVIAR"}</Text></Pressable></View></View></View></Modal></SafeAreaView>;
}

const styles=StyleSheet.create({problemButton:{borderWidth:1,borderColor:"#b42318",padding:12,borderRadius:13,alignItems:"center",marginTop:9},problemText:{fontWeight:"900",color:"#b42318"},problemSecondary:{borderWidth:1,borderColor:"#a15c00",padding:12,borderRadius:13,alignItems:"center",marginTop:9},problemSecondaryText:{fontWeight:"900",color:"#8a5200"},supportActive:{backgroundColor:"#fff4c6",color:"#6d5900",padding:10,borderRadius:10,marginTop:10,fontWeight:"800",fontSize:11},incidentCard:{backgroundColor:"#fff",borderRadius:22,padding:20,width:"90%",maxWidth:460},incidentTitle:{fontSize:22,fontWeight:"900"},incidentHint:{color:"#666",fontSize:12,lineHeight:17,marginTop:6,marginBottom:12},incidentInput:{minHeight:100,borderWidth:1,borderColor:"#ddd",borderRadius:13,padding:12,textAlignVertical:"top",marginBottom:4},safe:{flex:1,backgroundColor:"#f6f6f6"},flex:{flex:1},center:{flex:1,alignItems:"center",justifyContent:"center",gap:10},content:{padding:15,paddingBottom:30},authWrap:{flexGrow:1,justifyContent:"center",padding:26},brand:{fontSize:24,fontWeight:"900"},yellow:{color:"#f4c400"},subtitle:{fontSize:9,fontWeight:"900",letterSpacing:2,color:"#777",marginTop:3},authTitle:{fontSize:30,fontWeight:"900",marginVertical:22},pageTitle:{fontSize:28,fontWeight:"900",marginBottom:20},input:{backgroundColor:"#fff",borderWidth:1,borderColor:"#ddd",borderRadius:14,padding:14,marginBottom:10},label:{fontSize:12,fontWeight:"900",marginTop:12,marginBottom:8},notice:{backgroundColor:"#fff4c6",color:"#6d5900",padding:12,borderRadius:12,marginVertical:10},primary:{backgroundColor:"#111",padding:15,borderRadius:14,alignItems:"center",marginTop:8},primaryText:{color:"#fff",fontWeight:"900"},disabled:{opacity:.5},switchText:{textAlign:"center",color:"#8e7000",fontWeight:"800",padding:18},choices:{marginBottom:12},choiceRow:{flexDirection:"row",gap:8,marginBottom:14},chip:{borderWidth:1,borderColor:"#ddd",backgroundColor:"#fff",paddingVertical:9,paddingHorizontal:12,borderRadius:20,marginRight:8},chipActive:{backgroundColor:"#111",borderColor:"#111"},chipText:{fontSize:11,fontWeight:"700"},chipTextActive:{fontSize:11,fontWeight:"800",color:"#fff"},pending:{flex:1,justifyContent:"center",alignItems:"center",padding:28},pendingIcon:{fontSize:55,marginVertical:18},pendingText:{textAlign:"center",color:"#666",lineHeight:20},secondary:{borderWidth:1,borderColor:"#ddd",backgroundColor:"#fff",padding:14,borderRadius:14,alignItems:"center",marginTop:18},secondaryText:{fontWeight:"900"},header:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:20},dot:{width:12,height:12,borderRadius:6,backgroundColor:"#bbb"},dotOnline:{backgroundColor:"#21a366"},earningsCard:{backgroundColor:"#111",borderRadius:22,padding:20},earningsLabel:{fontSize:10,fontWeight:"900",letterSpacing:1,color:"#9a9a9a"},earningsValue:{fontSize:34,fontWeight:"900",color:"#fff",marginTop:5},stats:{flexDirection:"row",justifyContent:"space-between",marginTop:20},statValue:{color:"#fff",fontSize:16,fontWeight:"900"},statLabel:{color:"#8d8d8d",fontSize:10,marginTop:3},onlineButton:{backgroundColor:"#f4c400",paddingVertical:17,borderRadius:16,alignItems:"center",marginTop:16},offlineButton:{backgroundColor:"#fff",borderWidth:2,borderColor:"#111"},onlineText:{fontWeight:"900",fontSize:13},map:{height:220,borderRadius:22,backgroundColor:"#e8e8e8",marginTop:18,alignItems:"center",justifyContent:"center",padding:20},mapTitle:{fontSize:16,fontWeight:"900"},mapEmoji:{fontSize:45,marginVertical:18},mapText:{fontSize:12,color:"#666",textAlign:"center"},deliveryCard:{backgroundColor:"#fff",borderRadius:18,padding:16,marginTop:14,borderWidth:1,borderColor:"#e8e8e8"},mapActionButton:{backgroundColor:"#111",borderRadius:13,paddingVertical:13,alignItems:"center",marginTop:10},mapActionText:{color:"#f4c400",fontWeight:"900",fontSize:10},mapModalSafe:{flex:1,backgroundColor:"#111"},mapModalHeader:{paddingHorizontal:16,paddingVertical:12,backgroundColor:"#111",flexDirection:"row",alignItems:"center",gap:12},mapModalKicker:{color:"#f4c400",fontSize:9,fontWeight:"900",letterSpacing:1.2},mapModalTitle:{color:"#fff",fontSize:20,fontWeight:"900",marginTop:2},mapModalClose:{backgroundColor:"#f4c400",borderRadius:11,paddingVertical:10,paddingHorizontal:13},mapModalCloseText:{fontSize:9,fontWeight:"900",color:"#111"},mapModalBody:{flex:1},deliveryBadge:{fontSize:10,fontWeight:"900",color:"#a27e00"},deliveryTitle:{fontSize:20,fontWeight:"900",marginTop:7},deliveryMeta:{color:"#666",fontSize:12,marginVertical:8},address:{fontSize:13,fontWeight:"800",marginVertical:8},codeInput:{borderWidth:1,borderColor:"#ddd",borderRadius:12,padding:13,fontSize:18,textAlign:"center",letterSpacing:5,marginTop:10},actionButton:{backgroundColor:"#f4c400",paddingVertical:15,borderRadius:14,alignItems:"center",marginTop:12},actionText:{fontWeight:"900",fontSize:11},earning:{textAlign:"center",color:"#16784b",fontWeight:"900",marginTop:12},rowBetween:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},link:{color:"#9c7900",fontWeight:"900"},listRow:{backgroundColor:"#fff",borderRadius:16,padding:16,marginBottom:9,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},listTitle:{fontWeight:"800"},listMeta:{fontSize:11,color:"#777",marginTop:4},listValue:{fontWeight:"900",color:"#16784b"},profileCard:{backgroundColor:"#fff",padding:18,borderRadius:18},bottom:{minHeight:72,backgroundColor:"#fff",borderTopWidth:1,borderTopColor:"#e3e3e3",flexDirection:"row",paddingVertical:7},tab:{flex:1,alignItems:"center",justifyContent:"center"},tabIcon:{fontSize:19,color:"#777"},tabText:{fontSize:9,fontWeight:"700",color:"#777",marginTop:3},tabActive:{color:"#9c7900",fontWeight:"900"},modalBackdrop:{flex:1,backgroundColor:"rgba(0,0,0,.65)",justifyContent:"center",padding:20},offerCard:{backgroundColor:"#fff",borderRadius:26,padding:22},offerHeader:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},offerLabel:{fontSize:12,fontWeight:"900",letterSpacing:1},timerText:{backgroundColor:"#111",color:"#f4c400",fontWeight:"900",padding:11,borderRadius:22},offerStore:{fontSize:27,fontWeight:"900",marginTop:18},offerRoute:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",backgroundColor:"#f4f4f4",borderRadius:18,padding:16,marginVertical:16},offerSmall:{fontSize:9,fontWeight:"900",color:"#777"},offerBig:{fontSize:18,fontWeight:"900",marginTop:3},arrow:{fontSize:25,color:"#999"},offerAmount:{fontSize:31,fontWeight:"900",color:"#16784b",marginTop:3},offerActions:{flexDirection:"row",gap:10,marginTop:20},reject:{flex:1,borderWidth:1,borderColor:"#ddd",paddingVertical:16,borderRadius:14,alignItems:"center"},rejectText:{fontWeight:"900",color:"#555"},accept:{flex:1,backgroundColor:"#f4c400",paddingVertical:16,borderRadius:14,alignItems:"center"},acceptText:{fontWeight:"900"}});