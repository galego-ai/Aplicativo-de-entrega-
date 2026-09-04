"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Review={id:string;order_id:string;customer_id:string;store_rating:number;driver_rating:number|null;delivery_rating:number|null;delivery_time_rating:number|null;taste_rating:number|null;temperature_rating:number|null;comment:string|null;created_at:string;customerName:string;orderNumber:number|null;storeName?:string};
const stars=(value:number|null)=>value?"★".repeat(value)+"☆".repeat(5-value):"—";
const average=(rows:Review[],key:keyof Review)=>{const a=rows.map(r=>Number(r[key])).filter(v=>Number.isFinite(v)&&v>0);return a.length?(a.reduce((s,v)=>s+v,0)/a.length).toFixed(1):"—";};

export default function StoreReviewsPage(){
 const[storeName,setStoreName]=useState("");const[rows,setRows]=useState<Review[]>([]);const[loading,setLoading]=useState(true);const[message,setMessage]=useState("");
 async function load(){
  setLoading(true);const{data:{session}}=await supabase.auth.getSession();if(!session){setMessage("Entre no Painel Lojista para visualizar as avaliações.");setLoading(false);return;}
  const{data:membership}=await supabase.from("store_memberships").select("store_id,stores!inner(name)").eq("user_id",session.user.id).eq("active",true).limit(1).maybeSingle();
  if(!membership){setMessage("Sua conta não está vinculada a uma loja.");setLoading(false);return;}
  const storeId=String((membership as any).store_id);const related:any=(membership as any).stores;setStoreName(String((Array.isArray(related)?related[0]?.name:related?.name)??"Minha loja"));
  const{data,error}=await supabase.functions.invoke("reviews-dashboard-read",{body:{storeId}});
  if(error||data?.error){setMessage("Não foi possível carregar as avaliações.");setLoading(false);return;}
  setRows((data?.reviews??[]) as Review[]);setMessage("");setLoading(false);
 }
 useEffect(()=>{void load();},[]);
 const metrics=useMemo(()=>({store:average(rows,"store_rating"),delivery:average(rows,"delivery_rating"),time:average(rows,"delivery_time_rating"),taste:average(rows,"taste_rating"),temperature:average(rows,"temperature_rating")}),[rows]);
 return <main style={{maxWidth:1180,margin:"0 auto",padding:24,fontFamily:"Arial,sans-serif",background:"#f7f7f7",minHeight:"100vh"}}>
  <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,marginBottom:20,flexWrap:"wrap"}}><div><small style={{fontWeight:900,color:"#9b7900"}}>CLICK-FOOD • QUALIDADE</small><h1 style={{margin:"5px 0"}}>Avaliações</h1><p style={{margin:0,color:"#666"}}>{storeName||"Sua loja"}</p></div><div style={{display:"flex",gap:8}}><button onClick={load} style={{padding:"10px 14px",fontWeight:900}}>Atualizar</button><a href="/" style={{padding:"10px 14px",borderRadius:9,background:"#111",color:"#f4c400",textDecoration:"none",fontWeight:900}}>← Painel</a></div></header>
  {message&&<div style={{padding:12,background:"#fff3c4",borderRadius:10,marginBottom:14}}>{message}</div>}
  {!loading&&<><section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:18}}>{[["Restaurante",metrics.store],["Entrega",metrics.delivery],["Tempo",metrics.time],["Sabor",metrics.taste],["Temperatura",metrics.temperature]].map(([label,value])=><div key={label} style={{background:"#fff",border:"1px solid #e4e4e4",borderRadius:14,padding:15}}><small style={{color:"#666",fontWeight:800}}>{label}</small><div style={{fontSize:27,fontWeight:900,marginTop:5}}>{value} <span style={{color:"#c49b00",fontSize:14}}>★</span></div></div>)}</section>
  <section style={{background:"#fff",borderRadius:16,padding:16,border:"1px solid #e4e4e4"}}><h2 style={{marginTop:0}}>Opiniões dos clientes</h2>{rows.map(r=><article key={r.id} style={{borderTop:"1px solid #eee",padding:"15px 0"}}><div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><b>{r.orderNumber?`Pedido #${r.orderNumber}`:"Pedido"} • {r.customerName}</b><div style={{fontSize:12,color:"#777",marginTop:3}}>{new Date(r.created_at).toLocaleString("pt-BR")}</div></div><b style={{color:"#a68100"}}>{stars(r.store_rating)}</b></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:7,fontSize:12,marginTop:10}}><span>Restaurante: <b>{stars(r.store_rating)}</b></span><span>Entrega: <b>{stars(r.delivery_rating??r.driver_rating)}</b></span><span>Tempo: <b>{stars(r.delivery_time_rating)}</b></span><span>Sabor: <b>{stars(r.taste_rating)}</b></span><span>Temperatura: <b>{stars(r.temperature_rating)}</b></span></div>{r.comment&&<p style={{background:"#f7f7f7",padding:10,borderRadius:10,marginBottom:0}}>“{r.comment}”</p>}</article>)}{!rows.length&&<p style={{color:"#777"}}>Ainda não há avaliações para esta loja.</p>}</section></>}
  {loading&&<p>Carregando avaliações...</p>}
 </main>;
}
