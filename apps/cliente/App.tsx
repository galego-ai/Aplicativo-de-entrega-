import React, { useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, Image, Modal, Platform, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import * as Location from "expo-location";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import ProductCustomizer, {
  type CustomerProduct as Product,
  type CustomerVariant,
  type CustomerOptionGroup,
  type CustomerOption,
  type CustomerPromotion,
  type CustomizedItem,
} from "./ProductCustomizer";
import PixPaymentCard, { type PixCharge } from "./PixPaymentCard";
import CustomerSupport from "./CustomerSupport";
import EfiCardPayment, { type CardTokenizationConfig, type PendingCardOrder } from "./EfiCardPayment";
import { PasswordResetLink, DeleteAccountButton } from "./AccountLifecycle";
import CustomerOrderReceipt from "./CustomerOrderReceipt";

type Tab = "home" | "search" | "orders" | "favorites" | "support" | "profile";
type Store = { id:string; name:string; slogan:string|null; description:string|null; logo_url:string|null; cover_url:string|null; primary_color:string; secondary_color:string; minimum_order:number; average_preparation_time:number; timezone:string; orders_paused:boolean; open_now:boolean; pickup_enabled:boolean; clickfood_delivery_enabled:boolean; own_delivery_enabled:boolean; max_radius_km:number|null };
type MenuCategory = { id:string; name:string; description:string|null; image_url:string|null; sort_order:number };
type ProductWithMedia = Product & { image_url:string|null; category_id:string|null; control_inventory:boolean; stock_quantity:number|null };
type Address = { id:string; label:string|null; street:string; number:string|null; district:string|null; reference:string|null };
type StoreRelation = { name:string; latitude:number|null; longitude:number|null };
type Order = { id:string; order_number:number; store_id:string; address_id:string|null; delivery_type:string; total:number; status:string; payment_status:string; created_at:string; stores:StoreRelation|StoreRelation[]|null };
type RefundInfo = { payment_id:string; status:string; amount:number; reason:string|null; created_at:string; completed_at:string|null };
type CartItem = CustomizedItem & { cartKey:string };
type DeliveryType = "DELIVERY"|"PICKUP";
type PaymentMethod = "CASH"|"PIX"|"CREDIT_CARD";
type Tracking = { orderId:string; deliveryId:string; deliveryStatus:string; driverId:string|null; driverLat:number|null; driverLng:number|null; storeLat:number|null; storeLng:number|null; destinationLat:number|null; destinationLng:number|null };
type DriverCard = { id:string; name:string; avatarUrl:string|null; rating:number; vehicle:{type:string;brand:string|null;model:string|null;plate:string|null}|null };
type LoyaltyReward = { id:string; name:string; points_cost:number; reward_type:string; reward_value:number|null; product_id:string|null; active:boolean };
type LoyaltyRedemption = { id:string; reward_id:string; points_spent:number; status:string; expires_at:string; used_at:string|null; rewardName:string; coupon:{id:string;code:string;discount_type:string;discount_value:number;active:boolean;ends_at:string|null}|null };
type LoyaltyWallet = { id:string; storeId:string; storeName:string; storeLogo:string|null; balance:number; pointsPerCurrency:number; rewards:LoyaltyReward[]; redemptions:LoyaltyRedemption[]; transactions:Array<{id:string;transaction_type:string;points:number;created_at:string}> };
type ProductGroupLink = { product_id:string; option_group_id:string };
type DeliveryPreview = { quoteId:string; storeId:string; addressId:string; distanceKm:number; fee:number; expiresAt:string };
type HomeFeaturedProduct = { id:string; storeId:string; storeName:string; name:string; imageUrl:string|null; price:number; promotionalPrice:number|null };

const brl=(value:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value||0);
const terminalStatuses=new Set(["DELIVERED","CANCELLED","REJECTED","PAYMENT_FAILED","REFUNDED"]);
const cancellableStatuses=new Set(["PENDING_PAYMENT","WAITING_STORE","ACCEPTED","PREPARING","READY","WAITING_DRIVER"]);
const statusLabel:Record<string,string>={PENDING_PAYMENT:"Aguardando pagamento",WAITING_STORE:"Aguardando a loja",ACCEPTED:"Pedido aceito",PREPARING:"Em preparação",READY:"Pronto",WAITING_DRIVER:"Procurando entregador",DRIVER_ASSIGNED:"Entregador confirmado",DRIVER_TO_STORE:"Entregador indo à loja",PICKUP_CONFIRMED:"Pedido retirado",DRIVER_TO_CUSTOMER:"A caminho de você",DRIVER_AT_CUSTOMER:"Seu motorista chegou",DELIVERED:"Entregue",CANCELLED:"Cancelado",REJECTED:"Recusado",PAYMENT_FAILED:"Pagamento não concluído",REFUNDED:"Pagamento devolvido"};
const paymentStatusLabel:Record<string,string>={PENDING:"Pagamento pendente",PAID:"Pagamento confirmado",FAILED:"Pagamento falhou",CANCELLED:"Pagamento cancelado",PARTIALLY_REFUNDED:"Estorno parcial",REFUNDED:"Estornado"};
const refundStatusLabel:Record<string,string>={PENDING:"Estorno solicitado",PROCESSING:"Estorno em processamento",COMPLETED:"Pagamento devolvido",FAILED:"Falha no estorno",CANCELLED:"Estorno cancelado"};

const orderProgressSteps=["Recebido","Aceito","Preparando","A caminho","Entregue"] as const;
function orderProgressIndex(status:string){
  if(status==="DELIVERED")return 4;
  if(["PICKUP_CONFIRMED","PICKED_UP","DRIVER_TO_CUSTOMER","ON_THE_WAY","DRIVER_AT_CUSTOMER"].includes(status))return 3;
  if(["PREPARING","READY","WAITING_DRIVER","DRIVER_ASSIGNED","DRIVER_TO_STORE"].includes(status))return 2;
  if(status==="ACCEPTED")return 1;
  return 0;
}
function OrderProgress({status}:{status:string}){
  if(["CANCELLED","REJECTED","PAYMENT_FAILED","REFUNDED"].includes(status))return null;
  const current=orderProgressIndex(status);
  return <View style={styles.orderProgress}><View style={styles.progressBars}>{orderProgressSteps.map((step,index)=><View key={step} style={[styles.progressBar,index<=current&&styles.progressBarActive]}/>)}</View><View style={styles.progressLabels}>{orderProgressSteps.map((step,index)=><Text key={step} numberOfLines={1} style={[styles.progressLabel,index<=current&&styles.progressLabelActive]}>{step}</Text>)}</View></View>;
}

function TrackingTimeline({status}:{status:string}){
  if(["CANCELLED","REJECTED","PAYMENT_FAILED","REFUNDED"].includes(status))return null;
  const current=orderProgressIndex(status);
  const times=["Pedido recebido","Pedido aceito","Em preparação","A caminho","Entregue"];
  return <View style={styles.timeline}>{times.map((step,index)=><View style={styles.timelineRow} key={step}><View style={styles.timelineRail}><View style={[styles.timelineDot,index<=current&&styles.timelineDotActive]}><Text style={[styles.timelineDotText,index<=current&&styles.timelineDotTextActive]}>{index<current?"✓":index===current?"•":""}</Text></View>{index<times.length-1&&<View style={[styles.timelineLine,index<current&&styles.timelineLineActive]}/>}</View><View style={styles.timelineTextWrap}><Text style={[styles.timelineTitle,index<=current&&styles.timelineTitleActive]}>{step}</Text>{index===current&&index<4&&<Text style={styles.timelineCurrent}>Etapa atual</Text>}</View></View>)}</View>;
}

function AuthScreen(){
  const[mode,setMode]=useState<"login"|"register">("login");
  const[name,setName]=useState(""); const[phone,setPhone]=useState(""); const[email,setEmail]=useState(""); const[password,setPassword]=useState("");
  const[message,setMessage]=useState(""); const[busy,setBusy]=useState(false);

  async function submit(){
    setBusy(true);setMessage("");
    if(mode==="register"){
      if(!name.trim()||!phone.trim()||password.length<8){setMessage("Informe nome, telefone e senha com pelo menos 8 caracteres.");setBusy(false);return;}
      const{data,error}=await supabase.auth.signUp({email:email.trim(),password,options:{data:{full_name:name.trim(),phone:phone.trim()}}});
      if(error)setMessage(error.message);else if(!data.session)setMessage("Cadastro criado. Confirme seu e-mail para entrar.");
    }else{
      const{error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
      if(error)setMessage("E-mail ou senha inválidos.");
    }
    setBusy(false);
  }

  return <SafeAreaView style={styles.authSafe}><StatusBar barStyle="dark-content"/><ScrollView contentContainerStyle={styles.authWrap} keyboardShouldPersistTaps="handled">
    <Text style={styles.brand}><Text style={styles.yellow}>CLICK</Text>-FOOD</Text><Text style={styles.kicker}>DELIVERY NA SUA CIDADE</Text>
    <Text style={styles.authTitle}>{mode==="login"?"Entre para pedir":"Crie sua conta"}</Text>
    {mode==="register"&&<><TextInput style={styles.input} placeholder="Nome completo" value={name} onChangeText={setName}/><TextInput style={styles.input} placeholder="Telefone" keyboardType="phone-pad" value={phone} onChangeText={setPhone}/></>}
    <TextInput style={styles.input} placeholder="E-mail" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail}/>
    <TextInput style={styles.input} placeholder="Senha" secureTextEntry value={password} onChangeText={setPassword}/>
    {!!message&&<Text style={styles.message}>{message}</Text>}
    <Pressable style={[styles.darkButton,busy&&styles.disabled]} onPress={submit} disabled={busy}><Text style={styles.darkButtonText}>{busy?"AGUARDE...":mode==="login"?"ENTRAR":"CRIAR CONTA"}</Text></Pressable>
    <Pressable onPress={()=>{setMode(mode==="login"?"register":"login");setMessage("");}}><Text style={styles.switchText}>{mode==="login"?"Ainda não tenho conta":"Já tenho uma conta"}</Text></Pressable>
    {mode==="login"&&<PasswordResetLink scheme="clickfood-cliente"/>}
  </ScrollView></SafeAreaView>;
}

function promotionPrice(base:number,productId:string,promotions:CustomerPromotion[]){
  let value=base;
  for(const promo of promotions.filter(p=>p.product_id===productId)){
    const d=Number(promo.discount_value);
    if(promo.promotion_type==="PRODUCT_PRICE")value=Math.min(value,d);
    else if(promo.promotion_type==="PERCENTAGE"&&d>=0&&d<=100)value=Math.min(value,value*(1-d/100));
    else if(promo.promotion_type==="FIXED")value=Math.min(value,Math.max(0,value-d));
  }
  return Math.max(0,value);
}

function promotionOfferLabel(promo:CustomerPromotion){
  const value=Number(promo.discount_value);
  if(promo.promotion_type==="FREE_DELIVERY")return "Frete grátis";
  if(promo.promotion_type==="PRODUCT_PRICE")return `Por ${brl(value)}`;
  if(promo.promotion_type==="PERCENTAGE")return `${value}% OFF`;
  if(promo.promotion_type==="FIXED")return `${brl(value)} OFF`;
  return "Oferta";
}

export default function App(){
  const[session,setSession]=useState<Session|null>(null); const[loading,setLoading]=useState(true); const[tab,setTab]=useState<Tab>("home");
  const[stores,setStores]=useState<Store[]>([]); const[orders,setOrders]=useState<Order[]>([]); const[query,setQuery]=useState(""); const[message,setMessage]=useState("");
  const[selectedStore,setSelectedStore]=useState<Store|null>(null); const[cartOpen,setCartOpen]=useState(false); const[products,setProducts]=useState<ProductWithMedia[]>([]); const[categories,setCategories]=useState<MenuCategory[]>([]); const[selectedCategoryId,setSelectedCategoryId]=useState("ALL"); const[cart,setCart]=useState<CartItem[]>([]);
  const[variants,setVariants]=useState<CustomerVariant[]>([]); const[optionGroups,setOptionGroups]=useState<CustomerOptionGroup[]>([]); const[productOptions,setProductOptions]=useState<CustomerOption[]>([]); const[productGroupLinks,setProductGroupLinks]=useState<ProductGroupLink[]>([]); const[promotions,setPromotions]=useState<CustomerPromotion[]>([]); const[selectedProduct,setSelectedProduct]=useState<ProductWithMedia|null>(null);
  const[addresses,setAddresses]=useState<Address[]>([]); const[selectedAddressId,setSelectedAddressId]=useState(""); const[deliveryType,setDeliveryType]=useState<DeliveryType>("DELIVERY"); const[coupon,setCoupon]=useState(""); const[placing,setPlacing]=useState(false);
  const[deliveryPreview,setDeliveryPreview]=useState<DeliveryPreview|null>(null); const[deliveryPreviewBusy,setDeliveryPreviewBusy]=useState(false);
  const[paymentMethod,setPaymentMethod]=useState<PaymentMethod>("CASH"); const[availablePaymentMethods,setAvailablePaymentMethods]=useState<PaymentMethod[]>(["CASH"]); const[pixCharge,setPixCharge]=useState<PixCharge|null>(null); const[pixBusy,setPixBusy]=useState(false);
  const[cardTokenization,setCardTokenization]=useState<CardTokenizationConfig|null>(null); const[pendingCardOrder,setPendingCardOrder]=useState<PendingCardOrder|null>(null);
  const[refundByOrder,setRefundByOrder]=useState<Record<string,RefundInfo>>({}); const[refundBusyOrderId,setRefundBusyOrderId]=useState<string|null>(null);
  const[loyaltyWallets,setLoyaltyWallets]=useState<LoyaltyWallet[]>([]); const[loyaltyTotal,setLoyaltyTotal]=useState(0); const[loyaltyBusyReward,setLoyaltyBusyReward]=useState<string|null>(null);
  const[addressForm,setAddressForm]=useState({label:"Casa",street:"",number:"",district:"",reference:""}); const[savingAddress,setSavingAddress]=useState(false);
  const[tracking,setTracking]=useState<Tracking|null>(null); const[driverCard,setDriverCard]=useState<DriverCard|null>(null); const[trackingMapOpen,setTrackingMapOpen]=useState(false); const[deliveryCode,setDeliveryCode]=useState<string|null>(null); const[deliveryCodeBusy,setDeliveryCodeBusy]=useState(false); const[reviewedOrderIds,setReviewedOrderIds]=useState<Set<string>>(new Set()); const[ratingOrderId,setRatingOrderId]=useState<string|null>(null); const[stars,setStars]=useState(5); const[reviewComment,setReviewComment]=useState(""); const[submittingReview,setSubmittingReview]=useState(false);
  const[receiptOrderId,setReceiptOrderId]=useState<string|null>(null);
  const[favoriteStoreIds,setFavoriteStoreIds]=useState<Set<string>>(new Set());
  const[homeFeaturedProducts,setHomeFeaturedProducts]=useState<HomeFeaturedProduct[]>([]);
  const storeScrollRef=useRef<ScrollView>(null);

  const cartSubtotal=useMemo(()=>cart.reduce((sum,item)=>{
    const extras=item.options.reduce((s,o)=>s+o.price*o.quantity,0);
    return sum+(item.unitPrice+extras)*item.quantity;
  },0),[cart]);
  const cartQuantity=useMemo(()=>cart.reduce((sum,item)=>sum+item.quantity,0),[cart]);
  const minimumMissing=selectedStore?Math.max(0,Number(selectedStore.minimum_order)-cartSubtotal):0;
  const freeDeliveryApplies=useMemo(()=>promotions.some(p=>p.promotion_type==="FREE_DELIVERY"&&(!p.product_id||cart.some(item=>item.productId===p.product_id))),[promotions,cart]);
  const deliveryPreviewUsable=Boolean(deliveryPreview&&selectedStore&&deliveryPreview.storeId===selectedStore.id&&deliveryPreview.addressId===selectedAddressId&&new Date(deliveryPreview.expiresAt).getTime()>Date.now()+5000);
  const estimatedDeliveryFee=deliveryType==="PICKUP"?0:deliveryPreviewUsable&&deliveryPreview?(freeDeliveryApplies?0:deliveryPreview.fee):null;
  const checkoutEstimatedTotal=cartSubtotal+(estimatedDeliveryFee??0);

  useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false);});const{data}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));return()=>data.subscription.unsubscribe();},[]);
  useEffect(()=>{if(!session){setFavoriteStoreIds(new Set());return;}void AsyncStorage.getItem(`@clickfood/customer/favorite-stores-${session.user.id}`).then(raw=>{try{const ids=raw?JSON.parse(raw):[];setFavoriteStoreIds(new Set(Array.isArray(ids)?ids.map(String):[]));}catch{setFavoriteStoreIds(new Set());}});},[session?.user.id]);
  useEffect(()=>{if(session){loadStores();loadOrders();loadAddresses();loadReviewed();loadPaymentMethods();loadLoyalty();}else{setTracking(null);setDriverCard(null);setOrders([]);setPixCharge(null);setLoyaltyWallets([]);setLoyaltyTotal(0);}},[session]);
  useEffect(()=>{if(!session||tab!=="orders")return;const timer=setInterval(()=>loadOrders(),20000);return()=>clearInterval(timer);},[session?.user.id,tab]);
  useEffect(()=>{if(!session||tab!=="orders")return;let refreshTimer:ReturnType<typeof setTimeout>|undefined;const refresh=()=>{if(refreshTimer)clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{void loadOrders();},180);};const channel=supabase.channel(`customer-orders-live-${session.user.id}`).on("postgres_changes",{event:"*",schema:"public",table:"orders",filter:`customer_id=eq.${session.user.id}`},refresh).on("postgres_changes",{event:"*",schema:"public",table:"deliveries"},refresh).subscribe();return()=>{if(refreshTimer)clearTimeout(refreshTimer);void supabase.removeChannel(channel);};},[session?.user.id,tab]);
  useEffect(()=>{if(!session||tab!=="orders"||!tracking?.driverId)return;const driverId=tracking.driverId;const channel=supabase.channel(`customer-driver-live-${driverId}`).on("postgres_changes",{event:"*",schema:"public",table:"driver_locations",filter:`driver_id=eq.${driverId}`},payload=>{const row=(payload.new??{}) as any;const latitude=Number(row.latitude),longitude=Number(row.longitude);if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return;setTracking(current=>current&&current.driverId===driverId?{...current,driverLat:latitude,driverLng:longitude}:current);}).subscribe();return()=>{void supabase.removeChannel(channel);};},[session?.user.id,tab,tracking?.driverId]);
  useEffect(()=>{if(!session||tab!=="orders"||tracking?.deliveryStatus!=="DRIVER_AT_CUSTOMER"||!tracking.deliveryId||deliveryCode)return;const deliveryId=tracking.deliveryId;const refresh=()=>void fetchDeliveryCode(deliveryId);void refresh();const timer=setInterval(refresh,4000);return()=>clearInterval(timer);},[session?.user.id,tab,tracking?.deliveryId,tracking?.deliveryStatus,deliveryCode]);
  useEffect(()=>{if(!session)return;const timer=setInterval(()=>loadStores(),60000);return()=>clearInterval(timer);},[session?.user.id]);
  useEffect(()=>{if(session&&cardTokenization)void loadOrders();},[session?.user.id,cardTokenization?.accountId]);
  useEffect(()=>{if(!selectedStore)return;const deliveryEnabled=selectedStore.clickfood_delivery_enabled||selectedStore.own_delivery_enabled;if(deliveryType==="DELIVERY"&&!deliveryEnabled&&selectedStore.pickup_enabled)setDeliveryType("PICKUP");else if(deliveryType==="PICKUP"&&!selectedStore.pickup_enabled&&deliveryEnabled)setDeliveryType("DELIVERY");},[selectedStore?.id,selectedStore?.pickup_enabled,selectedStore?.clickfood_delivery_enabled,selectedStore?.own_delivery_enabled,deliveryType]);
  useEffect(()=>{setDeliveryPreview(null);},[selectedStore?.id,selectedAddressId,deliveryType]);
  useEffect(()=>{if(!cartOpen||!selectedStore||deliveryType!=="DELIVERY"||!selectedAddressId)return;void previewDeliveryQuote();},[cartOpen,selectedStore?.id,selectedAddressId,deliveryType]);

  async function loadLoyalty(){
    if(!session)return;
    const{data,error}=await supabase.functions.invoke("customer-loyalty",{body:{action:"SUMMARY"}});
    if(error||data?.error)return;
    setLoyaltyWallets((data?.wallets??[]) as LoyaltyWallet[]);
    setLoyaltyTotal(Number(data?.totalPoints??0));
  }

  async function redeemLoyaltyReward(wallet:LoyaltyWallet,reward:LoyaltyReward){
    if(wallet.balance<Number(reward.points_cost)||loyaltyBusyReward)return;
    setLoyaltyBusyReward(reward.id);setMessage("");
    const{data,error}=await supabase.functions.invoke("customer-loyalty",{body:{action:"REDEEM",rewardId:reward.id}});
    setLoyaltyBusyReward(null);
    if(error||data?.error){setMessage(data?.error==="INSUFFICIENT_LOYALTY_POINTS"?"Seu saldo de pontos mudou e não é suficiente para este resgate.":"Não foi possível resgatar esta recompensa agora.");await loadLoyalty();return;}
    const code=String(data?.redemption?.couponCode??"");
    setMessage(code?`Recompensa resgatada! Use o cupom ${code} no checkout.`:"Recompensa resgatada com sucesso.");
    await loadLoyalty();
  }

  async function loadStores(){
    const{data,error}=await supabase.functions.invoke("store-catalog");
    if(error||data?.error)return;
    const rows=(data?.stores??[]) as Store[];
    setStores(rows);
    setSelectedStore(current=>current?(rows.find(s=>s.id===current.id)??current):current);
    const storeIds=rows.map(store=>store.id);
    if(!storeIds.length){setHomeFeaturedProducts([]);return;}
    const{data:featuredRows}=await supabase.from("products").select("id,store_id,name,image_url,price,promotional_price,updated_at").in("store_id",storeIds).eq("active",true).eq("available_delivery",true).order("updated_at",{ascending:false}).limit(12);
    const storeById=new Map(rows.map(store=>[store.id,store]));
    setHomeFeaturedProducts(((featuredRows??[]) as any[]).map(row=>{const store=storeById.get(String(row.store_id));return{id:String(row.id),storeId:String(row.store_id),storeName:store?.name??"CLICK-FOOD",name:String(row.name??"Produto"),imageUrl:row.image_url?String(row.image_url):null,price:Number(row.price??0),promotionalPrice:row.promotional_price==null?null:Number(row.promotional_price)};}).slice(0,6));
  }

  async function loadPaymentMethods(){
    const{data,error}=await supabase.functions.invoke("payment-methods",{body:{}});
    if(error||data?.error){setAvailablePaymentMethods(["CASH"]);setPaymentMethod("CASH");setCardTokenization(null);return;}
    const methods=(data?.methods??[]).filter((m:string)=>m==="CASH"||m==="PIX"||m==="CREDIT_CARD") as PaymentMethod[];
    const next:PaymentMethod[]=methods.includes("CASH")?methods:(["CASH",...methods] as PaymentMethod[]);
    const tokenization=data?.cardTokenization;
    setCardTokenization(tokenization?.provider==="EFI"&&tokenization?.accountId?tokenization as CardTokenizationConfig:null);
    setAvailablePaymentMethods(next);setPaymentMethod(current=>next.includes(current)?current:"CASH");
  }

  async function loadPendingPix(currentOrders:Order[]){
    const pending=currentOrders.find(order=>order.status==="PENDING_PAYMENT"&&order.payment_status!=="PAID");
    if(!pending){setPixCharge(null);return;}
    const{data}=await supabase.from("efi_pix_charges").select("txid,brcode,status,expires_at").eq("order_id",pending.id).order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(data?.brcode)setPixCharge({orderId:pending.id,txid:data.txid,brcode:data.brcode,status:data.status,expires_at:data.expires_at});
  }

  async function loadPendingCard(currentOrders:Order[]){
    if(!session)return;
    const pending=currentOrders.find(order=>order.status==="PENDING_PAYMENT"&&order.payment_status==="PENDING");
    if(!pending){
      setPendingCardOrder(current=>current&&currentOrders.some(order=>order.id===current.orderId&&order.status==="PENDING_PAYMENT")?current:null);
      return;
    }
    const{data:payment}=await supabase.from("payments").select("method").eq("order_id",pending.id).order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(payment?.method!=="CREDIT_CARD")return;
    const{data:charge}=await supabase.from("efi_card_charges").select("charge_id,status").eq("order_id",pending.id).maybeSingle();
    if(charge?.charge_id){
      const statusResult=await supabase.functions.invoke("efi-card-status",{body:{orderId:pending.id}});
      const status=String(statusResult.data?.status??charge.status??"").toUpperCase();
      const paid=Boolean(statusResult.data?.paid||status==="PAID");
      const approved=Boolean(statusResult.data?.approved||status==="APPROVED");
      setPendingCardOrder(null);
      if(!statusResult.error&&paid)setMessage("Pagamento no cartão confirmado! Seu pedido foi enviado para a loja.");
      else if(!statusResult.error&&approved)setMessage("Cartão aprovado pela Efí. Aguardando a confirmação final do pagamento.");
      else if(!statusResult.error&&["WAITING","PROCESSING"].includes(status))setMessage("Pagamento no cartão em processamento. A Efí está confirmando o status.");
      return;
    }
    if(cardTokenization)setPendingCardOrder(current=>current?.orderId===pending.id?current:{orderId:pending.id,total:pending.total});
  }

  async function refreshPix(orderId:string){
    setPixBusy(true);
    const statusResult=await supabase.functions.invoke("efi-pix-status",{body:{orderId}});
    if(!statusResult.error&&statusResult.data?.paid){
      setPixCharge(null);setMessage("Pagamento PIX confirmado! Seu pedido foi enviado para a loja.");await loadOrders();setPixBusy(false);return true;
    }
    const{data,error}=await supabase.functions.invoke("efi-pix-create",{body:{orderId}});
    if(error||data?.error||!data?.charge?.brcode){setMessage("Não foi possível consultar ou gerar o PIX agora. Tente novamente.");setPixBusy(false);return false;}
    setPixCharge({orderId,txid:data.charge.txid,brcode:data.charge.brcode,status:data.charge.status,expires_at:data.charge.expires_at});
    setMessage("PIX atualizado. Assim que o pagamento for confirmado, o pedido seguirá automaticamente para a loja.");setPixBusy(false);return true;
  }

  async function loadOrders(){
    if(!session)return;
    const{data}=await supabase.from("orders").select("id,order_number,store_id,address_id,delivery_type,total,status,payment_status,created_at,stores(name,latitude,longitude)").eq("customer_id",session.user.id).order("created_at",{ascending:false}).limit(30);
    const rows=(data??[]).map((o:any)=>({...o,total:Number(o.total)})) as Order[];
    setOrders(rows);await Promise.all([loadPendingPix(rows),loadPendingCard(rows),loadRefunds(rows),loadTracking(rows)]);
  }

  async function loadRefunds(currentOrders:Order[]){
    const orderIds=currentOrders.map(order=>order.id);
    if(!orderIds.length){setRefundByOrder({});return;}
    const{data:payments,error:paymentError}=await supabase.from("payments").select("id,order_id").in("order_id",orderIds).in("method",["PIX","CREDIT_CARD"]);
    if(paymentError||!payments?.length){setRefundByOrder({});return;}
    const paymentIds=payments.map((payment:any)=>String(payment.id));
    const paymentToOrder=new Map(payments.map((payment:any)=>[String(payment.id),String(payment.order_id)]));
    const{data:refunds,error:refundError}=await supabase.from("refunds").select("payment_id,status,amount,reason,created_at,completed_at").in("payment_id",paymentIds).order("created_at",{ascending:false});
    if(refundError){setRefundByOrder({});return;}
    const next:Record<string,RefundInfo>={};
    for(const raw of refunds??[]){
      const orderId=paymentToOrder.get(String((raw as any).payment_id));
      if(orderId&&!next[orderId])next[orderId]={...(raw as any),amount:Number((raw as any).amount)} as RefundInfo;
    }
    setRefundByOrder(next);
  }

  async function fetchDeliveryCode(deliveryId:string){
    setDeliveryCodeBusy(true);
    const codeResult=await supabase.functions.invoke("delivery-code",{body:{deliveryId,kind:"DELIVERY"}});
    setDeliveryCodeBusy(false);
    if(!codeResult.error&&!codeResult.data?.error&&/^\d{4}$/.test(String(codeResult.data?.code??""))){
      setDeliveryCode(String(codeResult.data.code));
      return true;
    }
    setDeliveryCode(null);
    return false;
  }

  async function loadTracking(currentOrders:Order[]){
    const activeOrder=currentOrders.find(order=>order.delivery_type==="DELIVERY"&&!terminalStatuses.has(order.status));
    if(!activeOrder){setTracking(null);setDriverCard(null);setDeliveryCode(null);setTrackingMapOpen(false);return;}
    const{data:delivery}=await supabase.from("deliveries").select("id,status,driver_id").eq("order_id",activeOrder.id).maybeSingle();
    if(!delivery){setTracking(null);setDriverCard(null);setDeliveryCode(null);setTrackingMapOpen(false);return;}
    const relation=Array.isArray(activeOrder.stores)?activeOrder.stores[0]:activeOrder.stores;
    let driverLat:number|null=null,driverLng:number|null=null,destinationLat:number|null=null,destinationLng:number|null=null;
    if(delivery.driver_id){
      const[locationResult,cardResult]=await Promise.all([
        supabase.from("driver_locations").select("latitude,longitude").eq("driver_id",delivery.driver_id).maybeSingle(),
        supabase.functions.invoke("customer-driver-card",{body:{orderId:activeOrder.id}}),
      ]);
      if(locationResult.data){driverLat=Number(locationResult.data.latitude);driverLng=Number(locationResult.data.longitude);}
      if(!cardResult.error&&cardResult.data?.driver)setDriverCard(cardResult.data.driver as DriverCard);else setDriverCard(null);
    }else setDriverCard(null);
    if(activeOrder.address_id){
      const{data:address}=await supabase.from("customer_addresses").select("latitude,longitude").eq("id",activeOrder.address_id).maybeSingle();
      if(address){destinationLat=address.latitude==null?null:Number(address.latitude);destinationLng=address.longitude==null?null:Number(address.longitude);}
    }
    setTracking({orderId:activeOrder.id,deliveryId:delivery.id,deliveryStatus:delivery.status,driverId:delivery.driver_id,driverLat,driverLng,storeLat:relation?.latitude==null?null:Number(relation.latitude),storeLng:relation?.longitude==null?null:Number(relation.longitude),destinationLat,destinationLng});
    if(String(delivery.status)==="DRIVER_AT_CUSTOMER"){
      await fetchDeliveryCode(String(delivery.id));
    }else{setDeliveryCode(null);setDeliveryCodeBusy(false);}
  }

  async function loadReviewed(){
    if(!session)return;
    const{data}=await supabase.from("reviews").select("order_id").eq("customer_id",session.user.id);
    setReviewedOrderIds(new Set((data??[]).map((item:any)=>String(item.order_id))));
  }

  async function loadAddresses(){
    if(!session)return;
    const{data}=await supabase.from("customer_addresses").select("id,label,street,number,district,reference").eq("user_id",session.user.id).order("is_default",{ascending:false}).order("created_at",{ascending:false});
    const rows=(data??[]) as Address[];setAddresses(rows);if(rows.length&&!selectedAddressId)setSelectedAddressId(rows[0].id);
  }

  async function toggleFavoriteStore(storeId:string){
    if(!session)return;
    const next=new Set(favoriteStoreIds);
    if(next.has(storeId))next.delete(storeId);else next.add(storeId);
    setFavoriteStoreIds(next);
    await AsyncStorage.setItem(`@clickfood/customer/favorite-stores-${session.user.id}`,JSON.stringify([...next]));
  }

  async function openStore(store:Store){
    setMessage("");setSelectedStore(store);setCart([]);setCartOpen(false);setSelectedProduct(null);setSelectedCategoryId("ALL");setDeliveryPreview(null);
    const deliveryEnabled=store.clickfood_delivery_enabled||store.own_delivery_enabled;
    setDeliveryType(deliveryEnabled?"DELIVERY":store.pickup_enabled?"PICKUP":"DELIVERY");
    const[productResult,categoryResult]=await Promise.all([
      supabase.from("products").select("id,name,description,image_url,price,promotional_price,category_id,control_inventory").eq("store_id",store.id).eq("active",true).eq("available_delivery",true).order("name"),
      supabase.from("categories").select("id,name,description,image_url,sort_order").eq("store_id",store.id).eq("active",true).order("sort_order").order("name"),
    ]);
    if(productResult.error||categoryResult.error){setMessage("Não foi possível abrir o cardápio.");return;}
    const rawPs=(productResult.data??[]).map((p:any)=>({...p,price:Number(p.price),promotional_price:p.promotional_price==null?null:Number(p.promotional_price),category_id:p.category_id==null?null:String(p.category_id),control_inventory:Boolean(p.control_inventory),stock_quantity:null})) as ProductWithMedia[];
    const controlledIds=rawPs.filter(p=>p.control_inventory).map(p=>p.id);
    const stockByProduct=new Map<string,number>();
    if(controlledIds.length){
      const inventoryResult=await supabase.from("inventory_items").select("product_id,quantity").eq("store_id",store.id).in("product_id",controlledIds);
      for(const row of inventoryResult.data??[])stockByProduct.set(String(row.product_id),Number(row.quantity));
    }
    const ps=rawPs.map(p=>({...p,stock_quantity:p.control_inventory?Number(stockByProduct.get(p.id)??0):null}));
    setProducts(ps);setCategories((categoryResult.data??[]) as MenuCategory[]);
    const productIds=ps.map(p=>p.id);
    if(!productIds.length){setVariants([]);setOptionGroups([]);setProductOptions([]);setProductGroupLinks([]);setPromotions([]);return;}
    const[vR,lR,promoR]=await Promise.all([
      supabase.from("product_variants").select("id,product_id,name,price,active").in("product_id",productIds).eq("active",true).order("sort_order").order("name"),
      supabase.from("product_option_groups").select("product_id,option_group_id").in("product_id",productIds),
      supabase.from("promotions").select("id,name,promotion_type,discount_value,product_id,starts_at,ends_at").eq("store_id",store.id).eq("active",true),
    ]);
    const loadedVariants=(vR.data??[]).map((v:any)=>({...v,price:Number(v.price)})) as CustomerVariant[];
    const links=(lR.data??[]) as ProductGroupLink[];
    setVariants(loadedVariants);setProductGroupLinks(links);
    const promotionNow=Date.now();
    setPromotions((promoR.data??[]).filter((p:any)=>(!p.starts_at||new Date(p.starts_at).getTime()<=promotionNow)&&(!p.ends_at||new Date(p.ends_at).getTime()>=promotionNow)).map((p:any)=>({...p,discount_value:Number(p.discount_value)})) as CustomerPromotion[]);
    const groupIds=[...new Set(links.map(x=>x.option_group_id))];
    if(!groupIds.length){setOptionGroups([]);setProductOptions([]);return;}
    const[gR,oR]=await Promise.all([
      supabase.from("option_groups").select("id,name,required,minimum_choices,maximum_choices,active").in("id",groupIds).eq("active",true).order("name"),
      supabase.from("product_options").select("id,option_group_id,name,additional_price,active").in("option_group_id",groupIds).eq("active",true).order("sort_order").order("name"),
    ]);
    setOptionGroups((gR.data??[]) as CustomerOptionGroup[]);
    setProductOptions((oR.data??[]).map((o:any)=>({...o,additional_price:Number(o.additional_price)})) as CustomerOption[]);
  }

  function variantsFor(productId:string){return variants.filter(v=>v.product_id===productId&&v.active);}
  function groupsFor(productId:string){
    const ids=new Set(productGroupLinks.filter(l=>l.product_id===productId).map(l=>l.option_group_id));
    return optionGroups.filter(g=>ids.has(g.id)&&g.active);
  }
  function optionsFor(productId:string){
    const groupIds=new Set(groupsFor(productId).map(g=>g.id));
    return productOptions.filter(o=>groupIds.has(o.option_group_id)&&o.active);
  }
  function displayProductPrice(product:Product){
    const vs=variantsFor(product.id);
    const bases=vs.length?vs.map(v=>v.price):[Number(product.promotional_price??product.price)];
    return Math.min(...bases.map(base=>promotionPrice(base,product.id,promotions)));
  }

  function beginProduct(product:ProductWithMedia){
    if(product.control_inventory&&Number(product.stock_quantity??0)<=0){setMessage(`${product.name} está esgotado no momento.`);return;}
    const needsCustomization=variantsFor(product.id).length>0||groupsFor(product.id).length>0;
    if(needsCustomization){setSelectedProduct(product);setMessage("");return;}
    addCustomized({productId:product.id,productName:product.name,unitPrice:promotionPrice(Number(product.promotional_price??product.price),product.id,promotions),quantity:1,options:[]});
  }

  function addCustomized(item:CustomizedItem){
    const optionKey=[...item.options].sort((a,b)=>a.optionId.localeCompare(b.optionId)).map(o=>`${o.optionId}:${o.quantity}`).join(",");
    const cartKey=`${item.productId}|${item.variantId??"base"}|${optionKey}|${item.notes??""}`;
    setCart(current=>{
      const found=current.find(x=>x.cartKey===cartKey);
      return found?current.map(x=>x.cartKey===cartKey?{...x,quantity:x.quantity+item.quantity}:x):[...current,{...item,cartKey}];
    });
    setSelectedProduct(null);setMessage(`${item.productName} adicionado à sacola.`);
  }

  function changeQty(cartKey:string,delta:number){
    setCart(current=>current.map(item=>item.cartKey===cartKey?{...item,quantity:item.quantity+delta}:item).filter(item=>item.quantity>0));
  }

  async function saveAddressWithLocation(){
    if(!session||!addressForm.street.trim()||!addressForm.number.trim()){setMessage("Informe rua e número do endereço.");return;}
    setSavingAddress(true);setMessage("");
    const permission=await Location.requestForegroundPermissionsAsync();
    if(permission.status!=="granted"){setMessage("Autorize a localização para calcular o frete deste endereço.");setSavingAddress(false);return;}
    const position=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
    const{data,error}=await supabase.from("customer_addresses").insert({user_id:session.user.id,label:addressForm.label.trim()||"Endereço",street:addressForm.street.trim(),number:addressForm.number.trim(),district:addressForm.district.trim()||null,reference:addressForm.reference.trim()||null,latitude:position.coords.latitude,longitude:position.coords.longitude,is_default:addresses.length===0}).select("id").single();
    if(error){setMessage("Não foi possível salvar o endereço.");setSavingAddress(false);return;}
    setAddressForm({label:"Casa",street:"",number:"",district:"",reference:""});await loadAddresses();if(data?.id)setSelectedAddressId(data.id);setMessage("Endereço salvo e localização registrada.");setSavingAddress(false);
  }

  async function previewDeliveryQuote(){
    if(!selectedStore||deliveryType!=="DELIVERY")return;
    if(selectedStore.orders_paused){setMessage("Esta loja pausou temporariamente novos pedidos. O cálculo de frete ficará disponível quando ela retomar.");return;}
    if(!selectedAddressId){setMessage("Selecione um endereço para calcular o frete.");return;}
    setDeliveryPreviewBusy(true);setMessage("");
    const quoteResult=await supabase.functions.invoke("quote-delivery",{body:{storeId:selectedStore.id,addressId:selectedAddressId}});
    if(quoteResult.error||quoteResult.data?.error){
      const code=quoteResult.data?.error;
      const quoteErrors:Record<string,string>={OUTSIDE_DELIVERY_RADIUS:"Este endereço está fora da área de entrega.",STORE_CLOSED:"Esta loja está fechada agora. Consulte o horário e tente novamente quando ela abrir.",STORE_UNAVAILABLE:"Esta loja está temporariamente indisponível.",DELIVERY_DISABLED:"A loja não está aceitando entregas neste momento.",LOCATION_COORDINATES_REQUIRED:"Não foi possível calcular o frete porque faltam coordenadas da loja ou do endereço.",ADDRESS_NOT_FOUND:"Este endereço não está mais disponível. Atualize seus endereços."};
      setDeliveryPreview(null);setMessage(quoteErrors[code]??"Não foi possível calcular o frete. Confira a localização do endereço.");setDeliveryPreviewBusy(false);return;
    }
    const quote=quoteResult.data?.quote;
    setDeliveryPreview({quoteId:String(quote.id),storeId:selectedStore.id,addressId:selectedAddressId,distanceKm:Number(quote.distance_km),fee:Number(quote.fee),expiresAt:String(quote.expires_at)});
    setDeliveryPreviewBusy(false);
  }

  async function placeOrder(){
    if(!session||!selectedStore||!cart.length)return;
    const deliveryEnabled=selectedStore.clickfood_delivery_enabled||selectedStore.own_delivery_enabled;
    if(selectedStore.orders_paused){setMessage("Esta loja pausou temporariamente novos pedidos. Você ainda pode consultar o cardápio.");return;}
    if(!selectedStore.open_now){setMessage("Esta loja está fechada agora. Você pode consultar o cardápio, mas o pedido só poderá ser enviado quando ela abrir.");return;}
    if(deliveryType==="DELIVERY"&&!deliveryEnabled){setMessage("Esta loja não está aceitando entrega neste momento. Escolha retirada, se disponível.");return;}
    if(deliveryType==="PICKUP"&&!selectedStore.pickup_enabled){setMessage("A retirada na loja está desativada neste momento.");return;}
    if(cartSubtotal<selectedStore.minimum_order){setMessage(`Pedido mínimo: ${brl(selectedStore.minimum_order)}.`);return;}
    if(deliveryType==="DELIVERY"&&!selectedAddressId){setMessage("Cadastre e selecione um endereço para entrega.");return;}
    const requestedByProduct=new Map<string,number>();
    for(const item of cart)requestedByProduct.set(item.productId,(requestedByProduct.get(item.productId)??0)+item.quantity);
    const insufficientLocal=products.find(product=>product.control_inventory&&Number(product.stock_quantity??0)<Number(requestedByProduct.get(product.id)??0));
    if(insufficientLocal){setMessage(`${insufficientLocal.name} está sem estoque suficiente. Remova o item ou reduza a quantidade.`);return;}
    setPlacing(true);setMessage("");
    let deliveryQuoteId:string|undefined;let deliveryFee=0;
    if(deliveryType==="DELIVERY"){
      const previewStillValid=Boolean(deliveryPreview&&deliveryPreview.storeId===selectedStore.id&&deliveryPreview.addressId===selectedAddressId&&new Date(deliveryPreview.expiresAt).getTime()>Date.now()+5000);
      if(previewStillValid&&deliveryPreview){
        deliveryQuoteId=deliveryPreview.quoteId;deliveryFee=deliveryPreview.fee;
      }else{
        const quoteResult=await supabase.functions.invoke("quote-delivery",{body:{storeId:selectedStore.id,addressId:selectedAddressId}});
        if(quoteResult.error||quoteResult.data?.error){
          const code=quoteResult.data?.error;
          const quoteErrors:Record<string,string>={OUTSIDE_DELIVERY_RADIUS:"Este endereço está fora da área de entrega.",STORE_CLOSED:"Esta loja está fechada agora. Consulte o horário e tente novamente quando ela abrir.",STORE_UNAVAILABLE:"Esta loja está temporariamente indisponível.",DELIVERY_DISABLED:"A loja não está aceitando entregas neste momento.",LOCATION_COORDINATES_REQUIRED:"Não foi possível calcular o frete porque faltam coordenadas da loja ou do endereço."};
          setMessage(quoteErrors[code]??"Não foi possível calcular o frete. Confira a localização do endereço.");setPlacing(false);return;
        }
        deliveryQuoteId=quoteResult.data.quote.id;deliveryFee=Number(quoteResult.data.quote.fee);
      }
    }
    const result=await supabase.functions.invoke("create-order",{body:{
      storeId:selectedStore.id,
      deliveryType,
      addressId:deliveryType==="DELIVERY"?selectedAddressId:undefined,
      deliveryQuoteId,
      paymentMethod,
      couponCode:coupon.trim()||undefined,
      items:cart.map(item=>({
        productId:item.productId,
        variantId:item.variantId,
        quantity:item.quantity,
        notes:item.notes,
        options:item.options.map(o=>({optionId:o.optionId,quantity:o.quantity})),
      })),
    }});
    if(result.error||result.data?.error){
      const code=result.data?.error;
      const errors:Record<string,string>={
        COUPON_INVALID:"Cupom inválido.",
        COUPON_EXPIRED:"O cupom expirou.",
        MINIMUM_ORDER_NOT_REACHED:"O pedido não atingiu o valor mínimo.",
        VARIANT_REQUIRED:"Escolha o tamanho/variação de todos os itens.",
        VARIANT_NOT_ALLOWED:"Uma variação escolhida não está mais disponível.",
        REQUIRED_OPTION_MISSING:"Complete os complementos obrigatórios.",
        TOO_MANY_OPTIONS:"Há complementos acima do limite permitido.",
        OPTION_NOT_ALLOWED:"Um complemento escolhido não está mais disponível.",
        STORE_CLOSED:"Esta loja está fechada agora.",
        STORE_UNAVAILABLE:"Esta loja está temporariamente indisponível.",
        DELIVERY_DISABLED:"A loja não está aceitando entregas neste momento.",
        PICKUP_DISABLED:"A retirada na loja está desativada neste momento.",
        INSUFFICIENT_STOCK:"Um dos produtos está esgotado ou não possui estoque suficiente. Atualize o cardápio e ajuste o carrinho.",
        INVENTORY_NOT_CONFIGURED:"Um produto com controle de estoque precisa ser ajustado pela loja antes da venda.",
        PRODUCT_UNAVAILABLE:"Um dos produtos ficou indisponível. Atualize o cardápio.",
        DELIVERY_QUOTE_ALREADY_USED:"A cotação de frete expirou ou já foi utilizada. Calcule o frete novamente.",
      };
      setMessage(errors[code]??"Não foi possível enviar o pedido. Atualize o cardápio e tente novamente.");setPlacing(false);return;
    }
    const total=Number(result.data.total);
    const promo=Number(result.data.promotionDiscount??0);
    const finalDeliveryFee=Number(result.data.deliveryFee??deliveryFee);
    const orderId=String(result.data.orderId);
    setDeliveryPreview(null);
    if(paymentMethod==="PIX"){
      const pixResult=await supabase.functions.invoke("efi-pix-create",{body:{orderId}});
      if(pixResult.error||pixResult.data?.error||!pixResult.data?.charge?.brcode){
        await supabase.functions.invoke("customer-cancel-order",{body:{orderId,reason:"Cobrança PIX não pôde ser criada"}});
        setMessage("Não foi possível gerar o PIX e o pedido foi cancelado automaticamente. Nenhum pagamento foi realizado.");
        await loadOrders();setPlacing(false);return;
      }
      const charge=pixResult.data.charge;
      setPixCharge({orderId,txid:charge.txid,brcode:charge.brcode,status:charge.status,expires_at:charge.expires_at});
      setMessage(`PIX gerado! Total ${brl(total)}. Pague pelo QR Code ou Pix Copia e Cola.`);
    }else if(paymentMethod==="CREDIT_CARD"){
      if(!cardTokenization){
        await supabase.functions.invoke("customer-cancel-order",{body:{orderId,reason:"Tokenização de cartão não está disponível"}});
        setMessage("O cartão ficou indisponível antes do pagamento. O pedido foi cancelado e nenhum dado de cartão foi enviado.");
        await loadOrders();setPlacing(false);return;
      }
      setPendingCardOrder({orderId,total});
      setMessage(`Pedido criado. Finalize o pagamento seguro de ${brl(total)} com cartão.`);
      setPlacing(false);return;
    }else{
      setMessage(`Pedido enviado! Total ${brl(total)}${finalDeliveryFee?` • entrega ${brl(finalDeliveryFee)}`:deliveryType==="DELIVERY"?" • frete grátis":""}${promo>0?` • economia ${brl(promo)}`:""}.`);
    }
    setCartOpen(false);setCart([]);setCoupon("");setSelectedStore(null);setSelectedProduct(null);setTab("orders");await loadOrders();setPlacing(false);
  }

  async function completeCardPayment(result:{paid:boolean;approved:boolean;status:string}){
    setPendingCardOrder(null);
    setMessage(result.paid?"Pagamento no cartão confirmado! Seu pedido foi enviado para a loja.":"Cartão aprovado pela Efí. O pedido seguirá para a loja assim que a confirmação final chegar.");
    setCartOpen(false);setCart([]);setCoupon("");setSelectedStore(null);setSelectedProduct(null);setTab("orders");await loadOrders();
  }

  async function cancelPendingCardPayment(){
    const pending=pendingCardOrder;if(!pending)return;
    const{data,error}=await supabase.functions.invoke("customer-cancel-order",{body:{orderId:pending.orderId,reason:"Pagamento com cartão cancelado pelo cliente antes da conclusão"}});
    setPendingCardOrder(null);setCartOpen(false);setCart([]);setCoupon("");setSelectedStore(null);setSelectedProduct(null);setTab("orders");
    if(error||data?.error)setMessage("Não foi possível cancelar a cobrança imediatamente. O pedido ficará em acompanhamento até a confirmação do status.");
    else setMessage("Pagamento com cartão cancelado. Nenhum cartão foi armazenado pelo CLICK-FOOD.");
    await loadOrders();
  }

  function cancelOrder(order:Order){
    Alert.alert("Cancelar pedido",`Deseja cancelar o pedido #${order.order_number}?`,[
      {text:"Não",style:"cancel"},
      {text:"Cancelar",style:"destructive",onPress:async()=>{
        const{data,error}=await supabase.functions.invoke("customer-cancel-order",{body:{orderId:order.id,reason:"Cancelado pelo cliente no aplicativo"}});
        if(error||data?.error){
          const code=data?.error;
          setMessage(code==="CANCELLATION_REQUIRES_SUPPORT"||code==="PAID_ORDER_REQUIRES_REFUND_FLOW"?"O pedido já avançou. Abra o suporte para solicitar cancelamento e análise do estorno.":"Não foi possível cancelar este pedido.");return;
        }
        if(data?.refundRequired){
          const refundStatus=String(data?.refundStatus??"PENDING");
          setMessage(refundStatus==="COMPLETED"?"Pedido cancelado e pagamento devolvido com sucesso.":refundStatus==="FAILED"?"Pedido cancelado. A devolução do pagamento precisa ser tentada novamente.":"Pedido cancelado. A devolução do pagamento foi solicitada e está sendo processada.");
        }else setMessage("Pedido cancelado.");
        await loadOrders();
      }},
    ]);
  }

  async function reconcileRefund(order:Order){
    setRefundBusyOrderId(order.id);setMessage("");
    const{data,error}=await supabase.functions.invoke("payment-refund",{body:{orderId:order.id,reason:"Reconciliação de estorno solicitada pelo cliente"}});
    if(error||data?.error){setMessage("Não foi possível consultar o estorno agora. Tente novamente em alguns minutos.");setRefundBusyOrderId(null);return;}
    const status=String(data?.refundStatus??"");
    setMessage(status==="COMPLETED"?"Pagamento devolvido com sucesso.":status==="FAILED"?"A devolução não foi concluída. Você pode tentar novamente ou abrir o suporte.":"A devolução do pagamento continua em processamento.");
    await loadOrders();setRefundBusyOrderId(null);
  }

  async function submitReview(order:Order){
    if(!session||stars<1||stars>5)return;
    setSubmittingReview(true);setMessage("");
    const{data:delivery}=await supabase.from("deliveries").select("driver_id,status").eq("order_id",order.id).maybeSingle();
    const driverId=delivery?.status==="DELIVERED"?delivery.driver_id:null;
    const{error}=await supabase.from("reviews").insert({order_id:order.id,customer_id:session.user.id,store_id:order.store_id,store_rating:stars,driver_id:driverId,driver_rating:driverId?stars:null,comment:reviewComment.trim()||null});
    if(error){setMessage("Não foi possível registrar sua avaliação.");setSubmittingReview(false);return;}
    setReviewedOrderIds(current=>new Set([...current,order.id]));setRatingOrderId(null);setReviewComment("");setStars(5);setMessage("Obrigado pela avaliação!");setSubmittingReview(false);
  }

  const filtered=useMemo(()=>stores.filter(store=>`${store.name} ${store.slogan??""} ${store.description??""}`.toLowerCase().includes(query.toLowerCase())),[stores,query]);
  const menuCategoryIds=useMemo(()=>new Set(products.map(product=>product.category_id).filter((id):id is string=>Boolean(id))),[products]);
  const menuCategories=useMemo(()=>categories.filter(category=>menuCategoryIds.has(category.id)),[categories,menuCategoryIds]);
  const hasUncategorized=useMemo(()=>products.some(product=>!product.category_id),[products]);
  const visibleProducts=useMemo(()=>selectedCategoryId==="ALL"?products:selectedCategoryId==="UNCATEGORIZED"?products.filter(product=>!product.category_id):products.filter(product=>product.category_id===selectedCategoryId),[products,selectedCategoryId]);
  const offerPromotions=useMemo(()=>promotions.filter(p=>p.promotion_type==="FREE_DELIVERY"||(Boolean(p.product_id)&&["PRODUCT_PRICE","PERCENTAGE","FIXED"].includes(p.promotion_type))),[promotions]);

  if(loading)return <SafeAreaView style={styles.center}><Text style={styles.brand}><Text style={styles.yellow}>CLICK</Text>-FOOD</Text><Text>Carregando...</Text></SafeAreaView>;
  if(!session)return <AuthScreen/>;

  if(selectedStore){
    return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content"/><ScrollView ref={storeScrollRef} contentContainerStyle={[styles.scroll,cart.length?styles.scrollWithBag:undefined]}>
      <View style={styles.storeTopbar}><Pressable onPress={()=>{setCartOpen(false);setSelectedStore(null);setSelectedProduct(null);setMessage("");}}><Text style={styles.back}>‹ Voltar</Text></Pressable><Text numberOfLines={1} style={styles.storeTopTitle}>{selectedStore.name}</Text><View style={{width:54}}/></View>
      {selectedStore.cover_url?<Image source={{uri:selectedStore.cover_url}} style={styles.storeCover}/>:<View style={[styles.storeCoverFallback,{backgroundColor:selectedStore.secondary_color||"#111"}]}><Text style={[styles.storeCoverFallbackText,{color:selectedStore.primary_color||"#f4c400"}]}>CLICK-FOOD</Text></View>}
      <View style={styles.storeHeading}>{selectedStore.logo_url?<Image source={{uri:selectedStore.logo_url}} style={styles.storeLogo}/>:<View style={[styles.storeLogoFallback,{backgroundColor:selectedStore.primary_color||"#f4c400"}]}><Text style={styles.storeLogoFallbackText}>CF</Text></View>}<View style={{flex:1}}>{!!selectedStore.slogan&&<Text style={styles.storeSlogan}>{selectedStore.slogan}</Text>}<Text style={styles.storeTitle}>{selectedStore.name}</Text><Text style={styles.meta}>{selectedStore.description||"Cardápio CLICK-FOOD"}</Text></View></View>
      <View style={[styles.storeAccent,{backgroundColor:selectedStore.primary_color||"#f4c400"}]}/>
      <Text style={styles.meta}>Pedido mínimo {brl(selectedStore.minimum_order)} • preparo médio {selectedStore.average_preparation_time} min</Text>
      <View style={styles.serviceChips}>{selectedStore.clickfood_delivery_enabled&&<View style={styles.serviceChip}><Text style={styles.serviceChipText}>🛵 Entrega CLICK-FOOD</Text></View>}{selectedStore.own_delivery_enabled&&<View style={styles.serviceChip}><Text style={styles.serviceChipText}>🏪 Entrega da loja</Text></View>}{selectedStore.pickup_enabled&&<View style={styles.serviceChip}><Text style={styles.serviceChipText}>🥡 Retirada</Text></View>}{selectedStore.max_radius_km!=null&&(selectedStore.clickfood_delivery_enabled||selectedStore.own_delivery_enabled)&&<View style={styles.serviceChip}><Text style={styles.serviceChipText}>Até {selectedStore.max_radius_km} km</Text></View>}</View>
      <Text style={[styles.storeStatusBanner,selectedStore.open_now?styles.storeOpenBanner:styles.storeClosedBanner]}>{selectedStore.orders_paused?"PEDIDOS PAUSADOS":selectedStore.open_now?"ABERTA AGORA":"FECHADA AGORA"}</Text>
      {selectedStore.orders_paused&&<Text style={styles.meta}>A loja pausou novos pedidos temporariamente. O cardápio continua disponível para consulta.</Text>}
      {!selectedStore.pickup_enabled&&!selectedStore.clickfood_delivery_enabled&&!selectedStore.own_delivery_enabled&&<Text style={styles.storeClosedBanner}>Pedidos temporariamente indisponíveis nesta loja.</Text>}
      {!!message&&<Text style={styles.notice}>{message}</Text>}

      {!!offerPromotions.length&&<>
        <View style={styles.offersHeader}><View><Text style={styles.offersKicker}>PROMOÇÕES ATIVAS</Text><Text style={styles.offersTitle}>Ofertas da loja</Text></View><Text style={styles.offersEmoji}>🔥</Text></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.offersScroll} contentContainerStyle={styles.offersList}>
          {offerPromotions.map(promo=>{
            const product=promo.product_id?products.find(item=>item.id===promo.product_id):null;
            const freeDelivery=promo.promotion_type==="FREE_DELIVERY";
            return <View style={styles.offerCard} key={promo.id}>
              {product?.image_url?<Image source={{uri:product.image_url}} style={styles.offerImage}/>:<View style={styles.offerImageFallback}><Text style={styles.offerImageFallbackText}>{freeDelivery?"🛵":"🏷️"}</Text></View>}
              <View style={styles.offerBody}><Text style={styles.offerBadge}>{promotionOfferLabel(promo)}</Text><Text numberOfLines={1} style={styles.offerName}>{product?.name??promo.name}</Text><Text numberOfLines={2} style={styles.offerMeta}>{freeDelivery?(product?"Frete grátis ao incluir este item no pedido":"Frete grátis para pedidos elegíveis"):promo.name}</Text></View>
            </View>;
          })}
        </ScrollView>
      </>}

      <Text style={styles.section}>Cardápio</Text>
      {(menuCategories.length||hasUncategorized)&&<ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categoryVisualList}>
        <Pressable style={[styles.categoryVisualCard,selectedCategoryId==="ALL"&&styles.categoryVisualCardActive]} onPress={()=>setSelectedCategoryId("ALL")}><View style={styles.categoryVisualFallback}><Text style={styles.categoryVisualEmoji}>🍽️</Text></View><Text numberOfLines={1} style={[styles.categoryVisualText,selectedCategoryId==="ALL"&&styles.categoryVisualTextActive]}>Todos</Text></Pressable>
        {menuCategories.map(category=><Pressable key={category.id} style={[styles.categoryVisualCard,selectedCategoryId===category.id&&styles.categoryVisualCardActive]} onPress={()=>setSelectedCategoryId(category.id)}>{category.image_url?<Image source={{uri:category.image_url}} style={styles.categoryVisualImage}/>:<View style={styles.categoryVisualFallback}><Text style={styles.categoryVisualEmoji}>🍴</Text></View>}<Text numberOfLines={1} style={[styles.categoryVisualText,selectedCategoryId===category.id&&styles.categoryVisualTextActive]}>{category.name}</Text></Pressable>)}
        {hasUncategorized&&<Pressable style={[styles.categoryVisualCard,selectedCategoryId==="UNCATEGORIZED"&&styles.categoryVisualCardActive]} onPress={()=>setSelectedCategoryId("UNCATEGORIZED")}><View style={styles.categoryVisualFallback}><Text style={styles.categoryVisualEmoji}>✨</Text></View><Text numberOfLines={1} style={[styles.categoryVisualText,selectedCategoryId==="UNCATEGORIZED"&&styles.categoryVisualTextActive]}>Outros</Text></Pressable>}
      </ScrollView>}
      {selectedCategoryId!=="ALL"&&<View style={styles.categoryHeading}><Text style={styles.categoryHeadingTitle}>{selectedCategoryId==="UNCATEGORIZED"?"Outros":categories.find(c=>c.id===selectedCategoryId)?.name??"Cardápio"}</Text>{selectedCategoryId!=="UNCATEGORIZED"&&!!categories.find(c=>c.id===selectedCategoryId)?.description&&<Text style={styles.meta}>{categories.find(c=>c.id===selectedCategoryId)?.description}</Text>}</View>}
      <View style={styles.productGrid}>{visibleProducts.length?visibleProducts.map(product=>{
        const hasVariants=variantsFor(product.id).length>0;
        const hasOptions=groupsFor(product.id).length>0;
        const base=Number(product.promotional_price??product.price);
        const shown=displayProductPrice(product);
        const discounted=shown<base&&!hasVariants;
        const soldOut=product.control_inventory&&Number(product.stock_quantity??0)<=0;
        return <View style={[styles.productTile,soldOut&&styles.productTileSoldOut]} key={product.id}>
          {product.image_url?<Image source={{uri:product.image_url}} style={[styles.productImage,soldOut&&styles.productImageSoldOut]}/>:<View style={[styles.productImageFallback,soldOut&&styles.productImageSoldOut]}><Text style={styles.productImageFallbackText}>🍽️</Text></View>}
          <View style={{flex:1}}>
            <Text style={styles.productName}>{product.name}</Text><Text style={styles.meta}>{product.description||""}</Text>
            <Text style={styles.price}>{hasVariants?"A partir de ":""}{brl(shown)}</Text>
            {soldOut?<Text style={styles.soldOutText}>ESGOTADO</Text>:<>{(hasVariants||hasOptions)&&<Text style={styles.customHint}>{hasVariants?"Escolha tamanho":"Personalizável"}{hasVariants&&hasOptions?" • complementos":""}</Text>}{discounted&&<Text style={styles.discountHint}>Preço promocional aplicado</Text>}</>}
          </View>
          <Pressable disabled={soldOut} style={[styles.addButton,soldOut&&styles.addButtonSoldOut]} onPress={()=>beginProduct(product)}><Text style={styles.addText}>{soldOut?"×":"+"}</Text></Pressable>
        </View>;
      }):<Text style={styles.empty}>Nenhum produto disponível.</Text>}</View>

      {selectedProduct&&<ProductCustomizer
        product={selectedProduct}
        variants={variantsFor(selectedProduct.id)}
        groups={groupsFor(selectedProduct.id)}
        options={optionsFor(selectedProduct.id)}
        promotions={promotions}
        onCancel={()=>setSelectedProduct(null)}
        onAdd={addCustomized}
      />}

      <Modal visible={cartOpen} animationType="slide" onRequestClose={()=>setCartOpen(false)}><SafeAreaView style={styles.cartModalSafe}><View style={styles.cartModalHeader}><View style={{flex:1}}><Text style={styles.cartModalTitle}>Seu carrinho</Text><Text style={styles.cartModalSubtitle}>{selectedStore.name} • {cartQuantity} {cartQuantity===1?"item":"itens"}</Text></View><Pressable accessibilityLabel="Fechar carrinho" style={styles.cartModalClose} onPress={()=>setCartOpen(false)}><Text style={styles.cartModalCloseText}>×</Text></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.cartModalScroll}>{!!message&&<Text style={styles.notice}>{message}</Text>}<Text style={styles.section}>Itens do pedido</Text>
      {cart.length?cart.map(item=>{
        const extras=item.options.reduce((s,o)=>s+o.price*o.quantity,0);
        return <View style={styles.cartRow} key={item.cartKey}>
          <View style={{flex:1}}>
            <Text style={styles.productName}>{item.quantity}× {item.productName}{item.variantName?` • ${item.variantName}`:""}</Text>
            {!!item.options.length&&<Text style={styles.cartOptions}>{item.options.map(o=>`${o.quantity}× ${o.name}`).join(" • ")}</Text>}
            {!!item.notes&&<Text style={styles.cartOptions}>Obs.: {item.notes}</Text>}
            <Text style={styles.price}>{brl((item.unitPrice+extras)*item.quantity)}</Text>
          </View>
          <View style={styles.qty}><Pressable onPress={()=>changeQty(item.cartKey,-1)}><Text>−</Text></Pressable><Text>{item.quantity}</Text><Pressable onPress={()=>changeQty(item.cartKey,1)}><Text>+</Text></Pressable></View>
        </View>;
      }):<Text style={styles.empty}>Sua sacola está vazia. Adicione itens para continuar.</Text>}
      {!!cart.length&&<View style={[styles.minimumOrderCard,minimumMissing>0?styles.minimumOrderPending:styles.minimumOrderReached]}><Text style={styles.minimumOrderTitle}>{minimumMissing>0?`Faltam ${brl(minimumMissing)} para o pedido mínimo`:"✓ Pedido mínimo atingido"}</Text><Text style={styles.minimumOrderMeta}>Mínimo da loja: {brl(selectedStore.minimum_order)} • Itens: {brl(cartSubtotal)}</Text></View>}

      {(selectedStore.clickfood_delivery_enabled||selectedStore.own_delivery_enabled||selectedStore.pickup_enabled)&&<View style={styles.segment}>
        {(selectedStore.clickfood_delivery_enabled||selectedStore.own_delivery_enabled)&&<Pressable style={[styles.segmentButton,deliveryType==="DELIVERY"&&styles.segmentActive]} onPress={()=>setDeliveryType("DELIVERY")}><Text style={deliveryType==="DELIVERY"?styles.segmentActiveText:undefined}>Entrega</Text></Pressable>}
        {selectedStore.pickup_enabled&&<Pressable style={[styles.segmentButton,deliveryType==="PICKUP"&&styles.segmentActive]} onPress={()=>setDeliveryType("PICKUP")}><Text style={deliveryType==="PICKUP"?styles.segmentActiveText:undefined}>Retirar na loja</Text></Pressable>}
      </View>}

      {deliveryType==="DELIVERY"&&<>
        <Text style={styles.section}>Endereço de entrega</Text>
        {addresses.map(address=><Pressable key={address.id} style={[styles.addressCard,selectedAddressId===address.id&&styles.addressSelected]} onPress={()=>setSelectedAddressId(address.id)}>
          <Text style={styles.productName}>{address.label||"Endereço"}</Text><Text style={styles.meta}>{address.street}, {address.number}{address.district?` • ${address.district}`:""}</Text>
        </Pressable>)}
        {!!selectedAddressId&&<Text style={styles.freightAutoHint}>{deliveryPreviewBusy?"Calculando frete automaticamente...":deliveryPreviewUsable&&deliveryPreview?(freeDeliveryApplies&&deliveryPreview.fee>0?`Frete grátis • economia de ${brl(deliveryPreview.fee)}`:`Frete calculado automaticamente: ${brl(deliveryPreview.fee)}`):"O frete será calculado automaticamente ao finalizar o pedido."}</Text>}
        {!addresses.length&&<Text style={styles.notice}>Você ainda não possui endereço salvo. Use o menu ☰ no topo e abra “Meus endereços” para cadastrar o local exato no mapa.</Text>}
        <Text style={styles.meta}>Para adicionar, editar ou ajustar a localização GPS, use Menu ☰ → Meus endereços.</Text>
      </>}

      <Text style={styles.section}>Cupom</Text>
      <TextInput style={styles.input} placeholder="Digite o código do cupom" autoCapitalize="characters" value={coupon} onChangeText={setCoupon}/>
      <Text style={styles.section}>Forma de pagamento</Text>
      <View style={styles.segment}>
        <Pressable style={[styles.segmentButton,paymentMethod==="CASH"&&styles.segmentActive]} onPress={()=>setPaymentMethod("CASH")}><Text style={paymentMethod==="CASH"?styles.segmentActiveText:undefined}>Dinheiro</Text></Pressable>
        {availablePaymentMethods.includes("PIX")&&<Pressable style={[styles.segmentButton,paymentMethod==="PIX"&&styles.segmentActive]} onPress={()=>setPaymentMethod("PIX")}><Text style={paymentMethod==="PIX"?styles.segmentActiveText:undefined}>PIX • Efí</Text></Pressable>}
        {availablePaymentMethods.includes("CREDIT_CARD")&&cardTokenization&&<Pressable style={[styles.segmentButton,paymentMethod==="CREDIT_CARD"&&styles.segmentActive]} onPress={()=>setPaymentMethod("CREDIT_CARD")}><Text style={paymentMethod==="CREDIT_CARD"?styles.segmentActiveText:undefined}>Cartão • Efí</Text></Pressable>}
      </View>
      {!availablePaymentMethods.includes("PIX")&&<Text style={styles.meta}>PIX será exibido automaticamente quando a Efí Bank estiver ativada pela Matriz.</Text>}
      <View style={styles.totalBox}><View style={styles.checkoutSummaryRow}><Text style={styles.checkoutSummaryLabel}>Itens</Text><Text style={styles.checkoutSummaryValue}>{brl(cartSubtotal)}</Text></View><View style={styles.checkoutSummaryRow}><Text style={styles.checkoutSummaryLabel}>{deliveryType==="PICKUP"?"Retirada":"Frete"}</Text><Text style={styles.checkoutSummaryValue}>{deliveryType==="PICKUP"?"Grátis":estimatedDeliveryFee==null?"Calcule acima":estimatedDeliveryFee===0?"Grátis":brl(estimatedDeliveryFee)}</Text></View>{deliveryType==="DELIVERY"&&deliveryPreviewUsable&&deliveryPreview&&freeDeliveryApplies&&deliveryPreview.fee>0&&<Text style={styles.checkoutSaving}>Você economiza {brl(deliveryPreview.fee)} no frete com a promoção ativa.</Text>}<View style={styles.checkoutDivider}/><Text style={styles.checkoutTotalLabel}>Total estimado antes do cupom</Text><Text style={styles.total}>{brl(checkoutEstimatedTotal)}</Text><Text style={styles.paymentHint}>O servidor recalcula preços, promoções, adicionais, frete, estoque e cupom antes de criar o pedido. {paymentMethod==="PIX"?"No PIX, o pedido só é enviado à loja após a confirmação da Efí.":paymentMethod==="CREDIT_CARD"?"No cartão, número e CVV são tokenizados pela Efí dentro de uma tela segura e não ficam armazenados no CLICK-FOOD.":"No dinheiro, o pedido segue diretamente para a loja."}</Text></View>
      <Pressable style={styles.continueShopping} onPress={()=>setCartOpen(false)}><Text style={styles.continueShoppingText}>CONTINUAR COMPRANDO</Text></Pressable><Pressable style={[styles.checkout,(!cart.length||minimumMissing>0||!selectedStore.open_now||(deliveryType==="DELIVERY"&&!selectedAddressId)||(!selectedStore.pickup_enabled&&!selectedStore.clickfood_delivery_enabled&&!selectedStore.own_delivery_enabled))&&styles.disabled]} disabled={!cart.length||minimumMissing>0||placing||!selectedStore.open_now||(deliveryType==="DELIVERY"&&!selectedAddressId)||(!selectedStore.pickup_enabled&&!selectedStore.clickfood_delivery_enabled&&!selectedStore.own_delivery_enabled)} onPress={placeOrder}><Text style={styles.checkoutText}>{selectedStore.orders_paused?"PEDIDOS PAUSADOS":!selectedStore.open_now?"LOJA FECHADA":!selectedStore.pickup_enabled&&!selectedStore.clickfood_delivery_enabled&&!selectedStore.own_delivery_enabled?"PEDIDOS INDISPONÍVEIS":minimumMissing>0?`FALTAM ${brl(minimumMissing)}`:deliveryType==="DELIVERY"&&!selectedAddressId?"SELECIONE UM ENDEREÇO":placing?"FINALIZANDO...":"FINALIZAR PEDIDO"}</Text></Pressable></ScrollView></SafeAreaView></Modal>
    </ScrollView>
    {!!cart.length&&<Pressable accessibilityRole="button" accessibilityLabel={`Abrir carrinho com ${cartQuantity} itens`} style={styles.floatingCartTop} onPress={()=>setCartOpen(true)}><View style={styles.floatingCartLeft}><Text style={styles.floatingCartIcon}>🛒</Text><View><Text style={styles.floatingCartTitle}>Carrinho <Text style={styles.floatingCartBadge}>{cartQuantity}</Text></Text><Text style={styles.floatingCartMeta}>Toque para revisar ou finalizar</Text></View></View><Text style={styles.floatingCartPrice}>{brl(cartSubtotal)}</Text></Pressable>}
    {pendingCardOrder&&cardTokenization&&<EfiCardPayment visible config={cardTokenization} order={pendingCardOrder} defaults={{name:String(session.user.user_metadata?.full_name??""),email:String(session.user.email??""),phone:String(session.user.user_metadata?.phone??"")}} onCancel={cancelPendingCardPayment} onComplete={completeCardPayment}/>}
    </SafeAreaView>;
  }

  const renderStoreCard=(store:Store)=>{
    const deliveryEnabled=store.clickfood_delivery_enabled||store.own_delivery_enabled;
    const orderingEnabled=deliveryEnabled||store.pickup_enabled;
    return <Pressable style={[styles.discoveryCard,!orderingEnabled&&styles.discoveryCardUnavailable]} key={store.id} onPress={()=>openStore(store)}>
      {store.cover_url?<Image source={{uri:store.cover_url}} style={styles.discoveryCover}/>:<View style={[styles.discoveryCoverFallback,{backgroundColor:store.secondary_color||"#111"}]}><Text style={[styles.discoveryCoverText,{color:store.primary_color||"#f4c400"}]}>CLICK-FOOD</Text></View>}
      <View style={styles.discoveryBody}>
        <View style={styles.discoveryTopRow}>
          {store.logo_url?<Image source={{uri:store.logo_url}} style={styles.discoveryLogo}/>:<View style={[styles.discoveryLogoFallback,{backgroundColor:store.primary_color||"#f4c400"}]}><Text style={styles.discoveryLogoText}>CF</Text></View>}
          <View style={styles.discoveryTitleBlock}>{!!store.slogan&&<Text numberOfLines={1} style={styles.discoverySlogan}>{store.slogan}</Text>}<Text numberOfLines={1} style={styles.discoveryName}>{store.name}</Text></View>
          <Text style={[styles.storeStatus,store.open_now&&orderingEnabled?styles.storeOpen:styles.storeClosed]}>{!orderingEnabled?"INDISPONÍVEL":store.orders_paused?"PAUSADA":store.open_now?"ABERTA":"FECHADA"}</Text><Pressable accessibilityLabel={favoriteStoreIds.has(store.id)?"Remover dos favoritos":"Adicionar aos favoritos"} style={styles.favoriteButton} onPress={event=>{event.stopPropagation?.();void toggleFavoriteStore(store.id);}}><Text style={[styles.favoriteText,favoriteStoreIds.has(store.id)&&styles.favoriteTextActive]}>{favoriteStoreIds.has(store.id)?"♥":"♡"}</Text></Pressable>
        </View>
        <Text numberOfLines={2} style={styles.discoveryDescription}>{store.description||"Cardápio disponível no CLICK-FOOD"}</Text>
        <View style={styles.discoveryServices}>{store.clickfood_delivery_enabled&&<View style={styles.discoveryServiceChip}><Text style={styles.discoveryServiceText}>🛵 CLICK-FOOD</Text></View>}{store.own_delivery_enabled&&<View style={styles.discoveryServiceChip}><Text style={styles.discoveryServiceText}>🏪 Entrega da loja</Text></View>}{store.pickup_enabled&&<View style={styles.discoveryServiceChip}><Text style={styles.discoveryServiceText}>🥡 Retirada</Text></View>}{store.max_radius_km!=null&&deliveryEnabled&&<View style={styles.discoveryServiceChip}><Text style={styles.discoveryServiceText}>Até {store.max_radius_km} km</Text></View>}</View>
        <View style={styles.discoveryMetaRow}><Text style={styles.discoveryMeta}>Pedido mínimo {brl(store.minimum_order)}</Text><Text style={styles.discoveryDot}>•</Text><Text style={styles.discoveryMeta}>Preparo ~{store.average_preparation_time} min</Text></View>
        {!orderingEnabled&&<Text style={styles.discoveryUnavailableText}>Pedidos temporariamente indisponíveis</Text>}
        {store.orders_paused&&orderingEnabled&&<Text style={styles.discoveryUnavailableText}>Novos pedidos pausados temporariamente</Text>}
      </View>
    </Pressable>;
  };

  const quickCategories=[{label:"Promoções",icon:"🏷️",query:"promo"},{label:"Lanches",icon:"🍔",query:"lanche"},{label:"Pizzas",icon:"🍕",query:"pizza"},{label:"Bebidas",icon:"🥤",query:"bebida"},{label:"Doces",icon:"🧁",query:"doce"}];
  const featuredStores=stores.slice(0,2);
  const featuredProducts=homeFeaturedProducts.slice(0,2);
  const favoriteStores=stores.filter(store=>favoriteStoreIds.has(store.id));

  const home=<ScrollView contentContainerStyle={styles.scroll}>
    <Pressable style={styles.searchBox} onPress={()=>{setQuery("");setTab("search");}}><Text style={styles.searchText}>⌕  Buscar produtos, lojas...</Text><Text style={styles.searchChevron}>⌕</Text></Pressable>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickCategoriesRow}>{quickCategories.map(item=><Pressable key={item.label} style={styles.quickCategory} onPress={()=>{setQuery(item.query);setTab("search");}}><View style={styles.quickCategoryIcon}><Text style={styles.quickCategoryEmoji}>{item.icon}</Text></View><Text style={styles.quickCategoryLabel}>{item.label}</Text></Pressable>)}</ScrollView>
    <View style={styles.sectionHeader}><Text style={styles.section}>Destaques</Text><Pressable onPress={()=>{setQuery("");setTab("search");}}><Text style={styles.sectionLink}>Ver mais ›</Text></Pressable></View>
    <View style={styles.featuredGrid}>{featuredProducts.length?featuredProducts.map(product=>{const store=stores.find(item=>item.id===product.storeId);const displayPrice=product.promotionalPrice!=null&&product.promotionalPrice>0?product.promotionalPrice:product.price;return <Pressable key={product.id} style={styles.featuredCard} onPress={()=>store&&openStore(store)}>{product.imageUrl?<Image source={{uri:product.imageUrl}} style={styles.featuredImage}/>:<View style={styles.featuredImageFallback}><Text style={styles.featuredImageEmoji}>🍽️</Text></View>}<View style={styles.featuredBody}><Text numberOfLines={1} style={styles.featuredName}>{product.name}</Text><Text numberOfLines={1} style={styles.featuredMeta}>{product.storeName}</Text><Text style={styles.featuredPrep}>⏱ {store?.average_preparation_time??30} min</Text><View style={styles.featuredBottom}><Text style={styles.featuredPrice}>{brl(displayPrice)}</Text><View style={styles.featuredPlus}><Text style={styles.featuredPlusText}>+</Text></View></View></View></Pressable>}):featuredStores.map(store=><Pressable key={store.id} style={styles.featuredCard} onPress={()=>openStore(store)}>{store.cover_url?<Image source={{uri:store.cover_url}} style={styles.featuredImage}/>:<View style={[styles.featuredImageFallback,{backgroundColor:store.secondary_color||"#111"}]}><Text style={{color:store.primary_color||"#f4c400",fontWeight:"900"}}>CLICK-FOOD</Text></View>}<View style={styles.featuredBody}><Text numberOfLines={1} style={styles.featuredName}>{store.name}</Text><Text numberOfLines={1} style={styles.featuredMeta}>{store.slogan||"Delivery CLICK-FOOD"}</Text><View style={styles.featuredBottom}><Text style={styles.featuredPrice}>mín. {brl(store.minimum_order)}</Text><View style={styles.featuredPlus}><Text style={styles.featuredPlusText}>+</Text></View></View></View></Pressable>)}</View>
    <View style={styles.sectionHeader}><Text style={styles.section}>Lojas próximas</Text><Pressable onPress={()=>{setQuery("");setTab("search");}}><Text style={styles.sectionLink}>Ver mais ›</Text></Pressable></View>
    {stores.length?stores.map(renderStoreCard):<Text style={styles.empty}>Ainda não há lojas ativas.</Text>}
  </ScrollView>;

  const search=<ScrollView contentContainerStyle={styles.scroll}>
    <Text style={styles.pageTitle}>Buscar</Text><TextInput style={styles.input} autoFocus placeholder="Nome da loja ou tipo de comida" value={query} onChangeText={setQuery}/>
    {filtered.length?filtered.map(renderStoreCard):<Text style={styles.empty}>Nenhuma loja encontrada.</Text>}
  </ScrollView>;

  const favorites=<ScrollView contentContainerStyle={styles.scroll}><View style={styles.sectionHeader}><Text style={styles.pageTitle}>Favoritos</Text><Text style={styles.favoriteCounter}>{favoriteStores.length}</Text></View>{favoriteStores.length?favoriteStores.map(renderStoreCard):<View style={styles.favoritesEmpty}><Text style={styles.favoritesEmptyIcon}>♡</Text><Text style={styles.favoritesEmptyTitle}>Nenhuma loja favorita</Text><Text style={styles.favoritesEmptyText}>Toque no coração de uma loja para encontrá-la rapidamente aqui.</Text></View>}</ScrollView>;

  const trackedOrder=tracking?orders.find(order=>order.id===tracking.orderId):null;
  const mapCenter=tracking?tracking.driverLat!=null&&tracking.driverLng!=null?{latitude:tracking.driverLat,longitude:tracking.driverLng}:tracking.storeLat!=null&&tracking.storeLng!=null?{latitude:tracking.storeLat,longitude:tracking.storeLng}:tracking.destinationLat!=null&&tracking.destinationLng!=null?{latitude:tracking.destinationLat,longitude:tracking.destinationLng}:null:null;

  const ordersView=<ScrollView contentContainerStyle={styles.scroll}>
    <View style={styles.rowBetween}><Text style={styles.pageTitle}>{tracking&&trackedOrder?"Meu Pedido":"Meus pedidos"}</Text><Pressable onPress={loadOrders}><Text style={styles.link}>Atualizar</Text></Pressable></View>{!!message&&<Text style={styles.notice}>{message}</Text>}
    {pixCharge&&<PixPaymentCard charge={pixCharge} busy={pixBusy} onRefresh={()=>refreshPix(pixCharge.orderId)}/>}
    {tracking&&trackedOrder&&<View style={styles.trackingCard}>
      {tracking.deliveryStatus==="DRIVER_AT_CUSTOMER"&&<View style={styles.arrivedBanner}><Text style={styles.arrivedTitle}>Seu motorista chegou!</Text><Text style={styles.arrivedText}>Dirija-se ao local combinado para receber o pedido.</Text></View>}
      <Text style={styles.trackingKicker}>ACOMPANHAMENTO EM TEMPO REAL</Text><Text style={styles.trackingTitle}>Pedido #{trackedOrder.order_number}</Text><Text style={styles.trackingStatus}>{statusLabel[trackedOrder.status]??trackedOrder.status}</Text><TrackingTimeline status={trackedOrder.status}/>
      {driverCard&&<View style={styles.driverCardBox}>{driverCard.avatarUrl?<Image source={{uri:driverCard.avatarUrl}} style={styles.driverAvatar}/>:<View style={styles.driverAvatarFallback}><Text style={styles.driverAvatarInitials}>{driverCard.name.slice(0,2).toUpperCase()}</Text></View>}<View style={styles.driverCardBody}><Text style={styles.driverCardName}>{driverCard.name}</Text><Text style={styles.driverCardMeta}>★ {driverCard.rating.toFixed(1)}{driverCard.vehicle?` • ${driverCard.vehicle.type==="MOTORCYCLE"?"Moto":driverCard.vehicle.type==="CAR"?"Carro":driverCard.vehicle.type==="BICYCLE"?"Bicicleta":driverCard.vehicle.type}${driverCard.vehicle.brand||driverCard.vehicle.model?` • ${[driverCard.vehicle.brand,driverCard.vehicle.model].filter(Boolean).join(" ")}`:""}${driverCard.vehicle.plate?` • ${driverCard.vehicle.plate}`:""}`:""}</Text></View></View>}
      {deliveryCodeBusy&&<View style={styles.deliveryCodeLoading}><Text style={styles.deliveryCodeLoadingText}>Preparando seu código de entrega...</Text></View>}{tracking.deliveryStatus==="DRIVER_AT_CUSTOMER"&&!deliveryCode&&!deliveryCodeBusy&&<View style={styles.deliveryCodeRetry}><Text style={styles.deliveryCodeRetryText}>O código ainda não apareceu.</Text><Pressable style={styles.deliveryCodeRetryButton} onPress={()=>void fetchDeliveryCode(tracking.deliveryId)}><Text style={styles.deliveryCodeRetryButtonText}>GERAR CÓDIGO AGORA</Text></Pressable></View>}
      {!!deliveryCode&&<View style={styles.deliveryCodeCard}><Text style={styles.deliveryCodeKicker}>CÓDIGO DA ENTREGA</Text><View style={styles.deliveryCodeDigits}>{deliveryCode.split("").map((digit,index)=><View key={`${digit}-${index}`} style={styles.deliveryCodeDigit}><Text selectable style={styles.deliveryCodeDigitText}>{digit}</Text></View>)}</View><Text style={styles.deliveryCodeHint}>Informe este código ao entregador somente quando ele estiver com você. A entrega só será liberada após ele digitar os 4 números.</Text></View>}
      {tracking.driverId&&<Pressable style={styles.trackDeliveryButton} onPress={()=>setTrackingMapOpen(true)}><Text style={styles.trackDeliveryButtonText}>⌖ RASTREAR ENTREGA</Text></Pressable>}
      {!tracking.driverId&&<Text style={styles.liveHint}>Assim que um entregador aceitar o chamado, o rastreamento ficará disponível.</Text>}
    </View>}
    {orders.length?orders.map(order=>{
      const rel=Array.isArray(order.stores)?order.stores[0]:order.stores;const reviewed=reviewedOrderIds.has(order.id);
      return <View style={styles.orderBlock} key={order.id}>
        <View style={styles.orderCard}><View style={{flex:1}}><Text style={styles.productName}>{rel?.name??"CLICK-FOOD"} • #{order.order_number}</Text><Text style={styles.meta}>{statusLabel[order.status]??order.status} • {paymentStatusLabel[order.payment_status]??order.payment_status}</Text></View><Text style={styles.price}>{brl(order.total)}</Text></View><OrderProgress status={order.status}/>
        {refundByOrder[order.id]&&<View style={[styles.refundBanner,refundByOrder[order.id].status==="COMPLETED"?styles.refundDone:refundByOrder[order.id].status==="FAILED"?styles.refundFailed:styles.refundPending]}><Text style={styles.refundText}>{refundStatusLabel[refundByOrder[order.id].status]??refundByOrder[order.id].status} • {brl(refundByOrder[order.id].amount)}</Text>{["PENDING","PROCESSING","FAILED"].includes(refundByOrder[order.id].status)&&<Pressable style={styles.refundButton} disabled={refundBusyOrderId===order.id} onPress={()=>reconcileRefund(order)}><Text style={styles.refundButtonText}>{refundBusyOrderId===order.id?"CONSULTANDO...":"ATUALIZAR ESTORNO"}</Text></Pressable>}</View>}
        {!refundByOrder[order.id]&&["CANCELLED","REJECTED"].includes(order.status)&&["PAID","PARTIALLY_REFUNDED"].includes(order.payment_status)&&<Pressable style={styles.refundButtonStandalone} disabled={refundBusyOrderId===order.id} onPress={()=>reconcileRefund(order)}><Text style={styles.refundButtonText}>{refundBusyOrderId===order.id?"CONSULTANDO...":"CONSULTAR ESTORNO PIX"}</Text></Pressable>}
        <Pressable style={styles.rateButton} onPress={()=>setReceiptOrderId(order.id)}><Text style={styles.rateText}>▤ VER COMPROVANTE</Text></Pressable>
        {cancellableStatuses.has(order.status)&&<Pressable style={styles.cancelButton} onPress={()=>cancelOrder(order)}><Text style={styles.cancelText}>CANCELAR PEDIDO</Text></Pressable>}
        {order.status==="DELIVERED"&&!reviewed&&ratingOrderId!==order.id&&<Pressable style={styles.rateButton} onPress={()=>{setRatingOrderId(order.id);setStars(5);setReviewComment("");}}><Text style={styles.rateText}>☆ AVALIAR PEDIDO</Text></Pressable>}
        {order.status==="DELIVERED"&&reviewed&&<Text style={styles.reviewed}>✓ Avaliação enviada</Text>}
        {ratingOrderId===order.id&&<View style={styles.reviewBox}><Text style={styles.formTitle}>Como foi seu pedido?</Text><View style={styles.stars}>{[1,2,3,4,5].map(value=><Pressable key={value} onPress={()=>setStars(value)}><Text style={[styles.star,value<=stars&&styles.starActive]}>★</Text></Pressable>)}</View><TextInput style={styles.input} placeholder="Comentário opcional" value={reviewComment} onChangeText={setReviewComment}/><Pressable style={[styles.checkout,submittingReview&&styles.disabled]} disabled={submittingReview} onPress={()=>submitReview(order)}><Text style={styles.checkoutText}>{submittingReview?"ENVIANDO...":"ENVIAR AVALIAÇÃO"}</Text></Pressable><Pressable onPress={()=>setRatingOrderId(null)}><Text style={styles.switchText}>Cancelar</Text></Pressable></View>}
      </View>;
    }):<Text style={styles.empty}>Nenhum pedido ainda.</Text>}
  </ScrollView>;

  const profile=<ScrollView contentContainerStyle={styles.scroll}>
    <Text style={styles.pageTitle}>Minha conta</Text>
    <View style={styles.profile}><View style={styles.avatar}><Text>{String(session.user.user_metadata?.full_name??"CF").slice(0,2).toUpperCase()}</Text></View><View><Text style={styles.productName}>{session.user.user_metadata?.full_name??"Cliente CLICK-FOOD"}</Text><Text style={styles.meta}>{session.user.email}</Text></View></View>
    {!!message&&<Text style={styles.notice}>{message}</Text>}
    <View style={styles.loyaltyHero}><View><Text style={styles.loyaltyKicker}>MEUS PONTOS</Text><Text style={styles.loyaltyTotal}>{loyaltyTotal}</Text></View><Text style={styles.loyaltyHeroEmoji}>★</Text></View>
    <Text style={styles.section}>Fidelidade</Text>
    {loyaltyWallets.length?loyaltyWallets.map(wallet=><View style={styles.loyaltyCard} key={wallet.id}>
      <View style={styles.loyaltyStoreRow}>{wallet.storeLogo?<Image source={{uri:wallet.storeLogo}} style={styles.loyaltyLogo}/>:<View style={styles.loyaltyLogoFallback}><Text style={styles.loyaltyLogoText}>CF</Text></View>}<View style={{flex:1}}><Text style={styles.productName}>{wallet.storeName}</Text><Text style={styles.meta}>{wallet.balance} pontos disponíveis{wallet.pointsPerCurrency>0?` • ${wallet.pointsPerCurrency} por R$ 1`:""}</Text></View></View>
      {!!wallet.rewards.length&&<><Text style={styles.loyaltySubtitle}>Recompensas</Text>{wallet.rewards.filter(reward=>["DISCOUNT_FIXED","DISCOUNT_PERCENTAGE","FREE_DELIVERY"].includes(reward.reward_type)).map(reward=>{const enough=wallet.balance>=Number(reward.points_cost);const detail=reward.reward_type==="FREE_DELIVERY"?"Entrega grátis":reward.reward_type==="DISCOUNT_PERCENTAGE"?`${Number(reward.reward_value??0)}% de desconto`:`${brl(Number(reward.reward_value??0))} de desconto`;return <View style={styles.loyaltyRewardRow} key={reward.id}><View style={{flex:1}}><Text style={styles.productName}>{reward.name}</Text><Text style={styles.meta}>{detail} • {reward.points_cost} pontos</Text>{!enough&&<Text style={styles.loyaltyMissing}>Faltam {Number(reward.points_cost)-wallet.balance} pontos</Text>}</View><Pressable style={[styles.loyaltyRedeem,!enough&&styles.disabled]} disabled={!enough||!!loyaltyBusyReward} onPress={()=>redeemLoyaltyReward(wallet,reward)}><Text style={styles.loyaltyRedeemText}>{loyaltyBusyReward===reward.id?"...":"RESGATAR"}</Text></Pressable></View>})}</>}
      {!!wallet.redemptions.length&&<><Text style={styles.loyaltySubtitle}>Meus cupons resgatados</Text>{wallet.redemptions.slice(0,5).map(item=><View style={styles.loyaltyCoupon} key={item.id}><View style={{flex:1}}><Text style={styles.productName}>{item.rewardName}</Text><Text selectable style={styles.loyaltyCode}>{item.coupon?.code??"Cupom indisponível"}</Text><Text style={styles.meta}>{item.status==="AVAILABLE"?"Disponível para uso":item.status==="USED"?"Utilizado":item.status==="EXPIRED"?"Expirado • pontos devolvidos":item.status}</Text></View><Text style={styles.loyaltyPointsSpent}>−{item.points_spent}</Text></View>)}</>}
    </View>):<Text style={styles.empty}>Você ainda não acumulou pontos. Pedidos entregues em lojas com fidelidade ativa geram pontos automaticamente.</Text>}
    <Text style={styles.section}>Endereços salvos</Text>{addresses.map(address=><View style={styles.addressCard} key={address.id}><Text style={styles.productName}>{address.label||"Endereço"}</Text><Text style={styles.meta}>{address.street}, {address.number}</Text></View>)}
    <DeleteAccountButton/>
    <Pressable style={styles.signOut} onPress={()=>supabase.auth.signOut()}><Text style={styles.signOutText}>SAIR</Text></Pressable>
  </ScrollView>;

  const support=<CustomerSupport/>;
  const screen=tab==="home"?home:tab==="search"?search:tab==="orders"?ordersView:tab==="favorites"?favorites:tab==="support"?support:profile;
  const tabs:Array<[Tab,string,string]>=[["home","⌂","Início"],["orders","▤","Pedidos"],["favorites","♡","Favoritos"],["profile","○","Perfil"]];
  return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content"/><View style={{flex:1}}>{screen}</View><Modal visible={trackingMapOpen&&!!tracking} animationType="slide" onRequestClose={()=>setTrackingMapOpen(false)}><SafeAreaView style={styles.trackingModalSafe}><View style={styles.trackingModalHeader}><View style={{flex:1}}><Text style={styles.trackingModalKicker}>CLICK-FOOD</Text><Text style={styles.trackingModalTitle}>Rastrear entrega</Text></View><Pressable style={styles.trackingModalClose} onPress={()=>setTrackingMapOpen(false)}><Text style={styles.trackingModalCloseText}>FECHAR</Text></Pressable></View>{tracking&&mapCenter?<MapView provider={Platform.OS==="android"?PROVIDER_GOOGLE:undefined} style={styles.trackingModalMap} region={{...mapCenter,latitudeDelta:0.018,longitudeDelta:0.018}} showsCompass toolbarEnabled={false}>{tracking.storeLat!=null&&tracking.storeLng!=null&&<Marker coordinate={{latitude:tracking.storeLat,longitude:tracking.storeLng}} title="Loja"><View style={styles.mapPin}><Text>🏪</Text></View></Marker>}{tracking.destinationLat!=null&&tracking.destinationLng!=null&&<Marker coordinate={{latitude:tracking.destinationLat,longitude:tracking.destinationLng}} title="Seu endereço"><View style={styles.mapPin}><Text>🏠</Text></View></Marker>}{tracking.driverLat!=null&&tracking.driverLng!=null&&<Marker coordinate={{latitude:tracking.driverLat,longitude:tracking.driverLng}} title="Seu entregador"><View style={styles.driverPin}><Text style={styles.driverEmoji}>🛵</Text></View></Marker>}</MapView>:<View style={styles.trackingModalWaiting}><Text style={styles.driverEmoji}>🛵</Text><Text style={styles.trackingModalWaitingText}>Aguardando a localização do entregador.</Text></View>}</SafeAreaView></Modal><CustomerOrderReceipt orderId={receiptOrderId} onClose={()=>setReceiptOrderId(null)}/><View style={styles.bottom}>{tabs.map(([key,icon,label])=><Pressable style={styles.tab} key={key} onPress={()=>setTab(key)}><Text style={[styles.tabIcon,tab===key&&styles.tabActive]}>{icon}</Text><Text style={[styles.tabLabel,tab===key&&styles.tabActive]}>{label}</Text></Pressable>)}</View></SafeAreaView>;
}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:"#f7f7f7"},center:{flex:1,alignItems:"center",justifyContent:"center",gap:10},scroll:{paddingHorizontal:14,paddingTop:12,paddingBottom:108},scrollWithBag:{paddingTop:82,paddingBottom:34},storeTopbar:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:8,minHeight:42},topCartButton:{minWidth:0,maxWidth:"72%",flexShrink:1,backgroundColor:"#111",borderRadius:14,paddingVertical:9,paddingHorizontal:11,flexDirection:"row",alignItems:"center",gap:8,borderWidth:1,borderColor:"#f4c400"},topCartIcon:{fontSize:20},topCartBody:{flex:1},topCartTitle:{color:"#f4c400",fontSize:11,fontWeight:"900"},topCartMeta:{color:"#fff",fontSize:9,fontWeight:"700",marginTop:2},topCartBadge:{minWidth:24,height:24,borderRadius:12,backgroundColor:"#f4c400",alignItems:"center",justifyContent:"center",paddingHorizontal:5},topCartBadgeText:{fontSize:10,fontWeight:"900",color:"#111"},cartModalSafe:{flex:1,backgroundColor:"#f7f7f7"},cartModalHeader:{backgroundColor:"#fff",padding:15,flexDirection:"row",alignItems:"center",gap:12,borderBottomWidth:1,borderBottomColor:"#e7e7e7"},cartModalTitle:{color:"#111",fontSize:22,fontWeight:"900"},cartModalSubtitle:{color:"#777",fontSize:10,marginTop:3},cartModalClose:{width:38,height:38,borderRadius:19,backgroundColor:"#f2f2f2",alignItems:"center",justifyContent:"center"},cartModalCloseText:{color:"#111",fontSize:26,lineHeight:28},cartModalScroll:{padding:16,paddingBottom:38},continueShopping:{borderWidth:1.5,borderColor:"#d6aa00",backgroundColor:"#fff",padding:14,borderRadius:12,alignItems:"center",marginTop:10,marginBottom:7},continueShoppingText:{fontSize:10,fontWeight:"900",color:"#9a7900"},authSafe:{flex:1,backgroundColor:"#f7f7f7"},authWrap:{flexGrow:1,justifyContent:"center",padding:26},
  brand:{fontSize:25,fontWeight:"900"},yellow:{color:"#f4c400"},kicker:{fontSize:10,fontWeight:"900",color:"#8b7000",letterSpacing:1.4,marginTop:7},authTitle:{fontSize:30,fontWeight:"900",marginVertical:22},
  input:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e1e1e1",borderRadius:13,padding:13,marginBottom:9},message:{backgroundColor:"#fff5d2",color:"#695400",padding:11,borderRadius:11,marginBottom:8},notice:{backgroundColor:"#fff5d2",color:"#695400",padding:12,borderRadius:12,marginVertical:12},
  darkButton:{backgroundColor:"#111",padding:15,borderRadius:13,alignItems:"center"},darkButtonText:{color:"#fff",fontWeight:"900"},switchText:{textAlign:"center",fontWeight:"800",color:"#8b7000",padding:17},disabled:{opacity:.5},
  header:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:18},avatar:{width:44,height:44,borderRadius:22,backgroundColor:"#f4c400",alignItems:"center",justifyContent:"center"},
  searchBox:{height:48,backgroundColor:"#fff",borderWidth:1,borderColor:"#e2e2e2",borderRadius:14,paddingHorizontal:14,marginBottom:14,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},hero:{backgroundColor:"#111",borderRadius:20,padding:18,flexDirection:"row",alignItems:"center"},heroKicker:{color:"#f4c400",fontWeight:"900",fontSize:10},heroTitle:{color:"#fff",fontSize:22,fontWeight:"900",marginTop:6},heroText:{color:"#aaa",fontSize:11,marginTop:7},heroEmoji:{fontSize:48},
  section:{fontSize:18,fontWeight:"900",marginTop:0,marginBottom:0,color:"#171717"},pageTitle:{fontSize:28,fontWeight:"900",marginBottom:18},storeCard:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e8e8e8",borderRadius:16,padding:13,flexDirection:"row",alignItems:"center",gap:12,marginBottom:9},storeIcon:{width:50,height:50,borderRadius:14,backgroundColor:"#f1f1f1",alignItems:"center",justifyContent:"center"},storeLogoCard:{width:50,height:50,borderRadius:14,backgroundColor:"#f1f1f1"},discoveryCard:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e6e6e6",borderRadius:15,overflow:"hidden",marginBottom:9,flexDirection:"row",minHeight:82},discoveryCardUnavailable:{opacity:.78},discoveryCover:{width:78,height:"100%",minHeight:82,backgroundColor:"#ececec"},discoveryCoverFallback:{width:78,minHeight:82,alignItems:"center",justifyContent:"center"},discoveryCoverText:{fontSize:20,fontWeight:"900",letterSpacing:1.2},discoveryBody:{padding:10,flex:1},discoveryTopRow:{flexDirection:"row",alignItems:"center",gap:10},discoveryLogo:{width:48,height:48,borderRadius:14,backgroundColor:"#eee"},discoveryLogoFallback:{width:48,height:48,borderRadius:14,alignItems:"center",justifyContent:"center"},discoveryLogoText:{fontSize:15,fontWeight:"900",color:"#111"},discoveryTitleBlock:{flex:1,minWidth:0},discoverySlogan:{fontSize:9,fontWeight:"900",color:"#8d7000",letterSpacing:.65,textTransform:"uppercase",marginBottom:2},discoveryName:{fontSize:16,fontWeight:"900",color:"#15171a"},discoveryDescription:{fontSize:10,color:"#707680",lineHeight:14,marginTop:5},discoveryServices:{flexDirection:"row",flexWrap:"wrap",gap:6,marginTop:10},discoveryServiceChip:{backgroundColor:"#f3f4f6",borderRadius:999,paddingHorizontal:8,paddingVertical:5},discoveryServiceText:{fontSize:8.5,fontWeight:"800",color:"#4d535b"},discoveryMetaRow:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:6,marginTop:11},discoveryMeta:{fontSize:10,fontWeight:"800",color:"#545b65"},discoveryDot:{fontSize:10,color:"#a0a5ac"},discoveryUnavailableText:{fontSize:10,fontWeight:"900",color:"#992f29",marginTop:9},storeTitle:{fontSize:28,fontWeight:"900",marginTop:4},storeCover:{width:"100%",height:160,borderRadius:18,marginTop:12,marginBottom:12,backgroundColor:"#ddd"},storeCoverFallback:{height:130,borderRadius:18,marginTop:12,marginBottom:12,backgroundColor:"#111",alignItems:"center",justifyContent:"center"},storeCoverFallbackText:{color:"#f4c400",fontSize:24,fontWeight:"900"},storeHeading:{flexDirection:"row",alignItems:"center",gap:12,marginBottom:4},storeLogo:{width:58,height:58,borderRadius:16,backgroundColor:"#eee"},storeLogoFallback:{width:58,height:58,borderRadius:16,backgroundColor:"#f4c400",alignItems:"center",justifyContent:"center"},storeLogoFallbackText:{fontWeight:"900",fontSize:18},
  storeStatus:{fontSize:9,fontWeight:"900",paddingHorizontal:7,paddingVertical:4,borderRadius:999,alignSelf:"flex-start",marginTop:6,overflow:"hidden"},storeOpen:{backgroundColor:"#ddf6e6",color:"#1d7342"},storeClosed:{backgroundColor:"#fde5e1",color:"#992f29"},storeStatusBanner:{padding:10,borderRadius:12,fontSize:11,fontWeight:"900",marginTop:10,textAlign:"center"},storeOpenBanner:{backgroundColor:"#ddf6e6",color:"#1d7342"},storeClosedBanner:{backgroundColor:"#fde5e1",color:"#992f29",padding:10,borderRadius:12,fontSize:11,fontWeight:"900",marginTop:10,textAlign:"center"},storeSlogan:{fontSize:10,fontWeight:"900",letterSpacing:.8,color:"#8d7000",textTransform:"uppercase"},storeAccent:{height:4,borderRadius:999,marginTop:8,marginBottom:8},serviceChips:{flexDirection:"row",flexWrap:"wrap",gap:6,marginTop:10},serviceChip:{backgroundColor:"#f0f1f3",borderRadius:999,paddingHorizontal:9,paddingVertical:6},serviceChipText:{fontSize:9,fontWeight:"800",color:"#4b5159"},
  productRow:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e8e8e8",borderRadius:15,padding:12,marginBottom:9,flexDirection:"row",alignItems:"center",gap:10},productImage:{width:"100%",height:118,borderRadius:12,backgroundColor:"#eee"},productImageFallback:{width:"100%",height:118,borderRadius:12,backgroundColor:"#f1f1f1",alignItems:"center",justifyContent:"center"},productImageFallbackText:{fontSize:28},productName:{fontWeight:"900",fontSize:13,color:"#171717"},meta:{color:"#777",fontSize:11,marginTop:4},price:{fontWeight:"900",color:"#111",marginTop:6,fontSize:13},addButton:{width:34,height:34,borderRadius:10,backgroundColor:"#f4c400",alignItems:"center",justifyContent:"center",alignSelf:"flex-end",marginTop:7},addText:{fontSize:24,fontWeight:"900"},
  customHint:{fontSize:10,color:"#555",fontWeight:"800",marginTop:4},discountHint:{fontSize:10,color:"#26804a",fontWeight:"800",marginTop:3},promoBanner:{backgroundColor:"#dcf7e7",color:"#17673b",padding:10,borderRadius:11,fontWeight:"800",fontSize:11,marginTop:12},offersHeader:{marginTop:18,marginBottom:9,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},offersKicker:{fontSize:9,fontWeight:"900",letterSpacing:1.1,color:"#9a6900"},offersTitle:{fontSize:20,fontWeight:"900",marginTop:2},offersEmoji:{fontSize:27},offersScroll:{marginHorizontal:-2,marginBottom:4},offersList:{gap:10,paddingHorizontal:2,paddingBottom:2},offerCard:{width:184,backgroundColor:"#111",borderRadius:17,overflow:"hidden"},offerImage:{width:"100%",height:92,backgroundColor:"#333"},offerImageFallback:{height:92,backgroundColor:"#292929",alignItems:"center",justifyContent:"center"},offerImageFallbackText:{fontSize:34},offerBody:{padding:11},offerBadge:{alignSelf:"flex-start",backgroundColor:"#f4c400",color:"#111",fontSize:9,fontWeight:"900",paddingHorizontal:8,paddingVertical:5,borderRadius:999,overflow:"hidden"},offerName:{color:"#fff",fontSize:14,fontWeight:"900",marginTop:8},offerMeta:{color:"#bfc2c7",fontSize:9.5,lineHeight:13,marginTop:4},categoryScroll:{marginHorizontal:-2,marginBottom:10},categoryVisualList:{gap:8,paddingHorizontal:2,paddingBottom:2},categoryVisualCard:{width:102,backgroundColor:"#fff",borderWidth:1,borderColor:"#e3e3e3",borderRadius:15,padding:6},categoryVisualCardActive:{backgroundColor:"#111",borderColor:"#111"},categoryVisualImage:{width:"100%",height:58,borderRadius:10,backgroundColor:"#eee"},categoryVisualFallback:{height:58,borderRadius:10,backgroundColor:"#f1f1f1",alignItems:"center",justifyContent:"center"},categoryVisualEmoji:{fontSize:26},categoryVisualText:{fontSize:10,fontWeight:"900",color:"#4b4f56",textAlign:"center",marginTop:7,marginBottom:2},categoryVisualTextActive:{color:"#f4c400"},categoryHeading:{backgroundColor:"#fffbea",borderRadius:14,padding:12,marginBottom:10},categoryHeadingTitle:{fontSize:17,fontWeight:"900"},
  cartRow:{backgroundColor:"#fff",borderRadius:14,padding:13,marginBottom:8,flexDirection:"row",alignItems:"center"},cartOptions:{fontSize:10,color:"#666",marginTop:4,lineHeight:14},qty:{flexDirection:"row",gap:14,alignItems:"center",borderWidth:1,borderColor:"#ddd",borderRadius:10,paddingVertical:8,paddingHorizontal:10},minimumOrderCard:{borderRadius:13,padding:12,marginTop:8,borderWidth:1},minimumOrderPending:{backgroundColor:"#fff7dd",borderColor:"#e9d386"},minimumOrderReached:{backgroundColor:"#e4f7ea",borderColor:"#a4d9b4"},minimumOrderTitle:{fontSize:12,fontWeight:"900",color:"#333"},minimumOrderMeta:{fontSize:9.5,color:"#666",marginTop:4},
  segment:{flexDirection:"row",gap:7,marginTop:18},segmentButton:{flex:1,borderWidth:1,borderColor:"#ddd",padding:12,borderRadius:12,alignItems:"center"},segmentActive:{backgroundColor:"#111",borderColor:"#111"},segmentActiveText:{color:"#fff",fontWeight:"900"},
  addressCard:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e2e2e2",borderRadius:13,padding:12,marginBottom:7},addressSelected:{borderColor:"#d4ae00",backgroundColor:"#fffbea"},freightAutoHint:{fontSize:10,color:"#5f5f5f",fontWeight:"700",backgroundColor:"#f3f3f3",borderRadius:10,padding:10,marginBottom:8},deliveryPreviewCard:{backgroundColor:"#111",borderRadius:15,padding:13,marginTop:10,flexDirection:"row",alignItems:"center",flexWrap:"wrap",gap:10},deliveryPreviewTitle:{color:"#fff",fontSize:12,fontWeight:"900"},deliveryPreviewMeta:{color:"#b8bcc2",fontSize:9.5,lineHeight:13,marginTop:4},deliveryPreviewPrice:{color:"#f4c400",fontSize:16,fontWeight:"900"},deliveryPreviewButton:{width:"100%",backgroundColor:"#f4c400",borderRadius:10,paddingVertical:10,alignItems:"center"},deliveryPreviewButtonText:{fontSize:10,fontWeight:"900",color:"#111"},addressForm:{backgroundColor:"#eeeae0",borderRadius:16,padding:14,marginTop:10},formTitle:{fontWeight:"900",marginBottom:10},
  secondaryButton:{backgroundColor:"#fff",borderWidth:1,borderColor:"#ccc",padding:13,borderRadius:12,alignItems:"center"},secondaryText:{fontWeight:"900"},totalBox:{backgroundColor:"#fff",padding:16,borderRadius:15,marginTop:12},checkoutSummaryRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:8},checkoutSummaryLabel:{fontSize:11,color:"#666",fontWeight:"700"},checkoutSummaryValue:{fontSize:12,fontWeight:"900",color:"#222"},checkoutSaving:{fontSize:9.5,fontWeight:"800",color:"#24774b",marginTop:2,marginBottom:8},checkoutDivider:{height:1,backgroundColor:"#ececec",marginVertical:6},checkoutTotalLabel:{fontSize:10,color:"#777",fontWeight:"800"},total:{fontSize:25,fontWeight:"900",marginTop:4},paymentHint:{fontSize:10,color:"#777",marginTop:10,lineHeight:14},checkout:{backgroundColor:"#f4c400",padding:15,borderRadius:12,alignItems:"center",marginTop:9},checkoutText:{fontWeight:"900"},back:{fontWeight:"900",color:"#856a00",fontSize:15},empty:{color:"#777",paddingVertical:20,textAlign:"center"},
  orderBlock:{marginBottom:10},orderCard:{backgroundColor:"#fff",borderRadius:14,padding:14,flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:10},orderProgress:{backgroundColor:"#fff",borderRadius:12,paddingHorizontal:11,paddingTop:10,paddingBottom:9,marginTop:5,borderWidth:1,borderColor:"#ececec"},progressBars:{flexDirection:"row",gap:4},progressBar:{flex:1,height:6,borderRadius:999,backgroundColor:"#e3e3e3"},progressBarActive:{backgroundColor:"#f4c400"},progressLabels:{flexDirection:"row",gap:4,marginTop:6},progressLabel:{flex:1,textAlign:"center",fontSize:7.5,fontWeight:"800",color:"#999"},progressLabelActive:{color:"#5f4c00"},rowBetween:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},link:{color:"#8d7000",fontWeight:"900"},
  refundBanner:{marginTop:7,borderRadius:12,padding:11,borderWidth:1},refundPending:{backgroundColor:"#fff8dd",borderColor:"#ead47a"},refundDone:{backgroundColor:"#e2f7e9",borderColor:"#9fd7b1"},refundFailed:{backgroundColor:"#fde9e6",borderColor:"#e2aaa2"},refundText:{fontSize:11,fontWeight:"900",color:"#333"},refundButton:{marginTop:9,backgroundColor:"#111",borderRadius:9,paddingVertical:9,paddingHorizontal:11,alignSelf:"flex-start"},refundButtonStandalone:{marginTop:7,backgroundColor:"#111",borderRadius:10,padding:11,alignItems:"center"},refundButtonText:{color:"#fff",fontSize:10,fontWeight:"900"},
  trackingCard:{backgroundColor:"#fff",borderRadius:18,padding:14,marginBottom:14,borderWidth:1,borderColor:"#e6e6e6"},trackingKicker:{color:"#8d7000",fontWeight:"900",fontSize:9,letterSpacing:1.1},trackingTitle:{color:"#171717",fontSize:19,fontWeight:"900",marginTop:5},trackingStatus:{color:"#656565",fontSize:11,marginTop:4,marginBottom:10},driverCardBox:{backgroundColor:"#f7f7f7",borderRadius:13,padding:10,marginTop:10,marginBottom:10,flexDirection:"row",alignItems:"center",gap:10,borderWidth:1,borderColor:"#ededed"},driverAvatar:{width:48,height:48,borderRadius:24,backgroundColor:"#444"},driverAvatarFallback:{width:48,height:48,borderRadius:24,backgroundColor:"#f4c400",alignItems:"center",justifyContent:"center"},driverAvatarInitials:{fontWeight:"900",color:"#111"},driverCardBody:{flex:1},driverCardName:{color:"#171717",fontSize:14,fontWeight:"900"},driverCardMeta:{color:"#666",fontSize:10,marginTop:4},mapPin:{backgroundColor:"#fff",borderRadius:18,padding:7,borderWidth:2,borderColor:"#111"},driverPin:{backgroundColor:"#f4c400",borderRadius:22,padding:8,borderWidth:2,borderColor:"#111"},driverEmoji:{fontSize:25},liveHint:{color:"#aaa",fontSize:10,marginTop:9,lineHeight:14},arrivedBanner:{backgroundColor:"#f4c400",borderRadius:13,padding:13,marginBottom:12},arrivedTitle:{fontSize:18,fontWeight:"900"},arrivedText:{fontSize:11,marginTop:3},deliveryCodeLoading:{backgroundColor:"#242424",borderRadius:13,padding:12,marginBottom:10},deliveryCodeLoadingText:{color:"#ddd",fontSize:11,fontWeight:"800",textAlign:"center"},deliveryCodeRetry:{backgroundColor:"#fff5d2",borderRadius:12,padding:11,marginBottom:10,alignItems:"center"},deliveryCodeRetryText:{fontSize:10,color:"#6b5500",fontWeight:"800",marginBottom:8},deliveryCodeRetryButton:{backgroundColor:"#111",borderRadius:9,paddingVertical:9,paddingHorizontal:13},deliveryCodeRetryButtonText:{fontSize:9,color:"#f4c400",fontWeight:"900"},deliveryCodeCard:{backgroundColor:"#fffaf0",borderWidth:1,borderColor:"#f4c400",borderRadius:14,padding:13,marginTop:9,marginBottom:10,alignItems:"center"},deliveryCodeKicker:{fontSize:10,fontWeight:"900",color:"#806600",letterSpacing:.8},deliveryCodeValue:{fontSize:36,fontWeight:"900",letterSpacing:9,color:"#111",marginVertical:5},deliveryCodeHint:{fontSize:10,color:"#666",lineHeight:15,textAlign:"center",marginTop:9},trackDeliveryButton:{backgroundColor:"#f4c400",borderRadius:12,paddingVertical:14,alignItems:"center",marginTop:9},trackDeliveryButtonText:{color:"#111",fontSize:10,fontWeight:"900"},trackingModalSafe:{flex:1,backgroundColor:"#111"},trackingModalHeader:{backgroundColor:"#111",paddingHorizontal:16,paddingVertical:12,flexDirection:"row",alignItems:"center",gap:12},trackingModalKicker:{fontSize:9,color:"#f4c400",fontWeight:"900",letterSpacing:1.2},trackingModalTitle:{fontSize:20,color:"#fff",fontWeight:"900",marginTop:2},trackingModalClose:{backgroundColor:"#f4c400",borderRadius:11,paddingVertical:10,paddingHorizontal:13},trackingModalCloseText:{fontSize:9,fontWeight:"900",color:"#111"},trackingModalMap:{flex:1,width:"100%"},trackingModalWaiting:{flex:1,alignItems:"center",justifyContent:"center",padding:24,backgroundColor:"#f4f4f4"},trackingModalWaitingText:{marginTop:10,fontSize:12,color:"#555",textAlign:"center"},
  cancelButton:{borderWidth:1,borderColor:"#edc3c0",backgroundColor:"#fff",padding:10,borderRadius:10,alignItems:"center",marginTop:5},cancelText:{color:"#a32e28",fontWeight:"900",fontSize:10},rateButton:{backgroundColor:"#fff6cf",padding:10,borderRadius:10,alignItems:"center",marginTop:5},rateText:{color:"#745c00",fontWeight:"900",fontSize:10},reviewed:{color:"#24774b",fontWeight:"800",fontSize:11,padding:8},reviewBox:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e1d49d",borderRadius:14,padding:14,marginTop:5},stars:{flexDirection:"row",gap:7,marginBottom:12},star:{fontSize:34,color:"#ccc"},starActive:{color:"#f4c400"},
  profile:{backgroundColor:"#fff",padding:15,borderRadius:16,flexDirection:"row",alignItems:"center",gap:12},loyaltyHero:{backgroundColor:"#111",borderRadius:18,padding:18,marginTop:14,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},loyaltyKicker:{color:"#f4c400",fontSize:10,fontWeight:"900",letterSpacing:1.2},loyaltyTotal:{color:"#fff",fontSize:34,fontWeight:"900",marginTop:3},loyaltyHeroEmoji:{color:"#f4c400",fontSize:38},loyaltyCard:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e4e4e4",borderRadius:16,padding:13,marginBottom:10},loyaltyStoreRow:{flexDirection:"row",alignItems:"center",gap:10},loyaltyLogo:{width:44,height:44,borderRadius:12,backgroundColor:"#eee"},loyaltyLogoFallback:{width:44,height:44,borderRadius:12,backgroundColor:"#f4c400",alignItems:"center",justifyContent:"center"},loyaltyLogoText:{fontWeight:"900"},loyaltySubtitle:{fontSize:12,fontWeight:"900",marginTop:14,marginBottom:6},loyaltyRewardRow:{borderTopWidth:1,borderTopColor:"#eee",paddingVertical:10,flexDirection:"row",alignItems:"center",gap:8},loyaltyRedeem:{backgroundColor:"#111",borderRadius:9,paddingVertical:9,paddingHorizontal:10},loyaltyRedeemText:{color:"#f4c400",fontSize:9,fontWeight:"900"},loyaltyMissing:{fontSize:9,color:"#a86b00",fontWeight:"800",marginTop:3},loyaltyCoupon:{backgroundColor:"#fffbea",borderRadius:11,padding:10,marginTop:6,flexDirection:"row",alignItems:"center",gap:8},loyaltyCode:{fontSize:15,fontWeight:"900",letterSpacing:1,marginTop:4},loyaltyPointsSpent:{fontWeight:"900",color:"#a36d00"},signOut:{borderWidth:1,borderColor:"#e3b7b7",borderRadius:13,padding:14,marginTop:24,alignItems:"center"},signOutText:{color:"#9d2c2c",fontWeight:"900"},
  bagFloating:{position:"absolute",left:16,right:16,bottom:14,backgroundColor:"#111",borderRadius:16,paddingVertical:12,paddingHorizontal:15,flexDirection:"row",alignItems:"center",justifyContent:"space-between",borderWidth:2,borderColor:"#f4c400",elevation:8,shadowColor:"#000",shadowOpacity:.18,shadowRadius:10,shadowOffset:{width:0,height:4}},bagFloatingTitle:{color:"#f4c400",fontSize:12,fontWeight:"900",letterSpacing:.7},bagFloatingMeta:{color:"#fff",fontSize:10,fontWeight:"700",marginTop:2},bagFloatingTotal:{color:"#fff",fontSize:18,fontWeight:"900"},
  bottom:{minHeight:90,backgroundColor:"#fff",borderTopWidth:1,borderTopColor:"#e5e5e5",flexDirection:"row",paddingTop:6,paddingBottom:22},tab:{flex:1,alignItems:"center",justifyContent:"center"},tabIcon:{fontSize:19,color:"#777"},tabLabel:{fontSize:9,color:"#777",fontWeight:"700",marginTop:3},tabActive:{color:"#8d7000",fontWeight:"900"}
,
  storeTopTitle:{fontSize:14,fontWeight:"900",color:"#171717",maxWidth:"64%",textAlign:"center"},
  floatingCartTop:{position:"absolute",top:6,left:10,right:10,height:52,backgroundColor:"#f4c400",borderRadius:12,paddingHorizontal:14,flexDirection:"row",alignItems:"center",justifyContent:"space-between",zIndex:30,elevation:12,shadowColor:"#000",shadowOpacity:.16,shadowRadius:8,shadowOffset:{width:0,height:4}},
  floatingCartLeft:{flexDirection:"row",alignItems:"center",gap:10,flex:1},
  floatingCartIcon:{fontSize:22},
  floatingCartTitle:{color:"#111",fontSize:14,fontWeight:"900"},
  floatingCartBadge:{backgroundColor:"#fff",color:"#111",fontSize:10,fontWeight:"900"},
  floatingCartMeta:{color:"#5b4a00",fontSize:9,marginTop:2,fontWeight:"700"},
  floatingCartPrice:{color:"#111",fontSize:16,fontWeight:"900",marginLeft:8},
  searchText:{color:"#555",fontSize:12},
  searchChevron:{color:"#111",fontSize:17,fontWeight:"900"},
  quickCategoriesRow:{gap:12,paddingBottom:4,paddingHorizontal:1},
  quickCategory:{width:58,alignItems:"center"},
  quickCategoryIcon:{width:48,height:48,borderRadius:24,backgroundColor:"#fff5c7",borderWidth:1,borderColor:"#f4e39b",alignItems:"center",justifyContent:"center"},
  quickCategoryEmoji:{fontSize:23},
  quickCategoryLabel:{fontSize:9,fontWeight:"800",color:"#333",marginTop:5,textAlign:"center"},
  sectionHeader:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:18,marginBottom:9},
  sectionLink:{fontSize:10,color:"#777",fontWeight:"700"},
  featuredGrid:{flexDirection:"row",gap:10},
  featuredCard:{flex:1,backgroundColor:"#fff",borderWidth:1,borderColor:"#e6e6e6",borderRadius:14,overflow:"hidden"},
  featuredImage:{width:"100%",height:112,backgroundColor:"#eee"},
  featuredImageFallback:{width:"100%",height:112,alignItems:"center",justifyContent:"center"},
  featuredBody:{padding:9},
  featuredName:{fontSize:12,fontWeight:"900",color:"#171717"},
  featuredMeta:{fontSize:9,color:"#777",marginTop:3},
  featuredPrep:{fontSize:9,color:"#8a6d00",fontWeight:"800",marginTop:4},
  featuredImageEmoji:{fontSize:42},
  featuredBottom:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:9},
  featuredPrice:{fontSize:10,fontWeight:"900",color:"#111",flex:1},
  featuredPlus:{width:28,height:28,borderRadius:9,backgroundColor:"#f4c400",alignItems:"center",justifyContent:"center"},
  featuredPlusText:{fontSize:19,fontWeight:"900",color:"#111"},
  favoriteButton:{width:32,height:32,borderRadius:16,backgroundColor:"#fafafa",alignItems:"center",justifyContent:"center",marginLeft:2,borderWidth:1,borderColor:"#eee"},
  favoriteText:{fontSize:20,color:"#999"},
  favoriteTextActive:{color:"#d2a700"},
  favoriteCounter:{minWidth:30,height:30,borderRadius:15,backgroundColor:"#f4c400",fontWeight:"900",textAlign:"center",textAlignVertical:"center",paddingTop:6},
  favoritesEmpty:{alignItems:"center",justifyContent:"center",paddingVertical:70,paddingHorizontal:28},
  favoritesEmptyIcon:{fontSize:54,color:"#c7c7c7"},
  favoritesEmptyTitle:{fontSize:18,fontWeight:"900",marginTop:10,color:"#222"},
  favoritesEmptyText:{fontSize:11,color:"#777",textAlign:"center",lineHeight:17,marginTop:6},
  productGrid:{flexDirection:"row",flexWrap:"wrap",gap:10,alignItems:"stretch"},
  productTile:{width:"48%",backgroundColor:"#fff",borderWidth:1,borderColor:"#e7e7e7",borderRadius:14,padding:9,marginBottom:2},
  productTileSoldOut:{opacity:.62},productImageSoldOut:{opacity:.55},soldOutText:{marginTop:7,fontSize:10,fontWeight:"900",color:"#9b1c1c",letterSpacing:.7},addButtonSoldOut:{backgroundColor:"#bdbdbd"},
  timeline:{marginTop:3,marginBottom:6},
  timelineRow:{flexDirection:"row",minHeight:43},
  timelineRail:{width:28,alignItems:"center"},
  timelineDot:{width:20,height:20,borderRadius:10,borderWidth:2,borderColor:"#c9c9c9",backgroundColor:"#fff",alignItems:"center",justifyContent:"center",zIndex:2},
  timelineDotActive:{borderColor:"#d3a900",backgroundColor:"#f4c400"},
  timelineDotText:{fontSize:10,fontWeight:"900",color:"#aaa"},
  timelineDotTextActive:{color:"#111"},
  timelineLine:{position:"absolute",top:20,bottom:-23,width:2,backgroundColor:"#ddd"},
  timelineLineActive:{backgroundColor:"#f4c400"},
  timelineTextWrap:{flex:1,paddingTop:1,paddingBottom:9},
  timelineTitle:{fontSize:12,fontWeight:"800",color:"#9a9a9a"},
  timelineTitleActive:{color:"#222"},
  timelineCurrent:{fontSize:9,color:"#8d7000",fontWeight:"800",marginTop:2},
  deliveryCodeDigits:{flexDirection:"row",gap:7,justifyContent:"center",marginTop:10},
  deliveryCodeDigit:{width:48,height:52,borderRadius:10,backgroundColor:"#fff1b1",borderWidth:1,borderColor:"#f0d05c",alignItems:"center",justifyContent:"center"},
  deliveryCodeDigitText:{fontSize:25,fontWeight:"900",color:"#111"},
});