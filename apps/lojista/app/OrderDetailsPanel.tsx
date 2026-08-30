"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";

type Option={name:string;price:number;quantity:number};
type Item={id:string;name:string;quantity:number;unitPrice:number;totalPrice:number;notes:string|null;options:Option[]};
type Receipt={
 order:{order_number:number;delivery_type:string;customer_notes:string|null;subtotal:number;delivery_fee:number;discount:number;total:number;status:string;payment_status:string};
 customer:{name:string}|null;
 address:{street:string;number:string|null;complement:string|null;district:string|null;postal_code:string|null;reference:string|null}|null;
 items:Item[];
 payments:Array<{method:string;provider:string|null;status:string;amount:number;transactionId:string|null;paidAt:string|null}>;
 delivery:{status:string;driver:{name:string;avatarUrl:string|null}|null}|null;
};

const brl=(value:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value||0);
const paymentLabel:Record<string,string>={CASH:"Dinheiro",PIX:"PIX",CREDIT_CARD:"Crédito",DEBIT_CARD:"Débito",WALLET:"Carteira",OTHER:"Outro"};

export default function OrderDetailsPanel({orderId}:{orderId:string}){
 const[open,setOpen]=useState(false);const[loading,setLoading]=useState(false);const[data,setData]=useState<Receipt|null>(null);const[error,setError]=useState("");
 async function toggle(){
  if(open){setOpen(false);return;}
  setOpen(true);if(data||loading)return;setLoading(true);setError("");
  const result=await supabase.functions.invoke("store-order-receipt",{body:{orderId}});
  setLoading(false);if(result.error||result.data?.error){setError("Não foi possível carregar os detalhes deste pedido.");return;}setData(result.data as Receipt);
 }
 const address=data?.address;
 return <div style={{marginTop:9}}>
  <button type="button" onClick={toggle} style={{width:"100%",padding:"9px 10px",borderRadius:9,border:"1px solid #d9d9d9",background:"#fff",fontWeight:900,cursor:"pointer"}}>{open?"OCULTAR DETALHES":"VER DETALHES DO PEDIDO"}</button>
  {open&&<div style={{marginTop:8,padding:12,borderRadius:12,background:"#f8f8f8",border:"1px solid #e5e5e5"}}>
   {loading&&<p style={{margin:0}}>Carregando pedido...</p>}{error&&<p style={{margin:0,color:"#9a2828",fontWeight:800}}>{error}</p>}
   {data&&<>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8,marginBottom:12}}>
     <div><small style={{color:"#777"}}>CLIENTE</small><b style={{display:"block"}}>{data.customer?.name??"Cliente CLICK-FOOD"}</b></div>
     <div><small style={{color:"#777"}}>TIPO</small><b style={{display:"block"}}>{data.order.delivery_type==="DELIVERY"?"Entrega":"Retirada/Balcão"}</b></div>
     <div><small style={{color:"#777"}}>PAGAMENTO</small><b style={{display:"block"}}>{data.order.payment_status}</b></div>
    </div>
    {address&&<div style={{padding:10,borderRadius:9,background:"#fff",marginBottom:10}}><small style={{color:"#777"}}>ENDEREÇO DE ENTREGA</small><b style={{display:"block",marginTop:3}}>{address.street}, {address.number??"s/n"}{address.complement?` • ${address.complement}`:""}</b><span style={{fontSize:12,color:"#666"}}>{address.district??""}{address.postal_code?` • CEP ${address.postal_code}`:""}{address.reference?` • Referência: ${address.reference}`:""}</span></div>}
    {data.order.customer_notes&&<div style={{padding:10,borderRadius:9,background:"#fff7d9",marginBottom:10}}><small>OBSERVAÇÃO DO CLIENTE</small><b style={{display:"block",marginTop:3}}>{data.order.customer_notes}</b></div>}
    <div style={{display:"grid",gap:8}}>{data.items.map(item=><div key={item.id} style={{padding:10,borderRadius:10,background:"#fff",border:"1px solid #e8e8e8"}}><div style={{display:"flex",justifyContent:"space-between",gap:10}}><b>{item.quantity}× {item.name}</b><b>{brl(item.totalPrice)}</b></div>{item.options?.length>0&&<div style={{fontSize:12,color:"#555",marginTop:5}}>{item.options.map((option,index)=><div key={`${item.id}-${index}`}>+ {option.quantity}× {option.name}{option.price>0?` (${brl(option.price)})`:""}</div>)}</div>}{item.notes&&<div style={{fontSize:12,color:"#8a5d00",fontWeight:800,marginTop:6}}>Obs.: {item.notes}</div>}</div>)}</div>
    <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #ddd",display:"grid",gap:4,fontSize:12}}><div style={{display:"flex",justifyContent:"space-between"}}><span>Subtotal</span><b>{brl(data.order.subtotal)}</b></div>{data.order.delivery_fee>0&&<div style={{display:"flex",justifyContent:"space-between"}}><span>Entrega</span><b>{brl(data.order.delivery_fee)}</b></div>}{data.order.discount>0&&<div style={{display:"flex",justifyContent:"space-between"}}><span>Desconto</span><b>− {brl(data.order.discount)}</b></div>}<div style={{display:"flex",justifyContent:"space-between",fontSize:15}}><b>Total</b><b>{brl(data.order.total)}</b></div></div>
    {data.payments.length>0&&<div style={{marginTop:10}}><small style={{color:"#777"}}>FORMA(S) DE PAGAMENTO</small>{data.payments.map((payment,index)=><div key={index} style={{fontSize:12,marginTop:3}}><b>{paymentLabel[payment.method]??payment.method}</b> • {brl(payment.amount)} • {payment.status}{payment.provider?` • ${payment.provider}`:""}</div>)}</div>}
    {data.delivery&&<div style={{marginTop:10,fontSize:12}}><small style={{color:"#777"}}>ENTREGA</small><div><b>{data.delivery.status}</b>{data.delivery.driver?.name?` • ${data.delivery.driver.name}`:" • aguardando entregador"}</div></div>}
   </>}
  </div>}
 </div>;
}
