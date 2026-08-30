"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type HealthCheck={key:string;label:string;count:number;severity:"CRITICAL"|"WARNING"};
type Health={checked_at:string;status:"HEALTHY"|"ATTENTION";total_issues:number;checks:HealthCheck[]};
type PaymentProvider={provider:string;display_name:string;environment:string;enabled:boolean;credentials_configured:boolean;supported_methods:string[];updated_at:string};
type PayoutProvider={provider:string;display_name:string;environment:string;enabled:boolean;credentials_configured:boolean;automatic_processing:boolean;validated_at:string|null;updated_at:string};
type Payload={health:Health;providers:{payments:PaymentProvider|null;payouts:PayoutProvider|null};criticalSupportTickets:number};

const dt=(value:string|null|undefined)=>value?new Date(value).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"medium"}):"-";

export default function SaudeOperacional(){
 const[loading,setLoading]=useState(true);const[authorized,setAuthorized]=useState(false);const[data,setData]=useState<Payload|null>(null);const[message,setMessage]=useState("");
 const problems=useMemo(()=>data?.health.checks.filter(check=>Number(check.count)>0)??[],[data]);
 const healthy=!!data&&data.health.status==="HEALTHY"&&Number(data.health.total_issues)===0;

 async function load(){
  setLoading(true);setMessage("");
  const{data:sessionData}=await supabase.auth.getSession();const session=sessionData.session;
  if(!session){setAuthorized(false);setLoading(false);return;}
  const role=String(session.user.app_metadata?.clickfood_role??"");const ok=["SUPER_ADMIN","ADMIN","SUPPORT"].includes(role);setAuthorized(ok);
  if(!ok){setLoading(false);return;}
  const result=await supabase.functions.invoke("admin-operational-health",{body:{}});
  if(result.error||result.data?.error){setMessage("Não foi possível executar o diagnóstico operacional agora.");setLoading(false);return;}
  setData(result.data as Payload);setLoading(false);
 }
 useEffect(()=>{load();const timer=setInterval(load,60000);return()=>clearInterval(timer);},[]);

 if(loading&&!data)return <main className="authPage"><div className="authCard">Verificando saúde operacional...</div></main>;
 if(!authorized)return <main className="authPage"><div className="authCard"><h1>Acesso restrito</h1><p>Entre com Super Admin, Admin ou Suporte.</p><a href="/">Voltar</a></div></main>;

 const payment=data?.providers.payments;const payout=data?.providers.payouts;
 return <main className="content">
  <header className="topbar"><div><p className="eyebrow">MONITORAMENTO CLICK-FOOD</p><h1>Saúde operacional</h1><small>Integridade financeira e operacional verificada diretamente no backend</small></div><button className="logout" onClick={load} disabled={loading}>{loading?"VERIFICANDO...":"ATUALIZAR"}</button></header>
  {message&&<div className="notice">{message}</div>}
  {data&&<>
   <section className="panel" style={{marginBottom:16,borderColor:healthy?"#b7e4c7":"#f2c8a2"}}>
    <div className="panelTitle"><div><h2>{healthy?"✓ Operação íntegra":"⚠ Atenção operacional"}</h2><small>Última verificação: {dt(data.health.checked_at)} • atualização automática a cada 60 segundos</small></div><span className={`badge ${healthy?"active":"pending"}`}>{healthy?"SEM INCONSISTÊNCIAS":`${data.health.total_issues} ALERTA(S)`}</span></div>
    <p style={{margin:"10px 0 0",color:"#666",fontSize:13}}>{healthy?"Nenhuma inconsistência foi encontrada entre pedidos, pagamentos, entregas, estoque, caixas, estornos, repasses e agendadores críticos.":"Há itens que exigem análise. Os cartões abaixo mostram exatamente onde está a divergência."}</p>
   </section>

   <div className="metricGrid">
    <article className="metric"><p>Problemas encontrados</p><strong>{data.health.total_issues}</strong></article>
    <article className="metric"><p>Verificações</p><strong>{data.health.checks.length}</strong></article>
    <article className="metric"><p>Chamados críticos abertos</p><strong>{data.criticalSupportTickets}</strong></article>
    <article className="metric"><p>Efí cobrança</p><strong>{payment?.enabled&&payment?.credentials_configured?"ATIVA":"OFF"}</strong></article>
   </div>

   <section className="panel" style={{marginTop:16}}><div className="panelTitle"><div><h2>Verificações automáticas</h2><small>Zero significa operação consistente</small></div></div><div className="adminDataList">
    {data.health.checks.map(check=><div className="adminDataRow" key={check.key}><div><b>{check.label}</b><small>{check.severity==="CRITICAL"?"Integridade crítica":"Monitoramento preventivo"}</small></div><span className={`badge ${check.count===0?"active":check.severity==="CRITICAL"?"blocked":"pending"}`}>{check.count===0?"OK":`${check.count} ocorrência(s)`}</span></div>)}
   </div></section>

   <section className="panel" style={{marginTop:16}}><div className="panelTitle"><div><h2>Gateways e repasses</h2><small>Somente estado operacional; nenhuma credencial é exibida</small></div></div><div className="adminDataList">
    <div className="adminDataRow"><div><b>{payment?.display_name??"Efí Bank"} • pagamentos</b><small>{payment?.environment??"-"} • métodos liberados: {(payment?.supported_methods??[]).join(", ")||"nenhum"} • atualizado {dt(payment?.updated_at)}</small></div><span className={`badge ${payment?.enabled&&payment?.credentials_configured?"active":"pending"}`}>{payment?.enabled&&payment?.credentials_configured?"VALIDADO":"DESATIVADO"}</span></div>
    <div className="adminDataRow"><div><b>{payout?.display_name??"Efí Pix"} • repasses</b><small>{payout?.environment??"-"} • credenciais {payout?.credentials_configured?"validadas":"não validadas"} • automático {payout?.automatic_processing?"ON":"OFF"}</small></div><span className={`badge ${payout?.enabled?"active":"pending"}`}>{payout?.enabled?"ENVIO ATIVO":"ENVIO PROTEGIDO/OFF"}</span></div>
   </div></section>

   {problems.length>0&&<section className="panel" style={{marginTop:16}}><div className="panelTitle"><div><h2>Ações recomendadas</h2><small>Use os módulos da Matriz para analisar os alertas, sem correções automáticas destrutivas.</small></div></div><p style={{color:"#666",fontSize:13}}>Atualize esta tela após tratar o item. Se um estorno ou repasse falhar, consulte Pagamentos, Repasses e Suporte antes de tentar novamente.</p></section>}
  </>}
 </main>;
}
