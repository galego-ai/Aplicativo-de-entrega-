"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import OrderThermalPrintButton from "./OrderThermalPrintButton";

type Option={name:string;price:number;quantity:number};
type Item={id:string;name:string;quantity:number;unitPrice:number;totalPrice:number;notes:string|null;options:Option[]};
type Receipt={
 order:{order_number:number;delivery_type:string;customer_notes:string|null;subtotal:number;delivery_fee:number;discount:number;total:number;status:string;payment_status:string};
 customer:{name:string;phone:string|null}|null;
 address:{street:string;number:string|null;complement:string|null;district:string|null;postal_code:string|null;reference:string|null}|null;
 items:Item[];
 payments:Array<{method:string;provider:string|null;status:string;amount:number;transactionId:string|null;paidAt:string|null}>;
 delivery:{id:string;status:string;driver:{name:string;avatarUrl:string|null}|null}|null;
};

const brl=(value:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value||0);
const paymentLabel:Record<string,string>={CASH:"Dinheiro",PIX:"PIX",CREDIT_CARD:"Crédito",DEBIT_CARD:"Débito",WALLET:"Carteira",OTHER:"Outro"};
const pickupCodeStatuses=new Set(["DRIVER_ASSIGNED","DRIVER_TO_STORE","DRIVER_AT_STORE"]);
const storeCompletionOrderStatuses=new Set(["PICKED_UP","ON_THE_WAY"]);
const storeCompletionDeliveryStatuses=new Set(["PICKUP_CONFIRMED","DRIVER_TO_CUSTOMER","DRIVER_AT_CUSTOMER"]);

export default function OrderDetailsPanel({orderId}:{orderId:string}){
 const[open,setOpen]=useState(false);const[loading,setLoading]=useState(false);const[data,setData]=useState<Receipt|null>(null);const[error,setError]=useState("");
 const[pickupCode,setPickupCode]=useState("");const[codeLoading,setCodeLoading]=useState(false);const[codeError,setCodeError]=useState("");
 const[completionLoading,setCompletionLoading]=useState(false);const[completionError,setCompletionError]=useState("");const[completionSuccess,setCompletionSuccess]=useState("");
 async function loadReceipt(){
  if(data||loading)return;
  setLoading(true);setError("");
  const result=await supabase.functions.invoke("store-order-receipt",{body:{orderId}});
  setLoading(false);
  if(result.error||result.data?.error){setError("Não foi possível carregar os detalhes deste pedido.");return;}
  setData(result.data as Receipt);
 }
 useEffect(()=>{void loadReceipt();},[orderId]);
 async function toggle(){
  if(open){setOpen(false);return;}
  setOpen(true);await loadReceipt();
 }
 async function generatePickupCode(){
  if(!data?.delivery?.id||codeLoading)return;
  setCodeLoading(true);setCodeError("");setPickupCode("");
  const{data:result,error:invokeError}=await supabase.functions.invoke("delivery-code",{body:{deliveryId:data.delivery.id,kind:"PICKUP"}});
  setCodeLoading(false);
  if(invokeError||result?.error){
   const code=String(result?.error??"");
   const labels:Record<string,string>={PICKUP_CODE_NOT_AVAILABLE:"O código fica disponível depois que um entregador é atribuído e antes da retirada.",PICKUP_CODE_ACCESS_DENIED:"Sua conta não tem permissão para visualizar este código.",DELIVERY_NOT_FOUND:"A entrega deste pedido não foi encontrada.",DELIVERY_CODE_SECRET_NOT_CONFIGURED:"O serviço de código está temporariamente indisponível."};
   setCodeError(labels[code]??"Não foi possível gerar o código agora. Atualize o pedido e tente novamente.");
   return;
  }
  const value=String(result?.code??"");
  if(!/^\d{4}$/.test(value)){setCodeError("O serviço não retornou um código válido.");return;}
  setPickupCode(value);
 }
 async function markDelivered(){
  if(!data?.delivery?.id||completionLoading)return;
  const confirmed=window.confirm(`Confirmar que o pedido #${data.order.order_number} foi ENTREGUE ao cliente?\n\nEsta ação encerra a entrega e libera o entregador imediatamente para receber o próximo chamado.`);
  if(!confirmed)return;
  setCompletionLoading(true);setCompletionError("");setCompletionSuccess("");
  const{data:result,error:invokeError}=await supabase.functions.invoke("store-order-action",{body:{orderId,action:"MARK_DELIVERED"}});
  setCompletionLoading(false);
  if(invokeError||result?.error){
   const code=String(result?.error??"");
   const labels:Record<string,string>={ORDER_NOT_IN_FINAL_DELIVERY_LEG:"O pedido ainda não foi retirado ou não entrou na etapa final da entrega.",DELIVERY_NOT_ELIGIBLE_FOR_STORE_COMPLETION:"A entrega ainda não está em uma etapa que permita finalização manual pela loja.",DRIVER_NOT_ASSIGNED:"Não há entregador vinculado a este pedido.",STORE_ACTION_DENIED:"Somente o responsável autorizado da loja pode concluir a entrega.",DELIVERY_ORDER_REQUIRED:"Este pedido não é do tipo entrega."};
   setCompletionError(labels[code]??"Não foi possível finalizar a entrega agora. Atualize o pedido e tente novamente.");
   return;
  }
  setData((current)=>current?{...current,order:{...current.order,status:"DELIVERED",payment_status:result?.order?.payment_status??current.order.payment_status},delivery:current.delivery?{...current.delivery,status:"DELIVERED"}:null}:current);
  setCompletionSuccess("✓ Entrega finalizada. O entregador foi liberado para receber o próximo chamado.");
 }
 const address=data?.address;
 const canGeneratePickupCode=Boolean(data?.delivery&&pickupCodeStatuses.has(data.delivery.status));
 const canMarkDelivered=Boolean(data?.delivery&&data.order.delivery_type==="DELIVERY"&&storeCompletionOrderStatuses.has(data.order.status)&&storeCompletionDeliveryStatuses.has(data.delivery.status));
 return <div style={{marginTop:9}}>
  {canMarkDelivered&&<div style={{marginBottom:9,padding:12,borderRadius:12,background:"#eef9f0",border:"2px solid #2d8a4a"}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap",marginBottom:8}}><div><b style={{display:"block",color:"#176b35"}}>PEDIDO EM ANDAMENTO</b><small style={{color:"#3f5c47"}}>O pedido já saiu com o entregador.</small></div><span style={{padding:"5px 8px",borderRadius:999,background:"#d9f2df",color:"#176b35",fontSize:11,fontWeight:900}}>{data?.order.status}</span></div>
    <button type="button" onClick={markDelivered} disabled={completionLoading} style={{width:"100%",padding:"13px 14px",borderRadius:10,border:0,background:"#1f8f4d",color:"#fff",fontWeight:1000,cursor:completionLoading?"wait":"pointer",fontSize:14}}>{completionLoading?"FINALIZANDO...":"ENTREGUE — LIBERAR ENTREGADOR"}</button>
    {completionError&&<p style={{margin:"9px 0 0",color:"#9a2828",fontSize:12,fontWeight:800}}>{completionError}</p>}
  </div>}
  {completionSuccess&&<div style={{marginBottom:9,padding:11,borderRadius:10,background:"#e5f7ea",color:"#176b35",fontSize:12,fontWeight:900}}>{completionSuccess}</div>}
  <button type="button" onClick={toggle} style={{width:"100%",padding:"9px 10px",borderRadius:9,border:"1px solid #d9d9d9",background:"#fff",fontWeight:900,cursor:"pointer"}}>{open?"OCULTAR DETALHES":"VER DETALHES DO PEDIDO"}</button>
  {open&&<div style={{marginTop:8,padding:12,borderRadius:12,background:"#f8f8f8",border:"1px solid #e5e5e5"}}>
   {loading&&<p style={{margin:0}}>Carregando pedido...</p>}{error&&<p style={{margin:0,color:"#9a2828",fontWeight:800}}>{error}</p>}
   {data&&<>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8,marginBottom:12}}>
     <div><small style={{color:"#777"}}>CLIENTE</small><b style={{display:"block"}}>{data.customer?.name??"Cliente CLICK-FOOD"}</b>{data.customer?.phone&&<span style={{display:"block",fontSize:12,color:"#555",marginTop:2}}>☎ {data.customer.phone}</span>}</div>
     <div><small style={{color:"#777"}}>TIPO</small><b style={{display:"block"}}>{data.order.delivery_type==="DELIVERY"?"Entrega":"Retirada/Balcão"}</b></div>
     <div><small style={{color:"#777"}}>PAGAMENTO</small><b style={{display:"block"}}>{data.order.payment_status}</b></div>
    </div>
    {address&&<div style={{padding:10,borderRadius:9,background:"#fff",marginBottom:10}}><small style={{color:"#777"}}>ENDEREÇO DE ENTREGA</small><b style={{display:"block",marginTop:3}}>{address.street}, {address.number??"s/n"}{address.complement?` • ${address.complement}`:""}</b><span style={{fontSize:12,color:"#666"}}>{address.district??""}{address.postal_code?` • CEP ${address.postal_code}`:""}{address.reference?` • Referência: ${address.reference}`:""}</span></div>}
    {data.order.customer_notes&&<div style={{padding:10,borderRadius:9,background:"#fff7d9",marginBottom:10}}><small>OBSERVAÇÃO DO CLIENTE</small><b style={{display:"block",marginTop:3}}>{data.order.customer_notes}</b></div>}
    <div style={{display:"grid",gap:8}}>{data.items.map(item=><div key={item.id} style={{padding:10,borderRadius:10,background:"#fff",border:"1px solid #e8e8e8"}}><div style={{display:"flex",justifyContent:"space-between",gap:10}}><b>{item.quantity}× {item.name}</b><b>{brl(item.totalPrice)}</b></div>{item.options?.length>0&&<div style={{fontSize:12,color:"#555",marginTop:5}}>{item.options.map((option,index)=><div key={`${item.id}-${index}`}>+ {option.quantity}× {option.name}{option.price>0?` (${brl(option.price)})`:""}</div>)}</div>}{item.notes&&<div style={{fontSize:12,color:"#8a5d00",fontWeight:800,marginTop:6}}>Obs.: {item.notes}</div>}</div>)}</div>
    <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #ddd",display:"grid",gap:4,fontSize:12}}><div style={{display:"flex",justifyContent:"space-between"}}><span>Subtotal</span><b>{brl(data.order.subtotal)}</b></div>{data.order.delivery_fee>0&&<div style={{display:"flex",justifyContent:"space-between"}}><span>Entrega</span><b>{brl(data.order.delivery_fee)}</b></div>}{data.order.discount>0&&<div style={{display:"flex",justifyContent:"space-between"}}><span>Desconto</span><b>− {brl(data.order.discount)}</b></div>}<div style={{display:"flex",justifyContent:"space-between",fontSize:15}}><b>Total</b><b>{brl(data.order.total)}</b></div></div>
    {data.payments.length>0&&<div style={{marginTop:10}}><small style={{color:"#777"}}>FORMA(S) DE PAGAMENTO</small>{data.payments.map((payment,index)=><div key={index} style={{fontSize:12,marginTop:3}}><b>{paymentLabel[payment.method]??payment.method}</b> • {brl(payment.amount)} • {payment.status}{payment.provider?` • ${payment.provider}`:""}</div>)}</div>}
    {data.delivery&&<div style={{marginTop:10,fontSize:12}}><small style={{color:"#777"}}>ENTREGA</small><div><b>{data.delivery.status}</b>{data.delivery.driver?.name?` • ${data.delivery.driver.name}`:" • aguardando entregador"}</div></div>}
    <OrderThermalPrintButton orderId={orderId}/>
    {canGeneratePickupCode&&<div style={{marginTop:12,padding:14,borderRadius:14,background:"#111",color:"#fff",border:"2px solid #f4c400"}}>
      <small style={{color:"#f4c400",fontWeight:900,letterSpacing:.7}}>CÓDIGO PARA RETIRADA DO ENTREGADOR</small>
      <p style={{fontSize:12,color:"#ddd",margin:"6px 0 10px"}}>Mostre este código ao entregador quando ele chegar à loja. Ele confirma a retirada no aplicativo.</p>
      {!pickupCode&&<button type="button" onClick={generatePickupCode} disabled={codeLoading} style={{width:"100%",padding:"12px 14px",borderRadius:10,border:0,background:"#f4c400",color:"#111",fontWeight:900,cursor:codeLoading?"wait":"pointer"}}>{codeLoading?"GERANDO...":"GERAR CÓDIGO PARA O ENTREGADOR"}</button>}
      {pickupCode&&<div style={{textAlign:"center",padding:"8px 0 2px"}}><div style={{fontSize:42,fontWeight:1000,letterSpacing:10,color:"#f4c400"}}>{pickupCode}</div><small style={{color:"#bbb"}}>Código de 4 dígitos • use somente nesta retirada</small></div>}
      {codeError&&<p style={{margin:"10px 0 0",color:"#ffd8d8",fontSize:12,fontWeight:800}}>{codeError}</p>}
    </div>}
    {data.delivery&&!canGeneratePickupCode&&data.delivery.status==="PICKUP_CONFIRMED"&&<div style={{marginTop:10,padding:10,borderRadius:10,background:"#e8f7ed",fontSize:12,fontWeight:800,color:"#176b35"}}>✓ Retirada já confirmada pelo entregador.</div>}
   </>}
  </div>}
 </div>;
}
