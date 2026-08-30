"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Provider={id:string;provider:string;display_name:string;environment:"SANDBOX"|"PRODUCTION";enabled:boolean;credentials_configured:boolean;supported_methods:string[];notes:string|null;updated_at:string};
type RefundView={id:string;payment_id:string;order_id:string;order_number:number;store_name:string;amount:number;reason:string;status:string;provider_refund_id:string|null;created_at:string;completed_at:string|null;payment_status:string};
const methods=["PIX","CREDIT_CARD","DEBIT_CARD"] as const;
const labels:Record<string,string>={PIX:"PIX",CREDIT_CARD:"Cartão de crédito",DEBIT_CARD:"Cartão de débito"};
const refundLabels:Record<string,string>={PENDING:"Solicitado",PROCESSING:"Em processamento",COMPLETED:"Devolvido",FAILED:"Falhou",CANCELLED:"Cancelado"};
const brl=(value:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value||0);
const dateTime=(value:string)=>new Date(value).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});

function efiErrorMessage(code:string,status?:number){
 if(code.startsWith("MISSING_SECRET_"))return `Falta um Secret no Supabase: ${code.replace("MISSING_SECRET_","")}.`;
 if(code==="INVALID_SECRET_EFI_PIX_CERT_B64"||code==="EFI_MTLS_CERT_INVALID")return "O certificado Efí em B64 está inválido. Vamos refazer apenas o certificado.";
 if(code==="INVALID_SECRET_EFI_PIX_KEY_B64"||code==="EFI_MTLS_KEY_INVALID")return "A chave privada Efí em B64 está inválida. Vamos refazer apenas a chave privada.";
 if(code==="EFI_MTLS_PAIR_INVALID"||code==="EFI_MTLS_CONNECTION_FAILED")return "O certificado e a chave privada não formaram uma conexão mTLS válida com a Efí.";
 if(code.startsWith("EFI_OAUTH_"))return `A Efí recusou a autenticação OAuth (${code.replace("EFI_OAUTH_","")}). Confira Client ID e Client Secret de homologação.`;
 if(code==="EFI_WEBHOOK_SETUP_FAILED")return `A autenticação passou, mas a Efí recusou o cadastro do webhook${status?` (HTTP ${status})`:""}. Confira a chave PIX de homologação.`;
 if(code==="EFI_WEBHOOK_NETWORK_FAILED")return "A autenticação passou, mas houve falha de rede ao registrar o webhook na Efí.";
 return `A Efí não pôde ser validada. Diagnóstico: ${code||"EFI_SETUP_FAILED"}.`;
}

export default function PaymentsPage(){
 const[allowed,setAllowed]=useState<boolean|null>(null);const[providers,setProviders]=useState<Provider[]>([]);const[refunds,setRefunds]=useState<RefundView[]>([]);const[message,setMessage]=useState("");const[saving,setSaving]=useState(false);const[validatingEfi,setValidatingEfi]=useState(false);const[refundBusy,setRefundBusy]=useState<string|null>(null);
 const[form,setForm]=useState({provider:"",displayName:"",environment:"SANDBOX" as "SANDBOX"|"PRODUCTION",supportedMethods:["PIX"] as string[],notes:"",credentialsConfigured:false,enabled:false});
 async function loadRefunds(){
  const{data:refundRows,error}=await supabase.from("refunds").select("id,payment_id,amount,reason,status,provider_refund_id,created_at,completed_at").order("created_at",{ascending:false}).limit(100);
  if(error||!refundRows?.length){setRefunds([]);return;}
  const paymentIds=refundRows.map((row:any)=>String(row.payment_id));
  const{data:payments}=await supabase.from("payments").select("id,order_id,status,provider,method").in("id",paymentIds);
  const efiPayments=(payments??[]).filter((p:any)=>p.provider==="EFI"&&p.method==="PIX");
  const paymentMap=new Map(efiPayments.map((p:any)=>[String(p.id),p]));
  const orderIds=[...new Set(efiPayments.map((p:any)=>String(p.order_id)))];
  const{data:orders}=orderIds.length?await supabase.from("orders").select("id,order_number,store_id").in("id",orderIds):{data:[] as any[]};
  const orderMap=new Map((orders??[]).map((o:any)=>[String(o.id),o]));
  const storeIds=[...new Set((orders??[]).map((o:any)=>String(o.store_id)))];
  const{data:stores}=storeIds.length?await supabase.from("stores").select("id,name").in("id",storeIds):{data:[] as any[]};
  const storeMap=new Map((stores??[]).map((s:any)=>[String(s.id),String(s.name)]));
  const rows:RefundView[]=[];
  for(const raw of refundRows as any[]){
   const payment=paymentMap.get(String(raw.payment_id));if(!payment)continue;
   const order:any=orderMap.get(String(payment.order_id));if(!order)continue;
   rows.push({id:String(raw.id),payment_id:String(raw.payment_id),order_id:String(order.id),order_number:Number(order.order_number),store_name:storeMap.get(String(order.store_id))??"Loja",amount:Number(raw.amount),reason:String(raw.reason??""),status:String(raw.status),provider_refund_id:raw.provider_refund_id?String(raw.provider_refund_id):null,created_at:String(raw.created_at),completed_at:raw.completed_at?String(raw.completed_at):null,payment_status:String(payment.status)});
  }
  setRefunds(rows);
 }
 async function load(){
  const{data:{session}}=await supabase.auth.getSession();const role=String(session?.user.app_metadata?.clickfood_role??"");const ok=!!session&&["SUPER_ADMIN","ADMIN"].includes(role);setAllowed(ok);if(!ok)return;
  const{data,error}=await supabase.functions.invoke("admin-payment-config",{body:{action:"LIST"}});if(error||data?.error){setMessage("Não foi possível carregar a configuração de pagamentos.");return;}setProviders(data.providers??[]);await loadRefunds();
 }
 useEffect(()=>{load();},[]);
 function toggleMethod(method:string){setForm({...form,supportedMethods:form.supportedMethods.includes(method)?form.supportedMethods.filter(x=>x!==method):[...form.supportedMethods,method]});}
 async function save(e:FormEvent){e.preventDefault();if(form.provider==="EFI"){setMessage("A Efí não pode ser ativada manualmente. Instale os Secrets e use o botão Validar e ativar Efí.");return;}setSaving(true);setMessage("");const{data,error}=await supabase.functions.invoke("admin-payment-config",{body:{action:"UPSERT",provider:form.provider,displayName:form.displayName,environment:form.environment,supportedMethods:form.supportedMethods,notes:form.notes,credentialsConfigured:form.credentialsConfigured,enabled:form.enabled}});if(error||data?.error){setMessage("Não foi possível salvar o provedor.");setSaving(false);return;}setMessage(data.warning==="CREDENTIALS_REQUIRED_TO_ENABLE"?"Configuração salva, mas o provedor ficou desativado porque as credenciais reais ainda não foram instaladas como segredo do backend.":"Configuração do provedor salva.");setForm({provider:"",displayName:"",environment:"SANDBOX",supportedMethods:["PIX"],notes:"",credentialsConfigured:false,enabled:false});await load();setSaving(false);}
 function edit(p:Provider){if(p.provider==="EFI"){setMessage("A Efí é gerenciada pelo fluxo seguro abaixo. O ambiente e a ativação são confirmados pela própria integração.");return;}setForm({provider:p.provider,displayName:p.display_name,environment:p.environment,supportedMethods:p.supported_methods??[],notes:p.notes??"",credentialsConfigured:p.credentials_configured,enabled:p.enabled});window.scrollTo({top:0,behavior:"smooth"});}
 async function setupEfi(){setValidatingEfi(true);setMessage("");const{data,error}=await supabase.functions.invoke("efi-pix-setup",{body:{}});if(error||data?.error||data?.ok===false){const code=String(data?.error??"EFI_SETUP_FAILED");setMessage(efiErrorMessage(code,Number(data?.providerStatus)||undefined));setValidatingEfi(false);return;}setMessage(`Efí validada e webhook registrado com sucesso em ${data.environment==="PRODUCTION"?"PRODUÇÃO":"HOMOLOGAÇÃO"}. O PIX está liberado no App Cliente.`);await load();setValidatingEfi(false);}
 async function reconcileRefund(refund:RefundView){setRefundBusy(refund.id);setMessage("");const{data,error}=await supabase.functions.invoke("efi-pix-refund",{body:{orderId:refund.order_id,reason:`Reconciliação pela Matriz do estorno ${refund.id}`}});if(error||data?.error)setMessage("Não foi possível reconciliar este estorno agora.");else setMessage(String(data?.refundStatus)==="COMPLETED"?"Estorno confirmado como devolvido pela Efí.":String(data?.refundStatus)==="FAILED"?"A devolução falhou na Efí e pode ser tentada novamente.":"Estorno consultado. A devolução continua em processamento.");await loadRefunds();setRefundBusy(null);}
 const efi=providers.find(p=>p.provider==="EFI");
 if(allowed===null)return <main className="adminPage"><div className="adminPanel">Carregando...</div></main>;
 if(!allowed)return <main className="adminPage"><div className="adminPanel"><h1>Acesso restrito</h1><p>Entre na Matriz com perfil Super Admin ou Admin.</p></div></main>;
 return <main className="adminPage">
  <header className="adminHeader"><div><small>FINANCEIRO</small><h1>Pagamentos online</h1><p>PIX Efí com validação real de credenciais e camada neutra para outros gateways.</p></div><a className="adminLink" href="/">← Matriz</a></header>
  {message&&<div className="adminNotice">{message}</div>}
  <section className="adminPanel" style={{marginBottom:18}}><h2>PIX • Efí Bank</h2><p className="muted">As credenciais ficam somente nos Secrets do Supabase. O CLICK-FOOD só libera PIX depois que esta tela consegue autenticar na Efí e registrar o webhook.</p>
   <div className="adminList"><div><div><b>{efi?.enabled?"PIX EFÍ ATIVO":"PIX EFÍ AGUARDANDO CONFIGURAÇÃO"}</b><small>{efi?.environment??"SANDBOX"} • {efi?.credentials_configured?"credenciais validadas":"credenciais ainda não validadas"}</small></div></div></div>
   <div style={{marginTop:14}}><b>Secrets necessários no projeto CLICK-FOOD</b><p className="muted">EFI_PIX_CLIENT_ID • EFI_PIX_CLIENT_SECRET • EFI_PIX_CERT_B64 • EFI_PIX_KEY_B64 • EFI_PIX_KEY • EFI_PIX_SANDBOX • EFI_WEBHOOK_HMAC</p></div>
   <button className="primaryAction" onClick={setupEfi} disabled={validatingEfi}>{validatingEfi?"VALIDANDO NA EFÍ...":efi?.enabled?"REVALIDAR EFÍ E WEBHOOK":"VALIDAR E ATIVAR EFÍ"}</button>
   <p className="muted">Comece com <b>EFI_PIX_SANDBOX=true</b>. Nenhuma dessas credenciais deve ser digitada ou armazenada no navegador.</p>
  </section>
  <section className="adminPanel" style={{marginBottom:18}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}><div><h2>Estornos PIX Efí</h2><p className="muted">Últimas devoluções solicitadas. Atualizar consulta a própria Efí sem criar estorno duplicado.</p></div><button onClick={loadRefunds}>Atualizar</button></div>
   <div className="adminList">{refunds.map(r=><div key={r.id}><div><b>Pedido #{r.order_number} • {r.store_name}</b><small>{brl(r.amount)} • {refundLabels[r.status]??r.status} • {dateTime(r.created_at)}</small><small>{r.reason||"Sem motivo informado"}{r.completed_at?` • concluído ${dateTime(r.completed_at)}`:""}</small></div>{["PENDING","PROCESSING","FAILED"].includes(r.status)&&<button onClick={()=>reconcileRefund(r)} disabled={refundBusy===r.id}>{refundBusy===r.id?"Consultando...":"Atualizar estorno"}</button>}</div>)}{!refunds.length&&<p className="muted">Nenhum estorno PIX registrado até agora.</p>}</div>
  </section>
  <div className="adminGrid2">
   <form className="adminPanel adminForm" onSubmit={save}><h2>Outros provedores</h2>
    <label>Código do provedor<input placeholder="Ex.: MERCADO_PAGO, ASAAS" value={form.provider} onChange={e=>setForm({...form,provider:e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g,"_")})} required/></label>
    <label>Nome exibido<input placeholder="Nome do gateway" value={form.displayName} onChange={e=>setForm({...form,displayName:e.target.value})} required/></label>
    <label>Ambiente<select value={form.environment} onChange={e=>setForm({...form,environment:e.target.value as "SANDBOX"|"PRODUCTION"})}><option value="SANDBOX">Sandbox / testes</option><option value="PRODUCTION">Produção</option></select></label>
    <div><b>Métodos aceitos</b>{methods.map(m=><label key={m} style={{display:"flex",gridTemplateColumns:"auto 1fr",alignItems:"center"}}><input style={{width:"auto"}} type="checkbox" checked={form.supportedMethods.includes(m)} onChange={()=>toggleMethod(m)}/>{labels[m]}</label>)}</div>
    <label><span>Credenciais instaladas no backend</span><select value={form.credentialsConfigured?"YES":"NO"} onChange={e=>setForm({...form,credentialsConfigured:e.target.value==="YES"})}><option value="NO">Não</option><option value="YES">Sim</option></select></label>
    <label><span>Status desejado</span><select value={form.enabled?"ON":"OFF"} onChange={e=>setForm({...form,enabled:e.target.value==="ON"})}><option value="OFF">Desativado</option><option value="ON">Ativado</option></select></label>
    <label>Observações<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Anotações operacionais, sem chaves ou senhas."/></label>
    <button className="primaryAction" disabled={saving}>{saving?"SALVANDO...":"SALVAR CONFIGURAÇÃO"}</button>
    <p className="muted">A Efí é exceção: use exclusivamente o fluxo validado acima. Nenhuma API key, client secret, certificado ou token deve ser colado aqui.</p>
   </form>
   <section className="adminPanel"><h2>Provedores cadastrados</h2><div className="adminList">{providers.map(p=><div key={p.id}><div><b>{p.display_name}</b><small>{p.provider} • {p.environment} • {(p.supported_methods??[]).map(x=>labels[x]??x).join(" / ")||"sem método"}</small><small>{p.credentials_configured?"Credenciais validadas":"Credenciais pendentes"} • {p.enabled?"ATIVO":"DESATIVADO"}</small></div>{p.provider!=="EFI"&&<button onClick={()=>edit(p)}>Editar</button>}</div>)}{!providers.length&&<p className="muted">Nenhum gateway configurado. Dinheiro permanece disponível.</p>}</div></section>
  </div>
 </main>;
}
