"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type HealthCheck={key:string;label:string;count:number;severity:"CRITICAL"|"WARNING"};
type Health={checked_at:string;status:"HEALTHY"|"ATTENTION";total_issues:number;checks:HealthCheck[]};
type PaymentProvider={provider:string;display_name:string;environment:string;enabled:boolean;credentials_configured:boolean;supported_methods:string[];updated_at:string};
type PayoutProvider={provider:string;display_name:string;environment:string;enabled:boolean;credentials_configured:boolean;automatic_processing:boolean;validated_at:string|null;updated_at:string};
type ReadinessStatus="READY"|"ATTENTION"|"PENDING_EXTERNAL"|"DEFERRED"|"READY_PROTECTED";
type ReadinessItem={key:string;label:string;status:ReadinessStatus;detail:string;blocking:boolean};
type Readiness={phaseStatus:"READY"|"BLOCKED"|"FUNCTIONAL_READY_EXTERNAL_PENDING";blockingCount:number;externalPendingCount:number;deferredCount:number;items:ReadinessItem[];metrics:{pushTokens:number;pendingDrivers:number;pendingDocuments:number;expiredDocuments:number;storesWithoutGps:number;storesWithoutCity:number;legalDocuments:number}};
type Payload={health:Health;providers:{payments:PaymentProvider|null;payouts:PayoutProvider|null};criticalSupportTickets:number;readiness:Readiness};

const dt=(value:string|null|undefined)=>value?new Date(value).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"medium"}):"-";
const readinessLabel:Record<ReadinessStatus,string>={READY:"PRONTO",ATTENTION:"ATENÇÃO",PENDING_EXTERNAL:"AÇÃO EXTERNA",DEFERRED:"ETAPA FINAL",READY_PROTECTED:"VALIDADO / OFF"};
const readinessClass=(status:ReadinessStatus)=>status==="READY"?"active":status==="ATTENTION"?"blocked":"pending";

export default function SaudeOperacional(){
 const[loading,setLoading]=useState(true);const[authorized,setAuthorized]=useState(false);const[data,setData]=useState<Payload|null>(null);const[message,setMessage]=useState("");
 const problems=useMemo(()=>data?.health.checks.filter(check=>Number(check.count)>0)??[],[data]);
 const healthy=!!data&&data.health.status==="HEALTHY"&&Number(data.health.total_issues)===0;
 const functionalReady=data?.readiness?.phaseStatus==="FUNCTIONAL_READY_EXTERNAL_PENDING"||data?.readiness?.phaseStatus==="READY";

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
  <header className="topbar"><div><p className="eyebrow">MONITORAMENTO CLICK-FOOD</p><h1>Saúde e prontidão</h1><small>Integridade do sistema + checklist objetivo para chegar à produção</small></div><button className="logout" onClick={load} disabled={loading}>{loading?"VERIFICANDO...":"ATUALIZAR"}</button></header>
  {message&&<div className="notice">{message}</div>}
  {data&&<>
   <section className="panel" style={{marginBottom:16,borderColor:healthy?"#b7e4c7":"#f2c8a2"}}>
    <div className="panelTitle"><div><h2>{healthy?"✓ Operação íntegra":"⚠ Atenção operacional"}</h2><small>Última verificação: {dt(data.health.checked_at)} • atualização automática a cada 60 segundos</small></div><span className={`badge ${healthy?"active":"pending"}`}>{healthy?"SEM INCONSISTÊNCIAS":`${data.health.total_issues} ALERTA(S)`}</span></div>
    <p style={{margin:"10px 0 0",color:"#666",fontSize:13}}>{healthy?"Nenhuma inconsistência foi encontrada entre pedidos, pagamentos, entregas, estoque, caixas, estornos, repasses e agendadores críticos.":"Há itens que exigem análise. As verificações abaixo mostram exatamente onde está a divergência."}</p>
   </section>

   <section className="panel" style={{marginBottom:16,borderColor:functionalReady?"#d6e8c8":"#f0b8b0"}}>
    <div className="panelTitle"><div><h2>{functionalReady?"✓ Núcleo funcional pronto":"⚠ Há bloqueios antes da etapa final"}</h2><small>Integrações externas pendentes ficam separadas das falhas operacionais</small></div><span className={`badge ${functionalReady?"active":"blocked"}`}>{data.readiness.phaseStatus==="READY"?"PRONTO":data.readiness.phaseStatus==="BLOCKED"?"BLOQUEADO":"FUNCIONAL + EXTERNOS PENDENTES"}</span></div>
    <p style={{margin:"10px 0 0",color:"#666",fontSize:13}}>{functionalReady?"O CLICK-FOOD pode continuar para as ativações externas planejadas. Cartão/EAS não são tratados como erro do núcleo, e Google Maps/Mapbox continuam reservados para a última etapa.":`${data.readiness.blockingCount} bloqueio(s) funcional(is) precisam ser resolvidos antes das integrações finais.`}</p>
   </section>

   <div className="metricGrid">
    <article className="metric"><p>Problemas operacionais</p><strong>{data.health.total_issues}</strong></article>
    <article className="metric"><p>Pendências externas</p><strong>{data.readiness.externalPendingCount}</strong></article>
    <article className="metric"><p>Itens deixados para etapa final</p><strong>{data.readiness.deferredCount}</strong></article>
    <article className="metric"><p>Chamados críticos</p><strong>{data.criticalSupportTickets}</strong></article>
   </div>

   <section className="panel" style={{marginTop:16}}><div className="panelTitle"><div><h2>Prontidão para produção</h2><small>O painel não expõe chaves, certificados ou outros Secrets</small></div></div><div className="adminDataList">
    {data.readiness.items.map(item=><div className="adminDataRow" key={item.key}><div><b>{item.label}</b><small>{item.detail}</small></div><span className={`badge ${readinessClass(item.status)}`}>{readinessLabel[item.status]}</span></div>)}
   </div></section>

   <section className="panel" style={{marginTop:16}}><div className="panelTitle"><div><h2>Indicadores de preparação</h2><small>Dados observados diretamente no backend</small></div></div><div className="adminDataList">
    <div className="adminDataRow"><div><b>Push em aparelhos reais</b><small>Tokens ativos registrados após instalação do build EAS</small></div><span className={`badge ${data.readiness.metrics.pushTokens>0?"active":"pending"}`}>{data.readiness.metrics.pushTokens}</span></div>
    <div className="adminDataRow"><div><b>Entregadores aguardando aprovação</b><small>Cadastros pendentes na Matriz</small></div><span className={`badge ${data.readiness.metrics.pendingDrivers===0?"active":"pending"}`}>{data.readiness.metrics.pendingDrivers}</span></div>
    <div className="adminDataRow"><div><b>Documentos pendentes / vencidos</b><small>{data.readiness.metrics.pendingDocuments} em análise • {data.readiness.metrics.expiredDocuments} vencidos</small></div><span className={`badge ${data.readiness.metrics.pendingDocuments+data.readiness.metrics.expiredDocuments===0?"active":"pending"}`}>{data.readiness.metrics.pendingDocuments+data.readiness.metrics.expiredDocuments}</span></div>
    <div className="adminDataRow"><div><b>Lojas ativas sem localização completa</b><small>{data.readiness.metrics.storesWithoutGps} sem GPS • {data.readiness.metrics.storesWithoutCity} sem cidade</small></div><span className={`badge ${data.readiness.metrics.storesWithoutGps+data.readiness.metrics.storesWithoutCity===0?"active":"blocked"}`}>{data.readiness.metrics.storesWithoutGps+data.readiness.metrics.storesWithoutCity}</span></div>
    <div className="adminDataRow"><div><b>Documentos legais ativos</b><small>Versões publicadas disponíveis para aceite no aplicativo</small></div><span className={`badge ${data.readiness.metrics.legalDocuments>0?"active":"blocked"}`}>{data.readiness.metrics.legalDocuments}</span></div>
   </div></section>

   <section className="panel" style={{marginTop:16}}><div className="panelTitle"><div><h2>Verificações automáticas de integridade</h2><small>Zero significa operação consistente</small></div></div><div className="adminDataList">
    {data.health.checks.map(check=><div className="adminDataRow" key={check.key}><div><b>{check.label}</b><small>{check.severity==="CRITICAL"?"Integridade crítica":"Monitoramento preventivo"}</small></div><span className={`badge ${check.count===0?"active":check.severity==="CRITICAL"?"blocked":"pending"}`}>{check.count===0?"OK":`${check.count} ocorrência(s)`}</span></div>)}
   </div></section>

   <section className="panel" style={{marginTop:16}}><div className="panelTitle"><div><h2>Gateways e repasses</h2><small>Estado operacional; credenciais permanecem somente no backend</small></div></div><div className="adminDataList">
    <div className="adminDataRow"><div><b>{payment?.display_name??"Efí Bank"} • pagamentos</b><small>{payment?.environment??"-"} • métodos liberados: {(payment?.supported_methods??[]).join(", ")||"nenhum"} • atualizado {dt(payment?.updated_at)}</small></div><span className={`badge ${payment?.enabled&&payment?.credentials_configured?"active":"pending"}`}>{payment?.enabled&&payment?.credentials_configured?"VALIDADO":"DESATIVADO"}</span></div>
    <div className="adminDataRow"><div><b>{payout?.display_name??"Efí Pix"} • repasses</b><small>{payout?.environment??"-"} • credenciais {payout?.credentials_configured?"validadas":"não validadas"} • validado {dt(payout?.validated_at)} • automático {payout?.automatic_processing?"ON":"OFF"}</small></div><span className={`badge ${payout?.enabled?"active":"pending"}`}>{payout?.enabled?"ENVIO ATIVO":"VALIDADO / ENVIO OFF"}</span></div>
   </div></section>

   {problems.length>0&&<section className="panel" style={{marginTop:16}}><div className="panelTitle"><div><h2>Ações recomendadas</h2><small>Use os módulos da Matriz para analisar alertas sem correções destrutivas.</small></div></div><p style={{color:"#666",fontSize:13}}>Atualize esta tela após tratar o item. Se um estorno ou repasse falhar, consulte Pagamentos, Repasses e Suporte antes de tentar novamente.</p></section>}
  </>}
 </main>;
}
