"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Review={id:string;order_id:string;customer_id:string;store_id:string;driver_id:string|null;store_rating:number;driver_rating:number|null;delivery_rating:number|null;delivery_time_rating:number|null;taste_rating:number|null;temperature_rating:number|null;comment:string|null;created_at:string};
type View=Review&{storeName:string;customerName:string;orderNumber:number|null};
const stars=(value:number|null)=>value?"★".repeat(value)+"☆".repeat(5-value):"—";
const avg=(rows:View[],key:keyof Review)=>{const values=rows.map(r=>Number(r[key])).filter(v=>Number.isFinite(v)&&v>0);return values.length?(values.reduce((a,b)=>a+b,0)/values.length).toFixed(1):"—";};

export default function ReviewsPage(){
 const[allowed,setAllowed]=useState<boolean|null>(null);const[rows,setRows]=useState<View[]>([]);const[message,setMessage]=useState("");
 async function load(){
  const{data:{session}}=await supabase.auth.getSession();const role=String(session?.user.app_metadata?.clickfood_role??"");const ok=!!session&&["SUPER_ADMIN","ADMIN"].includes(role);setAllowed(ok);if(!ok)return;
  const{data:reviews,error}=await supabase.from("reviews").select("id,order_id,customer_id,store_id,driver_id,store_rating,driver_rating,delivery_rating,delivery_time_rating,taste_rating,temperature_rating,comment,created_at").order("created_at",{ascending:false}).limit(500);
  if(error){setMessage("Não foi possível carregar as avaliações.");return;}
  const list=(reviews??[]) as Review[];const storeIds=[...new Set(list.map(r=>r.store_id))],customerIds=[...new Set(list.map(r=>r.customer_id))],orderIds=[...new Set(list.map(r=>r.order_id))];
  const[{data:stores},{data:profiles},{data:orders}]=await Promise.all([
   storeIds.length?supabase.from("stores").select("id,name").in("id",storeIds):Promise.resolve({data:[] as any[]}),
   customerIds.length?supabase.from("profiles").select("id,full_name").in("id",customerIds):Promise.resolve({data:[] as any[]}),
   orderIds.length?supabase.from("orders").select("id,order_number").in("id",orderIds):Promise.resolve({data:[] as any[]}),
  ]);
  const sm=new Map((stores??[]).map((x:any)=>[String(x.id),String(x.name)]));const pm=new Map((profiles??[]).map((x:any)=>[String(x.id),String(x.full_name??"Cliente")]));const om=new Map((orders??[]).map((x:any)=>[String(x.id),Number(x.order_number)]));
  setRows(list.map(r=>({...r,storeName:sm.get(r.store_id)??"Loja",customerName:pm.get(r.customer_id)??"Cliente CLICK-FOOD",orderNumber:om.get(r.order_id)??null})));
 }
 useEffect(()=>{void load();},[]);
 const metrics=useMemo(()=>({store:avg(rows,"store_rating"),delivery:avg(rows,"delivery_rating"),time:avg(rows,"delivery_time_rating"),taste:avg(rows,"taste_rating"),temperature:avg(rows,"temperature_rating")}),[rows]);
 if(allowed===null)return <main className="adminPage"><div className="adminPanel">Carregando...</div></main>;
 if(!allowed)return <main className="adminPage"><div className="adminPanel"><h1>Acesso restrito</h1><p>Entre na Matriz com perfil Super Admin ou Admin.</p></div></main>;
 return <main className="adminPage">
  <header className="adminHeader"><div><small>QUALIDADE</small><h1>Avaliações dos clientes</h1><p>Restaurantes e entregas acompanhados pela Matriz CLICK-FOOD.</p></div><a className="adminLink" href="/">← Matriz</a></header>
  {message&&<div className="adminNotice">{message}</div>}
  <section className="adminPanel" style={{marginBottom:18}}><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10}}>{[["Restaurante",metrics.store],["Entrega",metrics.delivery],["Tempo",metrics.time],["Sabor",metrics.taste],["Temperatura",metrics.temperature]].map(([label,value])=><div key={label} style={{padding:14,border:"1px solid #e5e5e5",borderRadius:12,background:"#fff"}}><small>{label}</small><div style={{fontSize:26,fontWeight:900,marginTop:4}}>{value} <span style={{fontSize:13,color:"#b78f00"}}>★</span></div></div>)}</div></section>
  <section className="adminPanel"><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}><div><h2>Últimas avaliações</h2><p className="muted">{rows.length} avaliação(ões) carregada(s).</p></div><button onClick={load}>Atualizar</button></div>
   <div className="adminList">{rows.map(r=><div key={r.id} style={{display:"block",padding:"16px"}}><div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><b>{r.storeName} • Pedido {r.orderNumber?`#${r.orderNumber}`:""}</b><small>{r.customerName} • {new Date(r.created_at).toLocaleString("pt-BR")}</small></div><b style={{color:"#9a7800"}}>{stars(r.store_rating)}</b></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:6,marginTop:10,fontSize:12}}><span>Restaurante: <b>{stars(r.store_rating)}</b></span><span>Entrega: <b>{stars(r.delivery_rating??r.driver_rating)}</b></span><span>Tempo: <b>{stars(r.delivery_time_rating)}</b></span><span>Sabor: <b>{stars(r.taste_rating)}</b></span><span>Temperatura: <b>{stars(r.temperature_rating)}</b></span></div>{r.comment&&<p style={{margin:"10px 0 0",padding:10,background:"#f7f7f7",borderRadius:10}}>“{r.comment}”</p>}</div>)}{!rows.length&&<p className="muted">Ainda não existem avaliações.</p>}</div>
  </section>
 </main>;
}
