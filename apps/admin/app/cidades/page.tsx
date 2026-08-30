"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type City={id:string;name:string;state:string;timezone:string};

const zones=[
  ["America/Sao_Paulo","Brasília / SP / RJ / MG / ES / GO / DF / Sul"],
  ["America/Cuiaba","Mato Grosso"],
  ["America/Campo_Grande","Mato Grosso do Sul"],
  ["America/Manaus","Amazonas"],
  ["America/Porto_Velho","Rondônia"],
  ["America/Boa_Vista","Roraima"],
  ["America/Rio_Branco","Acre"],
  ["America/Belem","Pará — região de Belém"],
  ["America/Santarem","Pará — região de Santarém"],
  ["America/Fortaleza","Ceará e parte do Nordeste"],
  ["America/Recife","Pernambuco"],
  ["America/Maceio","Alagoas"],
  ["America/Bahia","Bahia"],
  ["America/Araguaina","Tocantins"],
  ["America/Noronha","Fernando de Noronha"],
] as const;

export default function CidadesPage(){
  const[loading,setLoading]=useState(true);const[cities,setCities]=useState<City[]>([]);const[draft,setDraft]=useState<Record<string,string>>({});const[notice,setNotice]=useState("");
  async function load(){setLoading(true);setNotice("");const{data:s}=await supabase.auth.getSession();if(!s.session){setNotice("Entre na Matriz primeiro.");setLoading(false);return;}const role=String(s.session.user.app_metadata?.clickfood_role??"");if(!["SUPER_ADMIN","ADMIN","SUPPORT"].includes(role)){setNotice("Acesso administrativo necessário.");setLoading(false);return;}const{data,error}=await supabase.from("cities").select("id,name,state,timezone").eq("active",true).order("state").order("name");if(error){setNotice("Não foi possível carregar as cidades.");setLoading(false);return;}const rows=(data??[]) as City[];setCities(rows);setDraft(Object.fromEntries(rows.map(c=>[c.id,c.timezone||"America/Sao_Paulo"])));setLoading(false);}
  useEffect(()=>{load();},[]);
  async function save(city:City){const timezone=draft[city.id]||city.timezone;const{data,error}=await supabase.functions.invoke("admin-city-timezone",{body:{cityId:city.id,timezone}});if(error||data?.error){setNotice(data?.error==="INVALID_TIMEZONE"?"Fuso horário inválido.":"Não foi possível salvar o fuso horário.");return;}setNotice(`${city.name}-${city.state}: fuso atualizado para ${data.city.timezone}.`);await load();}
  if(loading)return <main className="authPage"><div className="authCard">Carregando cidades...</div></main>;
  return <main className="content standaloneAdmin"><header className="topbar"><div><p className="eyebrow">MATRIZ CLICK-FOOD</p><h1>Cidades e fuso horário</h1><small>O horário de abertura, fechamento e aceitação de pedidos usa o fuso configurado aqui.</small></div><a className="logout adminLink" href="/">← Voltar à Matriz</a></header>{notice&&<div className="notice">{notice}</div>}<section className="panel adminStandalonePanel"><div className="panelTitle"><div><h2>Fuso operacional</h2><small>{cities.length} cidade(s) ativa(s)</small></div><button className="primary" onClick={load}>Atualizar</button></div><div className="adminDataList">{cities.map(city=><div className="adminDataRow" key={city.id}><div><b>{city.name} - {city.state}</b><small>Atual: {city.timezone}</small></div><select value={draft[city.id]??city.timezone} onChange={e=>setDraft({...draft,[city.id]:e.target.value})}>{zones.map(([value,label])=><option key={value} value={value}>{label} — {value}</option>)}</select><button onClick={()=>save(city)}>Salvar fuso</button></div>)}{!cities.length&&<div className="emptyState">Nenhuma cidade ativa cadastrada.</div>}</div></section><section className="panel adminStandalonePanel"><h2>Regra aplicada</h2><p>Se a loja tiver horário configurado, a cotação e o checkout são avaliados no horário local da cidade. Horários que atravessam a meia-noite também são tratados automaticamente.</p></section></main>;
}
