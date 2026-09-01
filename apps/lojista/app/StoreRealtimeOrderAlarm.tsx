"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type PendingOrder={id:string;order_number:number;created_at:string};

export default function StoreRealtimeOrderAlarm(){
 const[storeId,setStoreId]=useState("");
 const[pending,setPending]=useState<PendingOrder[]>([]);
 const[audioEnabled,setAudioEnabled]=useState(false);
 const audioContextRef=useRef<AudioContext|null>(null);
 const timerRef=useRef<ReturnType<typeof setInterval>|null>(null);

 async function enableAudio(){
  try{
   const AudioCtx=window.AudioContext||((window as any).webkitAudioContext as typeof AudioContext|undefined);
   if(!AudioCtx)return;
   const ctx=audioContextRef.current??new AudioCtx();
   audioContextRef.current=ctx;
   if(ctx.state==="suspended")await ctx.resume();
   setAudioEnabled(true);
   localStorage.setItem("clickfood-order-audio","enabled");
   beep();
  }catch{}
 }

 function beep(){
  const ctx=audioContextRef.current;
  if(!ctx||ctx.state!=="running")return;
  try{
   const oscillator=ctx.createOscillator();
   const gain=ctx.createGain();
   oscillator.type="sine";
   oscillator.frequency.setValueAtTime(880,ctx.currentTime);
   gain.gain.setValueAtTime(0.0001,ctx.currentTime);
   gain.gain.exponentialRampToValueAtTime(0.16,ctx.currentTime+0.015);
   gain.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.34);
   oscillator.connect(gain);gain.connect(ctx.destination);
   oscillator.start();oscillator.stop(ctx.currentTime+0.36);
  }catch{}
 }

 useEffect(()=>{
  let active=true;
  void (async()=>{
   const{data}=await supabase.auth.getSession();
   const userId=data.session?.user.id;
   if(!userId)return;
   const{data:membership}=await supabase.from("store_memberships").select("store_id").eq("user_id",userId).eq("active",true).limit(1).maybeSingle();
   if(active&&membership?.store_id)setStoreId(String(membership.store_id));
  })();
  return()=>{active=false;};
 },[]);

 useEffect(()=>{
  if(!storeId)return;
  let refreshTimer:ReturnType<typeof setTimeout>|null=null;
  const load=async()=>{
   const{data}=await supabase.from("orders").select("id,order_number,created_at").eq("store_id",storeId).eq("status","WAITING_STORE").order("created_at",{ascending:true}).limit(20);
   setPending((data??[]) as PendingOrder[]);
  };
  const refresh=()=>{if(refreshTimer)clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>void load(),120);};
  void load();
  const channel=supabase.channel(`store-order-alarm-${storeId}`).on("postgres_changes",{event:"*",schema:"public",table:"orders",filter:`store_id=eq.${storeId}`},refresh).subscribe();
  return()=>{if(refreshTimer)clearTimeout(refreshTimer);void supabase.removeChannel(channel);};
 },[storeId]);

 useEffect(()=>{
  if(timerRef.current){clearInterval(timerRef.current);timerRef.current=null;}
  if(!pending.length||!audioEnabled)return;
  beep();
  timerRef.current=setInterval(beep,3200);
  return()=>{if(timerRef.current){clearInterval(timerRef.current);timerRef.current=null;}};
 },[pending.length,audioEnabled]);

 useEffect(()=>{
  if(typeof window==="undefined")return;
  if(localStorage.getItem("clickfood-order-audio")!=="enabled")return;
  const unlock=()=>{void enableAudio();window.removeEventListener("pointerdown",unlock);};
  window.addEventListener("pointerdown",unlock,{once:true});
  return()=>window.removeEventListener("pointerdown",unlock);
 },[]);

 if(!storeId)return null;
 const first=pending[0];
 return <>
  {!audioEnabled&&<button type="button" onClick={()=>void enableAudio()} style={{position:"fixed",right:16,bottom:88,zIndex:10000,border:"1px solid #d7b500",background:"#fff8cf",color:"#332b00",borderRadius:999,padding:"10px 14px",fontWeight:900,fontSize:12,boxShadow:"0 8px 24px rgba(0,0,0,.14)",cursor:"pointer"}}>🔔 Ativar som dos pedidos</button>}
  {first&&<aside role="alert" aria-live="assertive" style={{position:"fixed",right:16,top:16,zIndex:10001,width:"min(390px,calc(100vw - 32px))",background:"#111",color:"#fff",border:"3px solid #f4c400",borderRadius:18,padding:16,boxShadow:"0 18px 50px rgba(0,0,0,.35)"}}>
   <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start"}}><div><div style={{color:"#f4c400",fontSize:10,fontWeight:900,letterSpacing:1.2}}>NOVO PEDIDO</div><div style={{fontSize:24,fontWeight:950,marginTop:3}}>Pedido #{first.order_number}</div><div style={{color:"#cfcfcf",fontSize:12,marginTop:5}}>{pending.length===1?"1 pedido aguardando decisão":`${pending.length} pedidos aguardando decisão`}</div></div><span style={{fontSize:30}}>🍽️</span></div>
   <p style={{fontSize:12,lineHeight:1.45,color:"#ddd",margin:"12px 0"}}>O alerta permanece enquanto houver pedido em <b>Aguardando a loja</b>. Aceite ou recuse pela Cozinha/Pedidos.</p>
   <a href="/cozinha" style={{display:"block",textAlign:"center",background:"#f4c400",color:"#111",borderRadius:11,padding:"11px 14px",fontWeight:950,textDecoration:"none"}}>ABRIR COZINHA E RESPONDER</a>
  </aside>}
 </>;
}
