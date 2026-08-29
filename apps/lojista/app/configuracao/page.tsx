"use client";

import { useEffect, useState } from "react";
import StoreSetup from "../StoreSetup";
import { supabase } from "../../lib/supabase";

type Store = { id:string; name:string; role:string };

export default function ConfiguracaoPage(){
  const[loading,setLoading]=useState(true); const[store,setStore]=useState<Store|null>(null); const[message,setMessage]=useState("");
  async function load(){setLoading(true);const{data:sessionData}=await supabase.auth.getSession();if(!sessionData.session){setMessage("Entre no painel do lojista antes de configurar a loja.");setLoading(false);return;}const{data,error}=await supabase.from("store_memberships").select("store_id,role,stores!inner(name)").eq("user_id",sessionData.session.user.id).eq("active",true).limit(1);if(error||!data?.length){setMessage("Sua conta ainda não está vinculada a uma loja.");setLoading(false);return;}const row=data[0] as any;const relation=Array.isArray(row.stores)?row.stores[0]:row.stores;setStore({id:row.store_id,name:relation?.name??"Minha loja",role:row.role});setLoading(false);}
  useEffect(()=>{load();},[]);
  if(loading)return <main className="configPage"><div className="configShell"><p>Carregando configurações...</p></div></main>;
  if(!store)return <main className="configPage"><div className="configShell"><div className="logo"><span>CLICK</span>-FOOD</div><h1>Configuração da loja</h1><p>{message}</p><a className="backLink" href="/">Voltar ao login/PDV</a></div></main>;
  return <main className="configPage"><div className="configShell"><header className="configHeader"><div><div className="logo"><span>CLICK</span>-FOOD</div><small>{store.name} • {store.role}</small><h1>Configuração da loja</h1></div><a className="backLink" href="/">← Voltar ao PDV</a></header><StoreSetup storeId={store.id} onChanged={()=>{}}/></div></main>;
}
