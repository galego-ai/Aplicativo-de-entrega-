"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Order={id:string;order_number:number;total:number;status:string;payment_status:string;delivery_type:string;source:string;created_at:string;delivered_at:string|null};
const brl=(v:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v||0);
const dt=(v:string)=>new Date(v).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});

export default function RecibosPage(){
 const[orders,setOrders]=useState<Order[]>([]);const[loading,setLoading]=useState(true);const[message,setMessage]=useState("");const[query,setQuery]=useState("");const[storeName,setStoreName]=useState("");
 useEffect(()=>{load();},[]);
 async function load(){
  setLoading(true);const{data:{session}}=await supabase.auth.getSession();if(!session){window.location.href="/";return;}
  const{data:memberships}=await supabase.from("store_memberships").select("store_id,stores!inner(name)").eq("user_id",session.user.id).eq("active",true).limit(1);
  if(!memberships?.length){setMessage("Nenhuma loja vinculada.");setLoading(false);return;}
  const membership:any=memberships[0],rel=Array.isArray(membership.stores)?membership.stores[0]:membership.stores;setStoreName(rel?.name??"Minha loja");
  const{data,error}=await supabase.from("orders").select("id,order_number,total,status,payment_status,delivery_type,source,created_at,delivered_at").eq("store_id",membership.store_id).order("created_at",{ascending:false}).limit(150);
  if(error)setMessage("Não foi possível carregar os pedidos.");else setOrders((data??[]).map((o:any)=>({...o,total:Number(o.total)})) as Order[]);setLoading(false);
 }
 const filtered=useMemo(()=>{const q=query.trim().toLowerCase();if(!q)return orders;return orders.filter(o=>String(o.order_number).includes(q)||o.status.toLowerCase().includes(q)||o.payment_status.toLowerCase().includes(q));},[orders,query]);
 return <main style={s.page}><section style={s.shell}><header style={s.header}><div><div style={s.brand}><span style={s.yellow}>CLICK</span>-FOOD</div><div style={s.muted}>{storeName}</div><h1 style={s.title}>Recibos</h1></div><a href="/" style={s.back}>← Voltar ao painel</a></header>
  <div style={s.toolbar}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar por número ou status" style={s.input}/><button onClick={load} style={s.refresh}>Atualizar</button></div>
  {!!message&&<div style={s.notice}>{message}</div>}{loading?<div style={s.card}>Carregando...</div>:<div style={s.card}>{filtered.length?filtered.map(order=><div key={order.id} style={s.row}><div><b>Pedido #{order.order_number}</b><div style={s.meta}>{dt(order.created_at)} • {order.delivery_type} • {order.source}</div><div style={s.meta}>{order.status} • pagamento {order.payment_status}</div></div><div style={s.right}><b>{brl(order.total)}</b><a href={`/recibo?orderId=${encodeURIComponent(order.id)}`} style={s.open}>ABRIR / IMPRIMIR</a></div></div>):<div style={s.empty}>Nenhum pedido encontrado.</div>}</div>}
 </section></main>;
}
const s:Record<string,React.CSSProperties>={page:{minHeight:"100vh",background:"#f5f5f2",padding:30,fontFamily:"Arial, sans-serif",color:"#111"},shell:{maxWidth:1000,margin:"0 auto"},header:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18},brand:{fontSize:24,fontWeight:900},yellow:{color:"#d5aa00"},muted:{fontSize:12,color:"#777",marginTop:4},title:{fontSize:34,margin:"8px 0 0"},back:{background:"#111",color:"#fff",padding:"11px 15px",borderRadius:10,textDecoration:"none",fontWeight:800},toolbar:{display:"flex",gap:8,marginBottom:14},input:{flex:1,padding:12,border:"1px solid #ddd",borderRadius:10,fontSize:14},refresh:{padding:"10px 15px",border:0,borderRadius:10,background:"#f4c400",fontWeight:900},notice:{background:"#fff4c5",padding:12,borderRadius:10,marginBottom:12},card:{background:"#fff",border:"1px solid #e5e5e5",borderRadius:16,padding:18},row:{display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",padding:"14px 0",borderBottom:"1px solid #eee"},meta:{fontSize:11,color:"#777",marginTop:4},right:{textAlign:"right",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:7},open:{background:"#111",color:"#fff",padding:"8px 10px",borderRadius:8,textDecoration:"none",fontSize:10,fontWeight:900},empty:{color:"#777",textAlign:"center",padding:25}}
