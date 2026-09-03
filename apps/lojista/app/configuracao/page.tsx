"use client";

import { useEffect, useState } from "react";
import StoreSettings from "../StoreSettings";
import StoreOrderPauseControl from "../StoreOrderPauseControl";
import DriverCallRadiusSettings from "../DriverCallRadiusSettings";
import { supabase } from "../../lib/supabase";

type Store={id:string;name:string;role:string};

export default function ConfiguracaoPage(){
 const[loading,setLoading]=useState(true);const[store,setStore]=useState<Store|null>(null);const[message,setMessage]=useState("");
 async function load(){setLoading(true);const{data:sessionData}=await supabase.auth.getSession();if(!sessionData.session){setMessage("Entre no Painel Lojista antes de configurar a loja.");setLoading(false);return;}const{data,error}=await supabase.from("store_memberships").select("store_id,role,stores!inner(name)").eq("user_id",sessionData.session.user.id).eq("active",true).limit(1);if(error||!data?.length){setMessage("Sua conta ainda não está vinculada a uma loja.");setLoading(false);return;}const row=data[0] as any;const relation=Array.isArray(row.stores)?row.stores[0]:row.stores;setStore({id:row.store_id,name:relation?.name??"Minha loja",role:row.role});setLoading(false);}
 useEffect(()=>{void load();},[]);
 if(loading)return <main className="configPage"><div className="configShell"><p>Carregando configurações...</p></div></main>;
 if(!store)return <main className="configPage"><div className="configShell"><div className="logo"><span>CLICK</span>-FOOD</div><h1>Configuração da loja</h1><p>{message}</p><a className="backLink" href="/">Voltar ao painel</a></div></main>;
 return <main className="configPage"><div className="configShell"><header className="configHeader"><div><div className="logo"><span>CLICK</span>-FOOD</div><small>{store.name} • {store.role}</small><h1>Configuração da loja</h1><p>Identidade visual, dados administrativos, localização, atendimento e horários.</p></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><a className="backLink" href="/produtos">Produtos</a><a className="backLink" href="/">← Voltar ao painel</a></div></header><div style={{marginBottom:16,border:"1px solid #e6cf62",background:"#fff9d8",borderRadius:14,padding:"13px 15px",color:"#4b3d00",fontSize:13,lineHeight:1.5}}><strong>🔒 Contatos são dados administrativos internos.</strong><br/>Telefone, WhatsApp, e-mail e redes sociais cadastrados nesta área servem somente para relacionamento da Matriz/suporte com a loja. Eles <strong>não são enviados ao catálogo público nem exibidos ao cliente</strong>. Toda compra e comunicação do pedido permanece dentro do CLICK-FOOD.</div><StoreOrderPauseControl storeId={store.id}/><DriverCallRadiusSettings storeId={store.id} role={store.role}/><StoreSettings storeId={store.id} role={store.role} onChanged={()=>void load()}/></div></main>;
}
