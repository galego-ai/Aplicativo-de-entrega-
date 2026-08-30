"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Receipt={order:any;store:any;customer:any;address:any;items:any[];payments?:any[];payment:any;delivery:any};
const brl=(value:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value||0);
const dt=(value?:string|null)=>value?new Date(value).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}):"—";
const paymentLabel:Record<string,string>={CASH:"Dinheiro",PIX:"PIX",CREDIT_CARD:"Crédito",DEBIT_CARD:"Débito",WALLET:"Carteira",OTHER:"Outro"};

export default function ReciboPage(){
 const[receipt,setReceipt]=useState<Receipt|null>(null);const[loading,setLoading]=useState(true);const[message,setMessage]=useState("");
 useEffect(()=>{load();},[]);
 async function load(){
  const orderId=new URLSearchParams(window.location.search).get("orderId");
  if(!orderId){setMessage("Pedido não informado.");setLoading(false);return;}
  const{data:{session}}=await supabase.auth.getSession();if(!session){window.location.href="/";return;}
  const{data,error}=await supabase.functions.invoke("store-order-receipt",{body:{orderId}});
  if(error||data?.error){setMessage(data?.error==="STORE_ACCESS_DENIED"?"Você não tem acesso a este pedido.":"Não foi possível carregar o recibo.");setLoading(false);return;}
  setReceipt(data as Receipt);setLoading(false);
 }
 if(loading)return <main style={s.page}><div style={s.paper}>Carregando recibo...</div></main>;
 if(!receipt)return <main style={s.page}><div style={s.paper}><h1>CLICK-FOOD</h1><p>{message}</p><a href="/">Voltar ao painel</a></div></main>;
 const r=receipt,o=r.order;const receiptPayments=r.payments?.length?r.payments:r.payment?[r.payment]:[];
 return <main style={s.page}>
  <style>{`@media print{body{background:#fff!important}.noPrint{display:none!important}.receiptPaper{box-shadow:none!important;border:none!important;margin:0!important;max-width:none!important;padding:10mm!important}}`}</style>
  <div className="noPrint" style={s.actions}><a href="/" style={s.back}>← Painel</a><button onClick={()=>window.print()} style={s.print}>IMPRIMIR / SALVAR PDF</button></div>
  <article className="receiptPaper" style={s.paper}>
   <header style={s.header}>{r.store?.logoUrl?<img src={r.store.logoUrl} alt="" style={s.logo}/>:<div style={s.brand}><span style={s.yellow}>CLICK</span>-FOOD</div>}<div style={{textAlign:"right"}}><b>{r.store?.name??"CLICK-FOOD"}</b>{r.store?.document&&<div style={s.small}>Documento: {r.store.document}</div>}{r.store?.phone&&<div style={s.small}>Telefone da loja: {r.store.phone}</div>}</div></header>
   <div style={s.rule}/><div style={s.center}><div style={s.kicker}>RECIBO DO PEDIDO</div><h1 style={s.orderNumber}>#{o.order_number}</h1><div style={s.small}>Emitido em {new Date().toLocaleString("pt-BR")}</div></div>
   <section style={s.infoGrid}><div><span style={s.label}>Cliente</span><b>{r.customer?.name??"Cliente CLICK-FOOD"}</b></div><div><span style={s.label}>Criado em</span><b>{dt(o.created_at)}</b></div><div><span style={s.label}>Tipo</span><b>{o.delivery_type}</b></div><div><span style={s.label}>Status</span><b>{o.status}</b></div></section>
   {r.address&&<section style={s.box}><span style={s.label}>Endereço de entrega</span><div>{r.address.street}, {r.address.number||"s/n"}{r.address.complement?` • ${r.address.complement}`:""}</div>{r.address.district&&<div>{r.address.district}{r.address.postal_code?` • CEP ${r.address.postal_code}`:""}</div>}{r.address.reference&&<div style={s.small}>Referência: {r.address.reference}</div>}</section>}
   <section><h2 style={s.sectionTitle}>Itens</h2>{r.items.map(item=><div key={item.id} style={s.item}><div style={{flex:1}}><b>{item.quantity}× {item.name}</b>{item.options?.map((opt:any,index:number)=><div key={index} style={s.small}>+ {opt.quantity}× {opt.name}{Number(opt.price)>0?` (${brl(Number(opt.price)*Number(opt.quantity))})`:""}</div>)}{item.notes&&<div style={s.small}>Obs.: {item.notes}</div>}</div><b>{brl(item.totalPrice)}</b></div>)}</section>
   <section style={s.totals}><div><span>Subtotal</span><b>{brl(o.subtotal)}</b></div><div><span>Entrega</span><b>{brl(o.delivery_fee)}</b></div>{o.discount>0&&<div><span>Desconto</span><b>- {brl(o.discount)}</b></div>}<div style={s.grand}><span>TOTAL</span><b>{brl(o.total)}</b></div></section>
   <section style={s.box}><span style={s.label}>{receiptPayments.length>1?"Pagamentos":"Pagamento"}</span>{receiptPayments.length?receiptPayments.map((payment:any,index:number)=><div key={`${payment.method}-${index}`} style={index?{marginTop:10,paddingTop:10,borderTop:"1px dashed #ddd"}:undefined}><div><b>{paymentLabel[payment.method]??payment.method??"Não informado"}</b> • {brl(Number(payment.amount??0))} • {payment.status??o.payment_status}{payment.provider?` • ${payment.provider}`:""}</div>{payment.paidAt&&<div style={s.small}>Pago em {dt(payment.paidAt)}</div>}{payment.transactionId&&<div style={s.code}>Ref.: {payment.transactionId}</div>}</div>):<div><b>Não informado</b> • {o.payment_status}</div>}</section>
   {r.delivery&&<section style={s.box}><span style={s.label}>Entrega</span><div><b>{r.delivery.status}</b>{r.delivery.driver?.name?` • ${r.delivery.driver.name}`:""}</div><div style={s.small}>Retirada: {dt(r.delivery.pickupAt)} • Entrega: {dt(r.delivery.deliveredAt)}</div></section>}
   {o.customer_notes&&<section style={s.box}><span style={s.label}>Observações do cliente</span><div>{o.customer_notes}</div></section>}
   <footer style={s.footer}>CLICK-FOOD • comprovante operacional do pedido • este documento não substitui documento fiscal quando exigido por lei.</footer>
  </article>
 </main>;
}

const s:Record<string,React.CSSProperties>={page:{minHeight:"100vh",background:"#eee",padding:"24px",fontFamily:"Arial, sans-serif",color:"#111"},actions:{maxWidth:760,margin:"0 auto 12px",display:"flex",justifyContent:"space-between",gap:10},back:{background:"#fff",padding:"11px 15px",borderRadius:10,textDecoration:"none",color:"#111",fontWeight:800},print:{background:"#f4c400",border:0,padding:"11px 15px",borderRadius:10,fontWeight:900,cursor:"pointer"},paper:{maxWidth:760,margin:"0 auto",background:"#fff",padding:32,borderRadius:10,boxShadow:"0 8px 30px rgba(0,0,0,.1)"},header:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:20},logo:{maxWidth:100,maxHeight:70,objectFit:"contain"},brand:{fontSize:24,fontWeight:900},yellow:{color:"#d5aa00"},rule:{height:4,background:"#f4c400",margin:"20px 0"},center:{textAlign:"center"},kicker:{fontSize:10,fontWeight:900,letterSpacing:1.5,color:"#777"},orderNumber:{fontSize:38,margin:"5px 0"},small:{fontSize:11,color:"#666",marginTop:4},infoGrid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,margin:"22px 0"},label:{display:"block",fontSize:10,fontWeight:900,color:"#777",textTransform:"uppercase",letterSpacing:.8,marginBottom:5},box:{border:"1px solid #ddd",borderRadius:10,padding:13,margin:"14px 0"},sectionTitle:{fontSize:17,borderBottom:"1px solid #ddd",paddingBottom:8},item:{display:"flex",justifyContent:"space-between",gap:16,padding:"10px 0",borderBottom:"1px dashed #ddd"},totals:{marginTop:18,marginLeft:"auto",maxWidth:350},grand:{fontSize:20,borderTop:"2px solid #111",marginTop:8,paddingTop:8},code:{fontSize:10,color:"#666",wordBreak:"break-all",marginTop:4},footer:{fontSize:9,color:"#777",textAlign:"center",borderTop:"1px solid #ddd",marginTop:24,paddingTop:14,lineHeight:1.5}}
