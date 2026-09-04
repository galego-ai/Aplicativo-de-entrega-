"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type StoreRow={id:string;name:string;status:string};
type ConfigRow={
 store_id:string;
 cash_enabled:boolean;
 pix_enabled:boolean;
 credit_card_online_enabled:boolean;
 card_on_delivery_enabled:boolean;
 debit_card_on_delivery_enabled:boolean;
 updated_at?:string;
};

type Key=Exclude<keyof ConfigRow,"store_id"|"updated_at">;
const labels:Record<Key,{title:string;hint:string}>={
 cash_enabled:{title:"Dinheiro",hint:"Pagamento em espécie na entrega ou retirada."},
 pix_enabled:{title:"PIX online • Efí",hint:"Cobrança PIX pelo aplicativo. Depende da Efí ativa."},
 credit_card_online_enabled:{title:"Cartão online • Efí",hint:"Cartão tokenizado e cobrado no aplicativo."},
 card_on_delivery_enabled:{title:"Crédito na entrega",hint:"Cliente paga na maquininha ao receber ou retirar."},
 debit_card_on_delivery_enabled:{title:"Débito na entrega",hint:"Cliente paga no débito pela maquininha ao receber ou retirar."},
};
const keys=Object.keys(labels) as Key[];

export default function StorePaymentMethodsManager(){
 const[stores,setStores]=useState<StoreRow[]>([]);const[configs,setConfigs]=useState<Record<string,ConfigRow>>({});const[message,setMessage]=useState("");const[busy,setBusy]=useState("");
 const[efi,setEfi]=useState({pix:false,card:false});
 const activeCount=useMemo(()=>stores.filter(s=>s.status==="ACTIVE").length,[stores]);
 async function load(){
  const[{data:storeRows,error:storeError},{data:configRows,error:configError},{data:providers}]=await Promise.all([
   supabase.from("stores").select("id,name,status").order("name"),
   supabase.from("store_payment_methods").select("store_id,cash_enabled,pix_enabled,credit_card_online_enabled,card_on_delivery_enabled,debit_card_on_delivery_enabled,updated_at"),
   supabase.from("payment_provider_configs").select("provider,enabled,credentials_configured,supported_methods").eq("provider","EFI").maybeSingle(),
  ]);
  if(storeError||configError){setMessage("Não foi possível carregar os meios de pagamento das lojas.");return;}
  const provider:any=providers;const methods=(provider?.supported_methods??[]) as string[];
  setEfi({pix:!!provider?.enabled&&!!provider?.credentials_configured&&methods.includes("PIX"),card:!!provider?.enabled&&!!provider?.credentials_configured&&methods.includes("CREDIT_CARD")});
  setStores((storeRows??[]) as StoreRow[]);
  const next:Record<string,ConfigRow>={};for(const row of (configRows??[]) as ConfigRow[])next[row.store_id]=row;setConfigs(next);
 }
 useEffect(()=>{void load();},[]);
 function current(storeId:string):ConfigRow{return configs[storeId]??{store_id:storeId,cash_enabled:true,pix_enabled:false,credit_card_online_enabled:false,card_on_delivery_enabled:false,debit_card_on_delivery_enabled:false};}
 async function toggle(storeId:string,key:Key){
  const before=current(storeId);const value=!before[key];
  if(key==="pix_enabled"&&value&&!efi.pix){setMessage("Ative e valide o PIX Efí global antes de liberá-lo para uma loja.");return;}
  if(key==="credit_card_online_enabled"&&value&&!efi.card){setMessage("Ative e valide o cartão Efí global antes de liberá-lo para uma loja.");return;}
  const next={...before,[key]:value,updated_at:new Date().toISOString()};setConfigs(all=>({...all,[storeId]:next}));setBusy(`${storeId}:${key}`);setMessage("");
  const{data:{session}}=await supabase.auth.getSession();
  const{error}=await supabase.from("store_payment_methods").upsert({...next,updated_by:session?.user.id??null},{onConflict:"store_id"});
  if(error){setConfigs(all=>({...all,[storeId]:before}));setMessage("Não foi possível salvar esta configuração.");}else setMessage("Meio de pagamento atualizado para a loja.");
  setBusy("");
 }
 return <section className="adminPanel" style={{marginBottom:18}}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}><div><h2>Meios de pagamento por loja</h2><p className="muted">A Matriz decide quais opções cada restaurante oferece no checkout. Crédito/débito na entrega não passam pela Efí.</p></div><button onClick={load}>Atualizar</button></div>
  <p className="muted">{activeCount} loja(s) ativa(s) • PIX Efí {efi.pix?"disponível":"indisponível"} • cartão online Efí {efi.card?"disponível":"indisponível"}</p>
  {message&&<div className="adminNotice" style={{marginBottom:12}}>{message}</div>}
  <div className="adminList">{stores.map(store=>{const cfg=current(store.id);return <div key={store.id} style={{display:"block",padding:"16px"}}>
   <div style={{display:"flex",justifyContent:"space-between",gap:10,marginBottom:10}}><div><b>{store.name}</b><small>{store.status}</small></div></div>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:8}}>{keys.map(key=>{const disabled=(key==="pix_enabled"&&!efi.pix)||(key==="credit_card_online_enabled"&&!efi.card);const on=cfg[key];return <button type="button" key={key} disabled={busy===`${store.id}:${key}`||disabled} onClick={()=>toggle(store.id,key)} style={{textAlign:"left",padding:12,borderRadius:12,border:`1px solid ${on?"#c69c00":"#ddd"}`,background:on?"#fff7cc":"#fff",opacity:disabled?.55:1,cursor:disabled?"not-allowed":"pointer"}}><span style={{fontWeight:900}}>{on?"✓ ":"○ "}{labels[key].title}</span><small style={{display:"block",marginTop:4,color:"#666"}}>{labels[key].hint}</small></button>})}</div>
  </div>})}{!stores.length&&<p className="muted">Nenhuma loja cadastrada.</p>}</div>
 </section>;
}
