"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type StoreRow={id:string;name:string;status:string};
type Permission={cash:boolean;pix:boolean;creditCardOnline:boolean;cardOnDelivery:boolean;debitCardOnDelivery:boolean};
type StoreEnabled=Permission;
type Key=keyof Permission;
const empty:Permission={cash:false,pix:false,creditCardOnline:false,cardOnDelivery:false,debitCardOnDelivery:false};
const labels:Record<Key,{title:string;hint:string}>={
 cash:{title:"Dinheiro",hint:"Pagamento em espécie na entrega ou retirada."},
 pix:{title:"PIX online • Efí",hint:"Cobrança PIX pelo aplicativo. Depende da Efí ativa."},
 creditCardOnline:{title:"Cartão online • Efí",hint:"Cartão tokenizado e cobrado no aplicativo."},
 cardOnDelivery:{title:"Crédito na entrega",hint:"Cliente paga na maquininha ao receber ou retirar."},
 debitCardOnDelivery:{title:"Débito na entrega",hint:"Cliente paga no débito pela maquininha ao receber ou retirar."},
};
const keys=Object.keys(labels) as Key[];

export default function StorePaymentMethodsManager(){
 const[stores,setStores]=useState<StoreRow[]>([]);const[permissions,setPermissions]=useState<Record<string,Permission>>({});const[enabled,setEnabled]=useState<Record<string,StoreEnabled>>({});const[message,setMessage]=useState("");const[busy,setBusy]=useState("");
 const[efi,setEfi]=useState({pix:false,card:false});
 const activeCount=useMemo(()=>stores.filter(s=>s.status==="ACTIVE").length,[stores]);
 async function load(){
  const[{data:storeRows,error:storeError},{data:permissionRows,error:permissionError},{data:methodRows,error:methodError},{data:providerRows}]=await Promise.all([
   supabase.from("stores").select("id,name,status").order("name"),
   supabase.from("store_payment_permissions").select("store_id,cash_allowed,pix_allowed,credit_card_online_allowed,card_on_delivery_allowed,debit_card_on_delivery_allowed"),
   supabase.from("store_payment_methods").select("store_id,cash_enabled,pix_enabled,credit_card_online_enabled,card_on_delivery_enabled,debit_card_on_delivery_enabled"),
   supabase.from("payment_provider_configs").select("provider,environment,enabled,credentials_configured,supported_methods").in("provider",["EFI","EFI_BANK"]),
  ]);
  if(storeError||permissionError||methodError){setMessage("Não foi possível carregar as regras de pagamento das lojas.");return;}
  const production=(providerRows??[]).filter((p:any)=>p.environment==="PRODUCTION"&&p.enabled&&p.credentials_configured);
  setEfi({pix:production.some((p:any)=>(p.supported_methods??[]).includes("PIX")),card:production.some((p:any)=>(p.supported_methods??[]).includes("CREDIT_CARD"))});
  setStores((storeRows??[]) as StoreRow[]);
  const nextPermissions:Record<string,Permission>={};
  for(const row of permissionRows??[])nextPermissions[String((row as any).store_id)]={cash:Boolean((row as any).cash_allowed),pix:Boolean((row as any).pix_allowed),creditCardOnline:Boolean((row as any).credit_card_online_allowed),cardOnDelivery:Boolean((row as any).card_on_delivery_allowed),debitCardOnDelivery:Boolean((row as any).debit_card_on_delivery_allowed)};
  const nextEnabled:Record<string,StoreEnabled>={};
  for(const row of methodRows??[])nextEnabled[String((row as any).store_id)]={cash:Boolean((row as any).cash_enabled),pix:Boolean((row as any).pix_enabled),creditCardOnline:Boolean((row as any).credit_card_online_enabled),cardOnDelivery:Boolean((row as any).card_on_delivery_enabled),debitCardOnDelivery:Boolean((row as any).debit_card_on_delivery_enabled)};
  setPermissions(nextPermissions);setEnabled(nextEnabled);
 }
 useEffect(()=>{void load();},[]);
 function current(storeId:string){return permissions[storeId]??empty;}
 async function toggle(storeId:string,key:Key){
  const before=current(storeId);const value=!before[key];
  if(key==="pix"&&value&&!efi.pix){setMessage("Valide o PIX Efí global antes de autorizá-lo para uma loja.");return;}
  if(key==="creditCardOnline"&&value&&!efi.card){setMessage("Valide o cartão Efí global antes de autorizá-lo para uma loja.");return;}
  const next={...before,[key]:value};setPermissions(all=>({...all,[storeId]:next}));setBusy(`${storeId}:${key}`);setMessage("");
  const{data,error}=await supabase.functions.invoke("admin-store-permissions",{body:{action:"UPDATE",storeId,payments:next}});
  if(error||data?.error){setPermissions(all=>({...all,[storeId]:before}));setMessage("Não foi possível salvar a autorização da Matriz.");}
  else{setMessage(value?"Método autorizado pela Matriz. O Lojista poderá ativá-lo.":"Método bloqueado pela Matriz e retirado imediatamente da loja.");await load();}
  setBusy("");
 }
 return <section className="adminPanel" style={{marginBottom:18}}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}><div><h2>Autorizações de pagamento por loja</h2><p className="muted"><strong>Hierarquia:</strong> Matriz autoriza → Lojista ativa/desativa → Cliente vê somente o que estiver efetivamente liberado.</p></div><button type="button" onClick={()=>void load()}>Atualizar</button></div>
  <p className="muted">{activeCount} loja(s) ativa(s) • PIX Efí {efi.pix?"disponível":"indisponível"} • cartão online Efí {efi.card?"disponível":"indisponível"}</p>
  {message&&<div className="adminNotice" style={{marginBottom:12}}>{message}</div>}
  <div className="adminList">{stores.map(store=>{const cfg=current(store.id),storeChoice=enabled[store.id]??empty;return <div key={store.id} style={{display:"block",padding:"16px"}}>
   <div style={{display:"flex",justifyContent:"space-between",gap:10,marginBottom:10}}><div><b>{store.name}</b><small>{store.status} • a Matriz define o limite; a loja escolhe dentro dele</small></div></div>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:8}}>{keys.map(key=>{const providerUnavailable=(key==="pix"&&!efi.pix)||(key==="creditCardOnline"&&!efi.card);const on=cfg[key];const chosen=storeChoice[key];return <button type="button" key={key} disabled={busy===`${store.id}:${key}`||providerUnavailable} onClick={()=>void toggle(store.id,key)} style={{textAlign:"left",padding:12,borderRadius:12,border:`1px solid ${on?"#c69c00":"#ddd"}`,background:on?"#fff7cc":"#fff",opacity:providerUnavailable?.55:1,cursor:providerUnavailable?"not-allowed":"pointer"}}><span style={{fontWeight:900}}>{on?"✓ AUTORIZADO • ":"○ BLOQUEADO • "}{labels[key].title}</span><small style={{display:"block",marginTop:4,color:"#666"}}>{labels[key].hint}</small><small style={{display:"block",marginTop:5,fontWeight:800,color:chosen&&on?"#176a3a":"#777"}}>Lojista: {chosen&&on?"ATIVO":"INATIVO"}</small></button>})}</div>
  </div>})}{!stores.length&&<p className="muted">Nenhuma loja cadastrada.</p>}</div>
 </section>;
}
