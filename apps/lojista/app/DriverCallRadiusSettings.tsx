"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Props={storeId:string;role:string};

export default function DriverCallRadiusSettings({storeId,role}:Props){
 const[loading,setLoading]=useState(true);
 const[saving,setSaving]=useState(false);
 const[radius,setRadius]=useState(5);
 const[matrixMax,setMatrixMax]=useState(20);
 const[message,setMessage]=useState("");
 const canManage=["OWNER","MANAGER"].includes(role);
 const safeMax=Math.max(1,Number(matrixMax||20));
 const percent=useMemo(()=>Math.min(100,Math.max(0,(radius/safeMax)*100)),[radius,safeMax]);

 async function load(){
  setLoading(true);setMessage("");
  const{data,error}=await supabase.functions.invoke("store-driver-call-radius",{body:{storeId}});
  if(error||data?.error){setMessage("Não foi possível carregar o raio de chamada.");setLoading(false);return;}
  const nextMax=Number(data.settings?.matrix_max_radius_km??20);
  const nextRadius=Number(data.settings?.driver_call_radius_km??Math.min(5,nextMax));
  setMatrixMax(nextMax);setRadius(Math.min(nextRadius,nextMax));setLoading(false);
 }
 useEffect(()=>{void load();},[storeId]);

 async function save(){
  if(!canManage){setMessage("Somente Proprietário ou Gerente pode alterar o raio de chamada.");return;}
  const value=Number(radius);
  if(!Number.isFinite(value)||value<=0||value>safeMax){setMessage(`Informe um raio entre 0,5 e ${safeMax} km.`);return;}
  setSaving(true);setMessage("");
  const{data,error}=await supabase.functions.invoke("store-driver-call-radius",{body:{storeId,driverCallRadiusKm:value}});
  if(error||data?.error){
   if(data?.error==="RADIUS_EXCEEDS_MATRIX_LIMIT")setMessage(`A Matriz permite no máximo ${Number(data.matrixMaxRadius??safeMax)} km nesta cidade.`);
   else setMessage("Não foi possível salvar o raio de chamada.");
   setSaving(false);return;
  }
  setRadius(Number(data.settings?.driver_call_radius_km??value));
  setMatrixMax(Number(data.settings?.matrix_max_radius_km??safeMax));
  setMessage(`Raio salvo. O CLICK-FOOD chamará entregadores em até ${value.toLocaleString("pt-BR")} km da loja.`);
  setSaving(false);
 }

 const styles={
  card:{marginBottom:16,border:"1px solid #e5e5e5",background:"#fff",borderRadius:18,padding:18,boxShadow:"0 8px 28px rgba(0,0,0,.06)"} as const,
  head:{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start",marginBottom:14,flexWrap:"wrap" as const} as const,
  kicker:{fontSize:10,fontWeight:900,letterSpacing:1.2,color:"#8b6e00"} as const,
  title:{fontSize:21,margin:"4px 0 5px",color:"#171717"} as const,
  desc:{margin:0,color:"#666",fontSize:13,lineHeight:1.5,maxWidth:720} as const,
  badge:{background:"#111",color:"#f4c400",borderRadius:999,padding:"9px 12px",fontWeight:900,fontSize:12,whiteSpace:"nowrap" as const} as const,
  meter:{height:9,borderRadius:999,background:"#eee",overflow:"hidden",margin:"13px 0 8px"} as const,
  fill:{height:"100%",width:`${percent}%`,background:"#f4c400"} as const,
  row:{display:"grid",gridTemplateColumns:"minmax(0,1fr) 130px",gap:12,alignItems:"end"} as const,
  label:{display:"grid",gap:7,fontWeight:800,fontSize:12,color:"#333"} as const,
  input:{width:"100%",border:"1px solid #d8d8d8",borderRadius:11,padding:"11px 12px",fontSize:15,background:"#fff"} as const,
  range:{width:"100%",accentColor:"#f4c400"} as const,
  quick:{display:"flex",gap:7,flexWrap:"wrap" as const,marginTop:12} as const,
  chip:{border:"1px solid #d6b000",background:"#fff9d6",borderRadius:999,padding:"7px 11px",fontWeight:900,fontSize:11,cursor:"pointer"} as const,
  note:{marginTop:13,background:"#fff9d8",border:"1px solid #ead36d",borderRadius:12,padding:"11px 12px",fontSize:12,lineHeight:1.5,color:"#4c3d00"} as const,
  button:{marginTop:13,border:0,borderRadius:12,background:"#111",color:"#f4c400",padding:"12px 16px",fontWeight:900,cursor:"pointer"} as const,
  muted:{opacity:.55,cursor:"not-allowed"} as const,
  msg:{marginTop:11,borderRadius:10,padding:"9px 11px",background:"#f3f3f3",fontSize:12,fontWeight:700,color:"#444"} as const,
 };

 if(loading)return <section style={styles.card}><b>Carregando raio de chamada dos entregadores...</b></section>;
 return <section style={styles.card}>
  <div style={styles.head}><div><div style={styles.kicker}>DESPACHO CLICK-FOOD</div><h2 style={styles.title}>Raio para chamar entregadores</h2><p style={styles.desc}>Defina até que distância da sua loja um entregador online poderá receber a oferta. Este raio é diferente do raio de entrega ao cliente.</p></div><div style={styles.badge}>{radius.toLocaleString("pt-BR")} km</div></div>
  <div style={styles.row}>
   <label style={styles.label}>Ajuste rápido<input style={styles.range} type="range" min={0.5} max={safeMax} step={0.5} value={Math.min(radius,safeMax)} disabled={!canManage} onChange={e=>setRadius(Number(e.target.value))}/></label>
   <label style={styles.label}>Raio em km<input style={styles.input} type="number" inputMode="decimal" min={0.5} max={safeMax} step={0.5} value={radius} disabled={!canManage} onChange={e=>setRadius(Number(e.target.value))}/></label>
  </div>
  <div style={styles.meter}><div style={styles.fill}/></div>
  <div style={styles.quick}>{[2,3,5,8,10,15,20].filter(v=>v<=safeMax).map(v=><button key={v} type="button" style={styles.chip} disabled={!canManage} onClick={()=>setRadius(v)}>{v} km</button>)}</div>
  <div style={styles.note}><strong>Como funciona:</strong> se você escolher 5 km, somente entregadores online e com localização recente em até 5 km da loja entram na busca. O limite máximo definido pela Matriz para esta cidade é <strong>{safeMax.toLocaleString("pt-BR")} km</strong>.</div>
  <button type="button" style={{...styles.button,...((saving||!canManage)?styles.muted:{})}} disabled={saving||!canManage} onClick={()=>void save()}>{saving?"SALVANDO...":"SALVAR RAIO DE CHAMADA"}</button>
  {!canManage&&<div style={styles.msg}>Seu acesso é somente consulta. Proprietário ou Gerente pode alterar esta configuração.</div>}
  {!!message&&<div style={styles.msg}>{message}</div>}
 </section>;
}
