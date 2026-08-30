import React, { useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import * as Location from "expo-location";
import MapView, { Marker } from "react-native-maps";
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

type Tab = "home" | "search" | "orders" | "profile";
type Store = { id:string; name:string; description:string|null; logo_url:string|null; cover_url:string|null; minimum_order:number; average_preparation_time:number; timezone:string; open_now:boolean };
type ProductWithMedia = Product & { image_url:string|null };
type Address = { id:string; label:string|null; street:string; number:string|null; district:string|null; reference:string|null };
type StoreRelation = { name:string; latitude:number|null; longitude:number|null };
type Order = { id:string; order_number:number; store_id:string; address_id:string|null; delivery_type:string; total:number; status:string; payment_status:string; created_at:string; stores:StoreRelation|StoreRelation[]|null };
type RefundInfo = { payment_id:string; status:string; amount:number; reason:string|null; created_at:string; completed_at:string|null };
type CartItem = CustomizedItem & { cartKey:string };
type DeliveryType = "DELIVERY"|"PICKUP";
type PaymentMethod = "CASH"|"PIX";
type Tracking = { orderId:string; deliveryId:string; deliveryStatus:string; driverId:string|null; driverLat:number|null; driverLng:number|null; storeLat:number|null; storeLng:number|null; destinationLat:number|null; destinationLng:number|null };
type ProductGroupLink = { product_id:string; option_group_id:string };

const brl=(value:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value||0);
const terminalStatuses=new Set(["DELIVERED","CANCELLED","REJECTED"]);
const cancellableStatuses=new Set(["PENDING_PAYMENT","WAITING_STORE","ACCEPTED","PREPARING","READY","WAITING_DRIVER"]);
const statusLabel:Record<string,string>={PENDING_PAYMENT:"Aguardando pagamento",WAITING_STORE:"Aguardando a loja",ACCEPTED:"Pedido aceito",PREPARING:"Em preparação",READY:"Pronto",WAITING_DRIVER:"Procurando entregador",DRIVER_ASSIGNED:"Entregador confirmado",DRIVER_TO_STORE:"Entregador indo à loja",PICKUP_CONFIRMED:"Pedido retirado",DRIVER_TO_CUSTOMER:"A caminho de você",DRIVER_AT_CUSTOMER:"Seu motorista chegou",DELIVERED:"Entregue",CANCELLED:"Cancelado",REJECTED:"Recusado"};
const paymentStatusLabel:Record<string,string>={PENDING:"Pagamento pendente",PAID:"Pagamento confirmado",FAILED:"Pagamento falhou",CANCELLED:"Pagamento cancelado",PARTIALLY_REFUNDED:"Estorno parcial",REFUNDED:"Estornado"};
const refundStatusLabel:Record<string,string>={PENDING:"Estorno solicitado",PROCESSING:"Estorno em processamento",COMPLETED:"PIX devolvido",FAILED:"Falha no estorno",CANCELLED:"Estorno cancelado"};

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

export default function App(){
  const[session,setSession]=useState<Session|null>(null); const[loading,setLoading]=useState(true); const[tab,setTab]=useState<Tab>("home");
  const[stores,setStores]=useState<Store[]>([]); const[orders,setOrders]=useState<Order[]>([]); const[query,setQuery]=useState(""); const[message,setMessage]=useState("");
  const[selectedStore,setSelectedStore]=useState<Store|null>(null); const[products,setProducts]=useState<ProductWithMedia[]>([]); const[cart,setCart]=useState<CartItem[]>([]);
  const[variants,setVariants]=useState<CustomerVariant[]>([]); const[optionGroups,setOptionGroups]=useState<CustomerOptionGroup[]>([]); const[productOptions,setProductOptions]=useState<CustomerOption[]>([]); const[productGroupLinks,setProductGroupLinks]=useState<ProductGroupLink[]>([]); const[promotions,setPromotions]=useState<CustomerPromotion[]>([]); const[selectedProduct,setSelectedProduct]=useState<ProductWithMedia|null>(null);
  const[addresses,setAddresses]=useState<Address[]>([]); const[selectedAddressId,setSelectedAddressId]=useState(""); const[deliveryType,setDeliveryType]=useState<DeliveryType>("DELIVERY"); const[coupon,setCoupon]=useState(""); const[placing,setPlacing]=useState(false);
  const[paymentMethod,setPaymentMethod]=useState<PaymentMethod>("CASH"); const[availablePaymentMethods,setAvailablePaymentMethods]=useState<PaymentMethod[]>(["CASH"]); const[pixCharge,setPixCharge]=useState<PixCharge|null>(null); const[pixBusy,setPixBusy]=useState(false);
  const[refundByOrder,setRefundByOrder]=useState<Record<string,RefundInfo>>({}); const[refundBusyOrderId,setRefundBusyOrderId]=useState<string|null>(null);
  const[addressForm,setAddressForm]=useState({label:"Casa",street:"",number:"",district:"",reference:""}); const[savingAddress,setSavingAddress]=useState(false);
  const[tracking,setTracking]=useState<Tracking|null>(null); const[reviewedOrderIds,setReviewedOrderIds]=useState<Set<string>>(new Set()); const[ratingOrderId,setRatingOrderId]=useState<string|null>(null); const[stars,setStars]=useState(5); const[reviewComment,setReviewComment]=useState(""); const[submittingReview,setSubmittingReview]=useState(false);

  const cartSubtotal=useMemo(()=>cart.reduce((sum,item)=>{
    const extras=item.options.reduce((s,o)=>s+o.price*o.quantity,0);
    return sum+(item.unitPrice+extras)*item.quantity;
  },0),[cart]);

  useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false);});const{data}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));return()=>data.subscription.unsubscribe();},[]);
  useEffect(()=>{if(session){loadStores();loadOrders();loadAddresses();loadReviewed();loadPaymentMethods();}else{setTracking(null);setOrders([]);setPixCharge(null);}},[session]);
  useEffect(()=>{if(!session||tab!=="orders")return;const timer=setInterval(()=>loadOrders(),6000);return()=>clearInterval(timer);},[session?.user.id,tab]);
  useEffect(()=>{if(!session)return;const timer=setInterval(()=>loadStores(),60000);return()=>clearInterval(timer);},[session?.user.id]);

  async function loadStores(){
    const{data,error}=await supabase.functions.invoke("store-catalog");
    if(error||data?.error)return;
    const rows=(data?.stores??[]) as Store[];
    setStores(rows);
    setSelectedStore(current=>current?(rows.find(s=>s.id===current.id)??current):current);
  }

  async function loadPaymentMethods(){
    const{data,error}=await supabase.functions.invoke("payment-methods",{body:{}});
    if(error||data?.error){setAvailablePaymentMethods(["CASH"]);setPaymentMethod("CASH");return;}
    const methods=(data?.methods??[]).filter((m:string)=>m==="CASH"||m==="PIX") as PaymentMethod[];
    const next:PaymentMethod[]=methods.includes("CASH")?methods:(["CASH",...methods] as PaymentMethod[]);
    setAvailablePaymentMethods(next);setPaymentMethod(current=>next.includes(current)?current:"CASH");
  }

  async function loadPendingPix(currentOrders:Order[]){
    const pending=currentOrders.find(order=>order.status==="PENDING_PAYMENT"&&order.payment_status!=="PAID");
    if(!pending){setPixCharge(null);return;}
    const{data}=await supabase.from("efi_pix_charges").select("txid,brcode,status,expires_at").eq("order_id",pending.id).order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(data?.brcode)setPixCharge({orderId:pending.id,txid:data.txid,brcode:data.brcode,status:data.status,expires_at:data.expires_at});
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
    setOrders(rows);await Promise.all([loadPendingPix(rows),loadRefunds(rows),loadTracking(rows)]);
  }

  async function loadRefunds(currentOrders:Order[]){
    const orderIds=currentOrders.map(order=>order.id);
    if(!orderIds.length){setRefundByOrder({});return;}
    const{data:payments,error:paymentError}=await supabase.from("payments").select("id,order_id").in("order_id",orderIds).eq("method","PIX");
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

  async function loadTracking(currentOrders:Order[]){
    const activeOrder=currentOrders.find(order=>order.delivery_type==="DELIVERY"&&!terminalStatuses.has(order.status));
    if(!activeOrder){setTracking(null);return;}
    const{data:delivery}=await supabase.from("deliveries").select("id,status,driver_id").eq("order_id",activeOrder.id).maybeSingle();
    if(!delivery){setTracking(null);return;}
    const relation=Array.isArray(activeOrder.stores)?activeOrder.stores[0]:activeOrder.stores;
    let driverLat:number|null=null,driverLng:number|null=null,destinationLat:number|null=null,destinationLng:number|null=null;
    if(delivery.driver_id){
      const{data:location}=await supabase.from("driver_locations").select("latitude,longitude").eq("driver_id",delivery.driver_id).maybeSingle();
      if(location){driverLat=Number(location.latitude);driverLng=Number(location.longitude);}
    }
    if(activeOrder.address_id){
      const{data:address}=await supabase.from("customer_addresses").select("latitude,longitude").eq("id",activeOrder.address_id).maybeSingle();
      if(address){destinationLat=address.latitude==null?null:Number(address.latitude);destinationLng=address.longitude==null?null:Number(address.longitude);}
    }
    setTracking({orderId:activeOrder.id,deliveryId:delivery.id,deliveryStatus:delivery.status,driverId:delivery.driver_id,driverLat,driverLng,storeLat:relation?.latitude==null?null:Number(relation.latitude),storeLng:relation?.longitude==null?null:Number(relation.longitude),destinationLat,destinationLng});
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

  async function openStore(store:Store){
    setMessage("");setSelectedStore(store);setCart([]);setSelectedProduct(null);
    const{data,error}=await supabase.from("products").select("id,name,description,image_url,price,promotional_price").eq("store_id",store.id).eq("active",true).eq("available_delivery",true).order("name");
    if(error){setMessage("Não foi possível abrir o cardápio.");return;}
    const ps=(data??[]).map((p:any)=>({...p,price:Number(p.price),promotional_price:p.promotional_price==null?null:Number(p.promotional_price)})) as ProductWithMedia[];
    setProducts(ps);
    const productIds=ps.map(p=>p.id);
    if(!productIds.length){setVariants([]);setOptionGroups([]);setProductOptions([]);setProductGroupLinks([]);setPromotions([]);return;}
    const[vR,lR,promoR]=await Promise.all([
      supabase.from("product_variants").select("id,product_id,name,price,active").in("product_id",productIds).eq("active",true).order("sort_order").order("name"),
      supabase.from("product_option_groups").select("product_id,option_group_id").in("product_id",productIds),
      supabase.from("promotions").select("id,name,promotion_type,discount_value,product_id").eq("store_id",store.id).eq("active",true),
    ]);
    const loadedVariants=(vR.data??[]).map((v:any)=>({...v,price:Number(v.price)})) as CustomerVariant[];
    const links=(lR.data??[]) as ProductGroupLink[];
    setVariants(loadedVariants);setProductGroupLinks(links);
    setPromotions((promoR.data??[]).map((p:any)=>({...p,discount_value:Number(p.discount_value)})) as CustomerPromotion[]);
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
    setSelectedProduct(null);setMessage(`${item.productName} adicionado ao carrinho.`);
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

  async function placeOrder(){
    if(!session||!selectedStore||!cart.length)return;
    if(!selectedStore.open_now){setMessage("Esta loja está fechada agora. Você pode consultar o cardápio, mas o pedido só poderá ser enviado quando ela abrir.");return;}
    if(cartSubtotal<selectedStore.minimum_order){setMessage(`Pedido mínimo: ${brl(selectedStore.minimum_order)}.`);return;}
    if(deliveryType==="DELIVERY"&&!selectedAddressId){setMessage("Cadastre e selecione um endereço para entrega.");return;}
    setPlacing(true);setMessage("");
    let deliveryQuoteId:string|undefined;let deliveryFee=0;
    if(deliveryType==="DELIVERY"){
      const quoteResult=await supabase.functions.invoke("quote-delivery",{body:{storeId:selectedStore.id,addressId:selectedAddressId}});
      if(quoteResult.error||quoteResult.data?.error){
        const code=quoteResult.data?.error;
        const quoteErrors:Record<string,string>={OUTSIDE_DELIVERY_RADIUS:"Este endereço está fora da área de entrega.",STORE_CLOSED:"Esta loja está fechada agora. Consulte o horário e tente novamente quando ela abrir.",STORE_UNAVAILABLE:"Esta loja está temporariamente indisponível.",DELIVERY_DISABLED:"A loja não está aceitando entregas neste momento.",LOCATION_COORDINATES_REQUIRED:"Não foi possível calcular o frete porque faltam coordenadas da loja ou do endereço."};
        setMessage(quoteErrors[code]??"Não foi possível calcular o frete. Confira a localização do endereço.");setPlacing(false);return;
      }
      deliveryQuoteId=quoteResult.data.quote.id;deliveryFee=Number(quoteResult.data.quote.fee);
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
        INSUFFICIENT_STOCK:"Um dos produtos não possui quantidade suficiente em estoque.",
        INVENTORY_NOT_CONFIGURED:"Um produto com controle de estoque precisa ser ajustado pela loja antes da venda.",
        PRODUCT_UNAVAILABLE:"Um dos produtos ficou indisponível. Atualize o cardápio.",
      };
      setMessage(errors[code]??"Não foi possível enviar o pedido. Atualize o cardápio e tente novamente.");setPlacing(false);return;
    }
    const total=Number(result.data.total);
    const promo=Number(result.data.promotionDiscount??0);
    const orderId=String(result.data.orderId);
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
    }else{
      setMessage(`Pedido enviado! Total ${brl(total)}${deliveryFee?` • entrega calculada ${brl(deliveryFee)}`:""}${promo>0?` • economia ${brl(promo)}`:""}.`);
    }
    setCart([]);setCoupon("");setSelectedStore(null);setSelectedProduct(null);setTab("orders");await loadOrders();setPlacing(false);
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
          setMessage(refundStatus==="COMPLETED"?"Pedido cancelado e PIX devolvido com sucesso.":refundStatus==="FAILED"?"Pedido cancelado. A devolução do PIX precisa ser tentada novamente.":"Pedido cancelado. A devolução do PIX foi solicitada e está sendo processada.");
        }else setMessage("Pedido cancelado.");
        await loadOrders();
      }},
    ]);
  }

  async function reconcileRefund(order:Order){
    setRefundBusyOrderId(order.id);setMessage("");
    const{data,error}=await supabase.functions.invoke("efi-pix-refund",{body:{orderId:order.id,reason:"Reconciliação de estorno solicitada pelo cliente"}});
    if(error||data?.error){setMessage("Não foi possível consultar o estorno agora. Tente novamente em alguns minutos.");setRefundBusyOrderId(null);return;}
    const status=String(data?.refundStatus??"");
    setMessage(status==="COMPLETED"?"PIX devolvido com sucesso.":status==="FAILED"?"A Efí não concluiu a devolução. Você pode tentar novamente ou abrir o suporte.":"A devolução do PIX continua em processamento.");
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

  const filtered=useMemo(()=>stores.filter(store=>`${store.name} ${store.description??""}`.toLowerCase().includes(query.toLowerCase())),[stores,query]);

  if(loading)return <SafeAreaView style={styles.center}><Text style={styles.brand}><Text style={styles.yellow}>CLICK</Text>-FOOD</Text><Text>Carregando...</Text></SafeAreaView>;
  if(!session)return <AuthScreen/>;

  if(selectedStore){
    return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content"/><ScrollView contentContainerStyle={styles.scroll}>
      <Pressable onPress={()=>{setSelectedStore(null);setSelectedProduct(null);setMessage("");}}><Text style={styles.back}>‹ Voltar</Text></Pressable>
      {selectedStore.cover_url?<Image source={{uri:selectedStore.cover_url}} style={styles.storeCover}/>:<View style={styles.storeCoverFallback}><Text style={styles.storeCoverFallbackText}>CLICK-FOOD</Text></View>}
      <View style={styles.storeHeading}>{selectedStore.logo_url?<Image source={{uri:selectedStore.logo_url}} style={styles.storeLogo}/>:<View style={styles.storeLogoFallback}><Text style={styles.storeLogoFallbackText}>CF</Text></View>}<View style={{flex:1}}><Text style={styles.storeTitle}>{selectedStore.name}</Text><Text style={styles.meta}>{selectedStore.description||"Cardápio CLICK-FOOD"}</Text></View></View>
      <Text style={styles.meta}>Pedido mínimo {brl(selectedStore.minimum_order)} • preparo médio {selectedStore.average_preparation_time} min</Text>
      <Text style={[styles.storeStatusBanner,selectedStore.open_now?styles.storeOpenBanner:styles.storeClosedBanner]}>{selectedStore.open_now?"ABERTA AGORA":"FECHADA AGORA"}</Text>
      {promotions.some(p=>p.promotion_type==="FREE_DELIVERY")&&<Text style={styles.promoBanner}>🚚 Entrega grátis em promoção</Text>}
      {!!message&&<Text style={styles.notice}>{message}</Text>}

      <Text style={styles.section}>Cardápio</Text>
      {products.length?products.map(product=>{
        const hasVariants=variantsFor(product.id).length>0;
        const hasOptions=groupsFor(product.id).length>0;
        const base=Number(product.promotional_price??product.price);
        const shown=displayProductPrice(product);
        const discounted=shown<base&&!hasVariants;
        return <View style={styles.productRow} key={product.id}>
          {product.image_url?<Image source={{uri:product.image_url}} style={styles.productImage}/>:<View style={styles.productImageFallback}><Text style={styles.productImageFallbackText}>🍽️</Text></View>}
          <View style={{flex:1}}>
            <Text style={styles.productName}>{product.name}</Text><Text style={styles.meta}>{product.description||""}</Text>
            <Text style={styles.price}>{hasVariants?"A partir de ":""}{brl(shown)}</Text>
            {(hasVariants||hasOptions)&&<Text style={styles.customHint}>{hasVariants?"Escolha tamanho":"Personalizável"}{hasVariants&&hasOptions?" • complementos":""}</Text>}
            {discounted&&<Text style={styles.discountHint}>Preço promocional aplicado</Text>}
          </View>
          <Pressable style={styles.addButton} onPress={()=>beginProduct(product)}><Text style={styles.addText}>+</Text></Pressable>
        </View>;
      }):<Text style={styles.empty}>Nenhum produto disponível.</Text>}

      {selectedProduct&&<ProductCustomizer
        product={selectedProduct}
        variants={variantsFor(selectedProduct.id)}
        groups={groupsFor(selectedProduct.id)}
        options={optionsFor(selectedProduct.id)}
        promotions={promotions}
        onCancel={()=>setSelectedProduct(null)}
        onAdd={addCustomized}
      />}

      <Text style={styles.section}>Meu carrinho</Text>
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
      }):<Text style={styles.empty}>Adicione itens para continuar.</Text>}

      <View style={styles.segment}>
        <Pressable style={[styles.segmentButton,deliveryType==="DELIVERY"&&styles.segmentActive]} onPress={()=>setDeliveryType("DELIVERY")}><Text style={deliveryType==="DELIVERY"?styles.segmentActiveText:undefined}>Entrega</Text></Pressable>
        <Pressable style={[styles.segmentButton,deliveryType==="PICKUP"&&styles.segmentActive]} onPress={()=>setDeliveryType("PICKUP")}><Text style={deliveryType==="PICKUP"?styles.segmentActiveText:undefined}>Retirar na loja</Text></Pressable>
      </View>

      {deliveryType==="DELIVERY"&&<>
        <Text style={styles.section}>Endereço de entrega</Text>
        {addresses.map(address=><Pressable key={address.id} style={[styles.addressCard,selectedAddressId===address.id&&styles.addressSelected]} onPress={()=>setSelectedAddressId(address.id)}>
          <Text style={styles.productName}>{address.label||"Endereço"}</Text><Text style={styles.meta}>{address.street}, {address.number}{address.district?` • ${address.district}`:""}</Text>
        </Pressable>)}
        <View style={styles.addressForm}>
          <Text style={styles.formTitle}>Adicionar endereço usando minha localização atual</Text>
          <TextInput style={styles.input} placeholder="Nome (Casa, Trabalho...)" value={addressForm.label} onChangeText={value=>setAddressForm({...addressForm,label:value})}/>
          <TextInput style={styles.input} placeholder="Rua/Avenida" value={addressForm.street} onChangeText={value=>setAddressForm({...addressForm,street:value})}/>
          <TextInput style={styles.input} placeholder="Número" value={addressForm.number} onChangeText={value=>setAddressForm({...addressForm,number:value})}/>
          <TextInput style={styles.input} placeholder="Bairro" value={addressForm.district} onChangeText={value=>setAddressForm({...addressForm,district:value})}/>
          <TextInput style={styles.input} placeholder="Referência" value={addressForm.reference} onChangeText={value=>setAddressForm({...addressForm,reference:value})}/>
          <Pressable style={styles.secondaryButton} onPress={saveAddressWithLocation} disabled={savingAddress}><Text style={styles.secondaryText}>{savingAddress?"SALVANDO...":"SALVAR ENDEREÇO + GPS"}</Text></Pressable>
        </View>
      </>}

      <Text style={styles.section}>Cupom</Text>
      <TextInput style={styles.input} placeholder="Digite o código do cupom" autoCapitalize="characters" value={coupon} onChangeText={setCoupon}/>
      <Text style={styles.section}>Forma de pagamento</Text>
      <View style={styles.segment}>
        <Pressable style={[styles.segmentButton,paymentMethod==="CASH"&&styles.segmentActive]} onPress={()=>setPaymentMethod("CASH")}><Text style={paymentMethod==="CASH"?styles.segmentActiveText:undefined}>Dinheiro</Text></Pressable>
        {availablePaymentMethods.includes("PIX")&&<Pressable style={[styles.segmentButton,paymentMethod==="PIX"&&styles.segmentActive]} onPress={()=>setPaymentMethod("PIX")}><Text style={paymentMethod==="PIX"?styles.segmentActiveText:undefined}>PIX • Efí</Text></Pressable>}
      </View>
      {!availablePaymentMethods.includes("PIX")&&<Text style={styles.meta}>PIX será exibido automaticamente quando a Efí Bank estiver ativada pela Matriz.</Text>}
      <View style={styles.totalBox}><Text>Subtotal estimado</Text><Text style={styles.total}>{brl(cartSubtotal)}</Text><Text style={styles.paymentHint}>O servidor recalcula preços, promoções, adicionais, frete, estoque e cupom antes de criar o pedido. {paymentMethod==="PIX"?"No PIX, o pedido só é enviado à loja após a confirmação da Efí.":"No dinheiro, o pedido segue diretamente para a loja."}</Text></View>
      <Pressable style={[styles.checkout,(!cart.length||!selectedStore.open_now)&&styles.disabled]} disabled={!cart.length||placing||!selectedStore.open_now} onPress={placeOrder}><Text style={styles.checkoutText}>{!selectedStore.open_now?"LOJA FECHADA":placing?"ENVIANDO PEDIDO...":"FAZER PEDIDO"}</Text></Pressable>
    </ScrollView></SafeAreaView>;
  }

  const home=<ScrollView contentContainerStyle={styles.scroll}>
    <View style={styles.header}><View><Text style={styles.brand}><Text style={styles.yellow}>CLICK</Text>-FOOD</Text><Text style={styles.kicker}>LOJAS DISPONÍVEIS</Text></View><View style={styles.avatar}><Text>{String(session.user.user_metadata?.full_name??"CF").slice(0,2).toUpperCase()}</Text></View></View>
    <Pressable style={styles.searchBox} onPress={()=>setTab("search")}><Text>⌕  O que você quer pedir hoje?</Text></Pressable>
    <View style={styles.hero}><View style={{flex:1}}><Text style={styles.heroKicker}>CLICK-FOOD</Text><Text style={styles.heroTitle}>Peça, acompanhe e aproveite.</Text><Text style={styles.heroText}>Seu pedido é calculado e validado com segurança no servidor.</Text></View><Text style={styles.heroEmoji}>🍔</Text></View>
    <Text style={styles.section}>Lojas</Text>
    {stores.length?stores.map(store=><Pressable style={styles.storeCard} key={store.id} onPress={()=>openStore(store)}>{store.logo_url?<Image source={{uri:store.logo_url}} style={styles.storeLogoCard}/>:<View style={styles.storeIcon}><Text style={{fontSize:32}}>🍽️</Text></View>}<View style={{flex:1}}><Text style={styles.productName}>{store.name}</Text><Text style={styles.meta}>{store.description||"Cardápio disponível"}</Text><Text style={styles.meta}>Mínimo {brl(store.minimum_order)}</Text><Text style={[styles.storeStatus,store.open_now?styles.storeOpen:styles.storeClosed]}>{store.open_now?"ABERTA":"FECHADA"}</Text></View><Text>›</Text></Pressable>):<Text style={styles.empty}>Ainda não há lojas ativas.</Text>}
  </ScrollView>;

  const search=<ScrollView contentContainerStyle={styles.scroll}>
    <Text style={styles.pageTitle}>Buscar</Text><TextInput style={styles.input} autoFocus placeholder="Nome da loja" value={query} onChangeText={setQuery}/>
    {filtered.map(store=><Pressable style={styles.storeCard} key={store.id} onPress={()=>openStore(store)}>{store.logo_url?<Image source={{uri:store.logo_url}} style={styles.storeLogoCard}/>:<View style={styles.storeIcon}><Text style={{fontSize:30}}>🍽️</Text></View>}<View style={{flex:1}}><Text style={styles.productName}>{store.name}</Text><Text style={styles.meta}>{store.description||"Cardápio disponível"}</Text><Text style={[styles.storeStatus,store.open_now?styles.storeOpen:styles.storeClosed]}>{store.open_now?"ABERTA":"FECHADA"}</Text></View><Text>›</Text></Pressable>)}
  </ScrollView>;

  const trackedOrder=tracking?orders.find(order=>order.id===tracking.orderId):null;
  const mapCenter=tracking?tracking.driverLat!=null&&tracking.driverLng!=null?{latitude:tracking.driverLat,longitude:tracking.driverLng}:tracking.storeLat!=null&&tracking.storeLng!=null?{latitude:tracking.storeLat,longitude:tracking.storeLng}:tracking.destinationLat!=null&&tracking.destinationLng!=null?{latitude:tracking.destinationLat,longitude:tracking.destinationLng}:null:null;

  const ordersView=<ScrollView contentContainerStyle={styles.scroll}>
    <View style={styles.rowBetween}><Text style={styles.pageTitle}>Meus pedidos</Text><Pressable onPress={loadOrders}><Text style={styles.link}>Atualizar</Text></Pressable></View>{!!message&&<Text style={styles.notice}>{message}</Text>}
    {pixCharge&&<PixPaymentCard charge={pixCharge} busy={pixBusy} onRefresh={()=>refreshPix(pixCharge.orderId)}/>}
    {tracking&&trackedOrder&&<View style={styles.trackingCard}>
      {tracking.deliveryStatus==="DRIVER_AT_CUSTOMER"&&<View style={styles.arrivedBanner}><Text style={styles.arrivedTitle}>Seu motorista chegou!</Text><Text style={styles.arrivedText}>Dirija-se ao local combinado para receber o pedido.</Text></View>}
      <Text style={styles.trackingKicker}>ACOMPANHAMENTO EM TEMPO REAL</Text><Text style={styles.trackingTitle}>Pedido #{trackedOrder.order_number}</Text><Text style={styles.trackingStatus}>{statusLabel[trackedOrder.status]??trackedOrder.status}</Text>
      {mapCenter?<MapView style={styles.trackingMap} region={{...mapCenter,latitudeDelta:0.018,longitudeDelta:0.018}}>
        {tracking.storeLat!=null&&tracking.storeLng!=null&&<Marker coordinate={{latitude:tracking.storeLat,longitude:tracking.storeLng}} title="Loja"><View style={styles.mapPin}><Text>🏪</Text></View></Marker>}
        {tracking.destinationLat!=null&&tracking.destinationLng!=null&&<Marker coordinate={{latitude:tracking.destinationLat,longitude:tracking.destinationLng}} title="Seu endereço"><View style={styles.mapPin}><Text>🏠</Text></View></Marker>}
        {tracking.driverLat!=null&&tracking.driverLng!=null&&<Marker coordinate={{latitude:tracking.driverLat,longitude:tracking.driverLng}} title="Seu entregador"><View style={styles.driverPin}><Text style={styles.driverEmoji}>🛵</Text></View></Marker>}
      </MapView>:<View style={styles.mapWaiting}><Text style={styles.driverEmoji}>🛵</Text><Text style={styles.meta}>{tracking.driverId?"Aguardando atualização da localização do entregador.":"Aguardando um entregador aceitar o chamado."}</Text></View>}
      <Text style={styles.liveHint}>{tracking.driverId?"O ícone do veículo é atualizado enquanto o entregador estiver online e na entrega.":"Assim que um entregador aceitar, ele aparecerá aqui."}</Text>
    </View>}
    {orders.length?orders.map(order=>{
      const rel=Array.isArray(order.stores)?order.stores[0]:order.stores;const reviewed=reviewedOrderIds.has(order.id);
      return <View style={styles.orderBlock} key={order.id}>
        <View style={styles.orderCard}><View style={{flex:1}}><Text style={styles.productName}>{rel?.name??"CLICK-FOOD"} • #{order.order_number}</Text><Text style={styles.meta}>{statusLabel[order.status]??order.status} • {paymentStatusLabel[order.payment_status]??order.payment_status}</Text></View><Text style={styles.price}>{brl(order.total)}</Text></View>
        {refundByOrder[order.id]&&<View style={[styles.refundBanner,refundByOrder[order.id].status==="COMPLETED"?styles.refundDone:refundByOrder[order.id].status==="FAILED"?styles.refundFailed:styles.refundPending]}><Text style={styles.refundText}>{refundStatusLabel[refundByOrder[order.id].status]??refundByOrder[order.id].status} • {brl(refundByOrder[order.id].amount)}</Text>{["PENDING","PROCESSING","FAILED"].includes(refundByOrder[order.id].status)&&<Pressable style={styles.refundButton} disabled={refundBusyOrderId===order.id} onPress={()=>reconcileRefund(order)}><Text style={styles.refundButtonText}>{refundBusyOrderId===order.id?"CONSULTANDO...":"ATUALIZAR ESTORNO"}</Text></Pressable>}</View>}
        {!refundByOrder[order.id]&&["CANCELLED","REJECTED"].includes(order.status)&&["PAID","PARTIALLY_REFUNDED"].includes(order.payment_status)&&<Pressable style={styles.refundButtonStandalone} disabled={refundBusyOrderId===order.id} onPress={()=>reconcileRefund(order)}><Text style={styles.refundButtonText}>{refundBusyOrderId===order.id?"CONSULTANDO...":"CONSULTAR ESTORNO PIX"}</Text></Pressable>}
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
    <Text style={styles.section}>Endereços salvos</Text>{addresses.map(address=><View style={styles.addressCard} key={address.id}><Text style={styles.productName}>{address.label||"Endereço"}</Text><Text style={styles.meta}>{address.street}, {address.number}</Text></View>)}
    <Pressable style={styles.signOut} onPress={()=>supabase.auth.signOut()}><Text style={styles.signOutText}>SAIR</Text></Pressable>
  </ScrollView>;

  const screen=tab==="home"?home:tab==="search"?search:tab==="orders"?ordersView:profile;
  const tabs:Array<[Tab,string,string]>=[["home","⌂","Início"],["search","⌕","Buscar"],["orders","▤","Pedidos"],["profile","○","Perfil"]];
  return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content"/><View style={{flex:1}}>{screen}</View><View style={styles.bottom}>{tabs.map(([key,icon,label])=><Pressable style={styles.tab} key={key} onPress={()=>setTab(key)}><Text style={[styles.tabIcon,tab===key&&styles.tabActive]}>{icon}</Text><Text style={[styles.tabLabel,tab===key&&styles.tabActive]}>{label}</Text></Pressable>)}</View></SafeAreaView>;
}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:"#f7f7f7"},center:{flex:1,alignItems:"center",justifyContent:"center",gap:10},scroll:{padding:18,paddingBottom:34},authSafe:{flex:1,backgroundColor:"#f7f7f7"},authWrap:{flexGrow:1,justifyContent:"center",padding:26},
  brand:{fontSize:25,fontWeight:"900"},yellow:{color:"#f4c400"},kicker:{fontSize:10,fontWeight:"900",color:"#8b7000",letterSpacing:1.4,marginTop:7},authTitle:{fontSize:30,fontWeight:"900",marginVertical:22},
  input:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e1e1e1",borderRadius:13,padding:13,marginBottom:9},message:{backgroundColor:"#fff5d2",color:"#695400",padding:11,borderRadius:11,marginBottom:8},notice:{backgroundColor:"#fff5d2",color:"#695400",padding:12,borderRadius:12,marginVertical:12},
  darkButton:{backgroundColor:"#111",padding:15,borderRadius:13,alignItems:"center"},darkButtonText:{color:"#fff",fontWeight:"900"},switchText:{textAlign:"center",fontWeight:"800",color:"#8b7000",padding:17},disabled:{opacity:.5},
  header:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:18},avatar:{width:44,height:44,borderRadius:22,backgroundColor:"#f4c400",alignItems:"center",justifyContent:"center"},
  searchBox:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e8e8e8",borderRadius:15,padding:16,marginBottom:16},hero:{backgroundColor:"#111",borderRadius:20,padding:18,flexDirection:"row",alignItems:"center"},heroKicker:{color:"#f4c400",fontWeight:"900",fontSize:10},heroTitle:{color:"#fff",fontSize:22,fontWeight:"900",marginTop:6},heroText:{color:"#aaa",fontSize:11,marginTop:7},heroEmoji:{fontSize:48},
  section:{fontSize:19,fontWeight:"900",marginTop:22,marginBottom:10},pageTitle:{fontSize:28,fontWeight:"900",marginBottom:18},storeCard:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e8e8e8",borderRadius:16,padding:13,flexDirection:"row",alignItems:"center",gap:12,marginBottom:9},storeIcon:{width:50,height:50,borderRadius:14,backgroundColor:"#f1f1f1",alignItems:"center",justifyContent:"center"},storeLogoCard:{width:50,height:50,borderRadius:14,backgroundColor:"#f1f1f1"},storeTitle:{fontSize:28,fontWeight:"900",marginTop:4},storeCover:{width:"100%",height:160,borderRadius:18,marginTop:12,marginBottom:12,backgroundColor:"#ddd"},storeCoverFallback:{height:130,borderRadius:18,marginTop:12,marginBottom:12,backgroundColor:"#111",alignItems:"center",justifyContent:"center"},storeCoverFallbackText:{color:"#f4c400",fontSize:24,fontWeight:"900"},storeHeading:{flexDirection:"row",alignItems:"center",gap:12,marginBottom:4},storeLogo:{width:58,height:58,borderRadius:16,backgroundColor:"#eee"},storeLogoFallback:{width:58,height:58,borderRadius:16,backgroundColor:"#f4c400",alignItems:"center",justifyContent:"center"},storeLogoFallbackText:{fontWeight:"900",fontSize:18},
  storeStatus:{fontSize:9,fontWeight:"900",paddingHorizontal:7,paddingVertical:4,borderRadius:999,alignSelf:"flex-start",marginTop:6,overflow:"hidden"},storeOpen:{backgroundColor:"#ddf6e6",color:"#1d7342"},storeClosed:{backgroundColor:"#fde5e1",color:"#992f29"},storeStatusBanner:{padding:10,borderRadius:12,fontSize:11,fontWeight:"900",marginTop:10,textAlign:"center"},storeOpenBanner:{backgroundColor:"#ddf6e6",color:"#1d7342"},storeClosedBanner:{backgroundColor:"#fde5e1",color:"#992f29"},
  productRow:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e8e8e8",borderRadius:15,padding:12,marginBottom:9,flexDirection:"row",alignItems:"center",gap:10},productImage:{width:74,height:74,borderRadius:12,backgroundColor:"#eee"},productImageFallback:{width:74,height:74,borderRadius:12,backgroundColor:"#f1f1f1",alignItems:"center",justifyContent:"center"},productImageFallbackText:{fontSize:28},productName:{fontWeight:"900",fontSize:15},meta:{color:"#777",fontSize:11,marginTop:4},price:{fontWeight:"900",color:"#8d7000",marginTop:6},addButton:{width:42,height:42,borderRadius:13,backgroundColor:"#f4c400",alignItems:"center",justifyContent:"center"},addText:{fontSize:24,fontWeight:"900"},
  customHint:{fontSize:10,color:"#555",fontWeight:"800",marginTop:4},discountHint:{fontSize:10,color:"#26804a",fontWeight:"800",marginTop:3},promoBanner:{backgroundColor:"#dcf7e7",color:"#17673b",padding:10,borderRadius:11,fontWeight:"800",fontSize:11,marginTop:12},
  cartRow:{backgroundColor:"#fff",borderRadius:14,padding:13,marginBottom:8,flexDirection:"row",alignItems:"center"},cartOptions:{fontSize:10,color:"#666",marginTop:4,lineHeight:14},qty:{flexDirection:"row",gap:14,alignItems:"center",borderWidth:1,borderColor:"#ddd",borderRadius:10,paddingVertical:8,paddingHorizontal:10},
  segment:{flexDirection:"row",gap:7,marginTop:18},segmentButton:{flex:1,borderWidth:1,borderColor:"#ddd",padding:12,borderRadius:12,alignItems:"center"},segmentActive:{backgroundColor:"#111",borderColor:"#111"},segmentActiveText:{color:"#fff",fontWeight:"900"},
  addressCard:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e2e2e2",borderRadius:13,padding:12,marginBottom:7},addressSelected:{borderColor:"#d4ae00",backgroundColor:"#fffbea"},addressForm:{backgroundColor:"#eeeae0",borderRadius:16,padding:14,marginTop:10},formTitle:{fontWeight:"900",marginBottom:10},
  secondaryButton:{backgroundColor:"#fff",borderWidth:1,borderColor:"#ccc",padding:13,borderRadius:12,alignItems:"center"},secondaryText:{fontWeight:"900"},totalBox:{backgroundColor:"#fff",padding:16,borderRadius:15,marginTop:12},total:{fontSize:25,fontWeight:"900",marginTop:4},paymentHint:{fontSize:10,color:"#777",marginTop:10,lineHeight:14},checkout:{backgroundColor:"#f4c400",padding:16,borderRadius:14,alignItems:"center",marginTop:10},checkoutText:{fontWeight:"900"},back:{fontWeight:"900",color:"#856a00",fontSize:15},empty:{color:"#777",paddingVertical:20,textAlign:"center"},
  orderBlock:{marginBottom:10},orderCard:{backgroundColor:"#fff",borderRadius:14,padding:14,flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:10},rowBetween:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},link:{color:"#8d7000",fontWeight:"900"},
  refundBanner:{marginTop:7,borderRadius:12,padding:11,borderWidth:1},refundPending:{backgroundColor:"#fff8dd",borderColor:"#ead47a"},refundDone:{backgroundColor:"#e2f7e9",borderColor:"#9fd7b1"},refundFailed:{backgroundColor:"#fde9e6",borderColor:"#e2aaa2"},refundText:{fontSize:11,fontWeight:"900",color:"#333"},refundButton:{marginTop:9,backgroundColor:"#111",borderRadius:9,paddingVertical:9,paddingHorizontal:11,alignSelf:"flex-start"},refundButtonStandalone:{marginTop:7,backgroundColor:"#111",borderRadius:10,padding:11,alignItems:"center"},refundButtonText:{color:"#fff",fontSize:10,fontWeight:"900"},
  trackingCard:{backgroundColor:"#111",borderRadius:20,padding:14,marginBottom:16,overflow:"hidden"},trackingKicker:{color:"#f4c400",fontWeight:"900",fontSize:9,letterSpacing:1.2},trackingTitle:{color:"#fff",fontSize:20,fontWeight:"900",marginTop:5},trackingStatus:{color:"#ccc",fontSize:12,marginTop:4,marginBottom:12},trackingMap:{height:250,borderRadius:15,overflow:"hidden"},mapWaiting:{height:180,borderRadius:15,backgroundColor:"#292929",alignItems:"center",justifyContent:"center",padding:20},mapPin:{backgroundColor:"#fff",borderRadius:18,padding:7,borderWidth:2,borderColor:"#111"},driverPin:{backgroundColor:"#f4c400",borderRadius:22,padding:8,borderWidth:2,borderColor:"#111"},driverEmoji:{fontSize:25},liveHint:{color:"#aaa",fontSize:10,marginTop:9,lineHeight:14},arrivedBanner:{backgroundColor:"#f4c400",borderRadius:13,padding:13,marginBottom:12},arrivedTitle:{fontSize:18,fontWeight:"900"},arrivedText:{fontSize:11,marginTop:3},
  cancelButton:{borderWidth:1,borderColor:"#edc3c0",backgroundColor:"#fff",padding:10,borderRadius:10,alignItems:"center",marginTop:5},cancelText:{color:"#a32e28",fontWeight:"900",fontSize:10},rateButton:{backgroundColor:"#fff6cf",padding:10,borderRadius:10,alignItems:"center",marginTop:5},rateText:{color:"#745c00",fontWeight:"900",fontSize:10},reviewed:{color:"#24774b",fontWeight:"800",fontSize:11,padding:8},reviewBox:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e1d49d",borderRadius:14,padding:14,marginTop:5},stars:{flexDirection:"row",gap:7,marginBottom:12},star:{fontSize:34,color:"#ccc"},starActive:{color:"#f4c400"},
  profile:{backgroundColor:"#fff",padding:15,borderRadius:16,flexDirection:"row",alignItems:"center",gap:12},signOut:{borderWidth:1,borderColor:"#e3b7b7",borderRadius:13,padding:14,marginTop:24,alignItems:"center"},signOutText:{color:"#9d2c2c",fontWeight:"900"},
  bottom:{height:70,backgroundColor:"#fff",borderTopWidth:1,borderTopColor:"#e5e5e5",flexDirection:"row"},tab:{flex:1,alignItems:"center",justifyContent:"center"},tabIcon:{fontSize:19,color:"#777"},tabLabel:{fontSize:9,color:"#777",fontWeight:"700",marginTop:3},tabActive:{color:"#8d7000",fontWeight:"900"}
});