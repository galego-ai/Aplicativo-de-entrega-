"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Props={storeId:string};
type StorePauseStatus={orders_paused:boolean;effective_open:boolean;status:string};

export default function StoreOrderPauseControl({storeId}:Props){
  const[loading,setLoading]=useState(true);const[busy,setBusy]=useState(false);const[status,setStatus]=useState<StorePauseStatus|null>(null);const[canManage,setCanManage]=useState(false);const[message,setMessage]=useState("");

  async function load(){
    setLoading(true);setMessage("");
    const{data,error}=await supabase.functions.invoke("store-order-pause",{body:{storeId,action:"STATUS"}});
    if(error||data?.error){setMessage("Não foi possível consultar o recebimento de pedidos.");setLoading(false);return;}
    setStatus(data.store as StorePauseStatus);setCanManage(Boolean(data.canManage));setLoading(false);
  }

  useEffect(()=>{void load();},[storeId]);

  async function toggle(){
    if(!status||!canManage||busy)return;
    const next=!status.orders_paused;setBusy(true);setMessage("");
    const{data,error}=await supabase.functions.invoke("store-order-pause",{body:{storeId,action:"SET",paused:next}});
    if(error||data?.error){setMessage("Não foi possível alterar o recebimento de pedidos agora.");setBusy(false);return;}
    setStatus(data.store as StorePauseStatus);setCanManage(Boolean(data.canManage));
    setMessage(next?"Novos pedidos foram pausados. Pedidos já criados continuam normalmente.":"Novos pedidos foram retomados. Os horários cadastrados continuam valendo.");
    setBusy(false);
  }

  const paused=Boolean(status?.orders_paused);
  const label=paused?"PEDIDOS PAUSADOS":status?.effective_open?"ACEITANDO PEDIDOS":"FORA DO HORÁRIO";
  const accent=paused?"#991b1b":status?.effective_open?"#166534":"#854d0e";
  const background=paused?"#fef2f2":status?.effective_open?"#f0fdf4":"#fffbeb";

  return <section style={{marginBottom:18,border:"1px solid #e5e7eb",borderRadius:16,padding:16,background:"#fff",boxShadow:"0 8px 24px rgba(15,23,42,.06)"}}>
    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16,flexWrap:"wrap"}}>
      <div style={{flex:"1 1 360px"}}><small style={{fontWeight:800,letterSpacing:1,color:"#6b7280"}}>OPERAÇÃO DA LOJA</small><h2 style={{margin:"4px 0 6px",fontSize:20}}>Recebimento de novos pedidos</h2><p style={{margin:0,color:"#59616f",lineHeight:1.55}}>A pausa bloqueia somente novos pedidos. Pedidos já criados continuam normalmente e o status administrativo da loja não é alterado.</p></div>
      <div style={{minWidth:190,borderRadius:12,padding:"10px 13px",background,color:accent,fontWeight:900,textAlign:"center"}}>{loading?"CONSULTANDO...":label}</div>
    </div>
    {!!message&&<div style={{marginTop:12,borderRadius:10,padding:"10px 12px",background:"#f8fafc",color:"#334155",fontSize:13}}>{message}</div>}
    {!loading&&status&&<div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginTop:14}}>
      {canManage?<button type="button" onClick={toggle} disabled={busy} style={{border:0,borderRadius:10,padding:"11px 16px",fontWeight:900,cursor:busy?"wait":"pointer",background:paused?"#f4c400":"#111827",color:paused?"#111827":"#fff",opacity:busy?.7:1}}>{busy?"SALVANDO...":paused?"RETOMAR NOVOS PEDIDOS":"PAUSAR NOVOS PEDIDOS"}</button>:<span style={{fontSize:13,color:"#6b7280"}}>Seu acesso permite consultar este estado, mas não alterá-lo.</span>}
      {!paused&&!status.effective_open&&<span style={{fontSize:13,color:"#6b7280"}}>A loja retomará pedidos automaticamente quando estiver dentro do horário cadastrado.</span>}
    </div>}
  </section>;
}
