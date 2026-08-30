"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Order={id:string;order_number:number;total:number;status:string;payment_status:string;delivery_type:string;source:string;created_at:string;delivered_at:string|null};
const brl=(v:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v||0);
const dt=(v:string)=>new Date(v).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});

export default function RecibosPage(){
 const[orders,setOrders]=useState<Order[]>([]);const[loading,setLoading]=useState(true);const[message,setMessage]=useState("");const[query,setQuery]=useState("");const[storeName,setStoreName]=useState("");const[role,setRole]=useState("");const[refundBusy,setRefundBusy]=useState("");
 const canRefund=["OWNER","MANAGER"].includes(role);
 useEffect(()=>{load();},[]);
 async function load(){
  setLoading(true);const{data:{session}}=await supabase.auth.getSession();if(!session){window.location.href="/";return;}
  const{data:memberships}=await supabase.from("store_memberships").select("store_id,role,stores!inner(name)").eq("user_id",session.user.id).eq("active",true).limit(1);
  if(!memberships?.length){setMessage("Nenhuma loja vinculada.");setLoading(false);return;}
  const membership:any=memberships[0],rel=Array.isArray(membership.stores)?membership.stores[0]:membership.stores;setStoreName(rel?.name??"Minha loja");setRole(String(membership.role??""));
  const{data,error}=await supabase.from("orders").select("id,order_number,total,status,payment_status,delivery_type,source,created_at,delivered_at").eq("store_id",membership.store_id).order("created_at",{ascending:false}).limit(150);
  if(error)setMessage("Não foi possível carregar os pedidos.");else setOrders((data??[]).map((o:any)=>({...o,total:Number(o.total)})) as Order[]);setLoading(false);
 }
 async function refundPos(order:Order,externalReversalConfirmed=false){
  if(!canRefund||refundBusy)return;
  let reason=sessionStorage.getItem(`cf-pos-refund-reason-${order.id}`)||"";
  if(!externalReversalConfirmed){reason=window.prompt(`Motivo do estorno da venda #${order.order_number}:`)?.trim()||"";if(!reason)return;sessionStorage.setItem(`cf-pos-refund-reason-${order.id}`,reason);}
  setRefundBusy(order.id);setMessage("");
  const{data,error}=await supabase.functions.invoke("pos-sale-refund",{body:{orderId:order.id,reason,externalReversalConfirmed}});
  setRefundBusy("");
  if(!error&&!data?.error){sessionStorage.removeItem(`cf-pos-refund-reason-${order.id}`);setMessage(`Venda #${order.order_number} estornada. Estoque e financeiro foram revertidos.`);await load();return;}
  const code=String(data?.error??"");
  if(code==="EXTERNAL_REVERSAL_CONFIRMATION_REQUIRED"){
    const confirmed=window.confirm("Esta venda possui PIX/cartão/débito registrado no balcão. Confirme SOMENTE depois de realizar a reversão no terminal ou provedor externo. A reversão externa já foi concluída?");
    if(confirmed)await refundPos(order,true);else setMessage("Estorno não registrado. Faça primeiro a reversão no terminal/provedor externo.");
    return;
  }
  if(code==="CASH_SESSION_REQUIRED"){setMessage("Esta venda possui pagamento em dinheiro. Abra o caixa no PDV antes de devolver o valor e registrar o estorno.");return;}
  if(code==="POS_SALE_NOT_REFUNDABLE"){setMessage("Esta venda não pode mais ser estornada ou já foi estornada.");await load();return;}
  setMessage("Não foi possível estornar a venda. Nenhuma alteração parcial foi gravada.");
 }
 const filtered=useMemo(()=>{const q=query.trim().toLowerCase();if(!q)return orders;return orders.filter(o=>String(o.order_number).includes(q)||o.status.toLowerCase().includes(q)||o.payment_status.toLowerCase().includes(q));},[orders,query]);
 return <main style={s.page}><section style={s.shell}><header style={s.header}><div><div style={s.brand}><span style={s.yellow}>CLICK</span>-FOOD</div><div style={s.muted}>{storeName}</div><h1 style={s.title}>Recibos</h1></div><a href="/" style={s.back}>← Voltar ao painel</a></header>
  <div style={s.toolbar}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar por número ou status" style={s.input}/><button onClick={load} style={s.refresh}>Atualizar</button></div>
  {!!message&&<div style={s.notice}>{message}</div>}{loading?<div style={s.card}>Carregando...</div>:<div style={s.card}>{filtered.length?filtered.map(order=><div key={order.id} style={s.row}><div><b>Pedido #{order.order_number}</b><div style={s.meta}>{dt(order.created_at)} • {order.delivery_type} • {order.source}</div><div style={s.meta}>{order.status} • pagamento {order.payment_status}</div>{order.status==="REFUNDED"&&<div style={s.refunded}>✓ VENDA ESTORNADA</div>}</div><div style={s.right}><b>{brl(order.total)}</b><a href={`/recibo?orderId=${encodeURIComponent(order.id)}`} style={s.open}>ABRIR / IMPRIMIR</a>{canRefund&&order.source==="POS"&&order.status==="DELIVERED"&&order.payment_status==="PAID"&&<button disabled={refundBusy===order.id} onClick={()=>refundPos(order)} style={s.refund}>{refundBusy===order.id?"ESTORNANDO...":"ESTORNAR VENDA"}</button>}</div></div>):<div style={s.empty}>Nenhum pedido encontrado.</div>}</div>}
 </section></main>;
}
const s:Record<string,React.CSSProperties>={page:{minHeight:"100vh",background:"#f5f5f2",padding:30,fontFamily:"Arial, sans-serif",color:"#111"},shell:{maxWidth:1000,margin:"0 auto"},header:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18},brand:{fontSize:24,fontWeight:900},yellow:{color:"#d5aa00"},muted:{fontSize:12,color:"#777",marginTop:4},title:{fontSize:34,margin:"8px 0 0"},back:{background:"#111",color:"#fff",padding:"11px 15px",borderRadius:10,textDecoration:"none",fontWeight:800},toolbar:{display:"flex",gap:8,marginBottom:14},input:{flex:1,padding:12,border:"1px solid #ddd",borderRadius:10,fontSize:14},refresh:{padding:"10px 15px",border:0,borderRadius:10,background:"#f4c400",fontWeight:900},notice:{background:"#fff4c5",padding:12,borderRadius:10,marginBottom:12},card:{background:"#fff",border:"1px solid #e5e5e5",borderRadius:16,padding:18},row:{display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",padding:"14px 0",borderBottom:"1px solid #eee"},meta:{fontSize:11,color:"#777",marginTop:4},right:{textAlign:"right",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:7},open:{background:"#111",color:"#fff",padding:"8px 10px",borderRadius:8,textDecoration:"none",fontSize:10,fontWeight:900},refund:{background:"#fff",color:"#9a2828",border:"1px solid #dca9a9",padding:"8px 10px",borderRadius:8,fontSize:10,fontWeight:900,cursor:"pointer"},refunded:{display:"inline-block",marginTop:6,padding:"4px 7px",borderRadius:999,background:"#e5f7ea",color:"#217343",fontSize:9,fontWeight:900},empty:{color:"#777",textAlign:"center",padding:25}}