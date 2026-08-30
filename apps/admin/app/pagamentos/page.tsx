"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Provider={id:string;provider:string;display_name:string;environment:"SANDBOX"|"PRODUCTION";enabled:boolean;credentials_configured:boolean;supported_methods:string[];notes:string|null;updated_at:string};
const methods=["PIX","CREDIT_CARD","DEBIT_CARD"] as const;
const labels:Record<string,string>={PIX:"PIX",CREDIT_CARD:"Cartão de crédito",DEBIT_CARD:"Cartão de débito"};

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
 const[allowed,setAllowed]=useState<boolean|null>(null);const[providers,setProviders]=useState<Provider[]>([]);const[message,setMessage]=useState("");const[saving,setSaving]=useState(false);const[validatingEfi,setValidatingEfi]=useState(false);
 const[form,setForm]=useState({provider:"",displayName:"",environment:"SANDBOX" as "SANDBOX"|"PRODUCTION",supportedMethods:["PIX"] as string[],notes:"",credentialsConfigured:false,enabled:false});
 async function load(){
  const{data:{session}}=await supabase.auth.getSession();const role=String(session?.user.app_metadata?.clickfood_role??"");const ok=!!session&&["SUPER_ADMIN","ADMIN"].includes(role);setAllowed(ok);if(!ok)return;
  const{data,error}=await supabase.functions.invoke("admin-payment-config",{body:{action:"LIST"}});if(error||data?.error){setMessage("Não foi possível carregar a configuração de pagamentos.");return;}setProviders(data.providers??[]);
 }
 useEffect(()=>{load();},[]);
 function toggleMethod(method:string){setForm({...form,supportedMethods:form.supportedMethods.includes(method)?form.supportedMethods.filter(x=>x!==method):[...form.supportedMethods,method]});}
 async function save(e:FormEvent){e.preventDefault();if(form.provider==="EFI"){setMessage("A Efí não pode ser ativada manualmente. Instale os Secrets e use o botão Validar e ativar Efí.");return;}setSaving(true);setMessage("");const{data,error}=await supabase.functions.invoke("admin-payment-config",{body:{action:"UPSERT",provider:form.provider,displayName:form.displayName,environment:form.environment,supportedMethods:form.supportedMethods,notes:form.notes,credentialsConfigured:form.credentialsConfigured,enabled:form.enabled}});if(error||data?.error){setMessage("Não foi possível salvar o provedor.");setSaving(false);return;}setMessage(data.warning==="CREDENTIALS_REQUIRED_TO_ENABLE"?"Configuração salva, mas o provedor ficou desativado porque as credenciais reais ainda não foram instaladas como segredo do backend.":"Configuração do provedor salva.");setForm({provider:"",displayName:"",environment:"SANDBOX",supportedMethods:["PIX"],notes:"",credentialsConfigured:false,enabled:false});await load();setSaving(false);}
 function edit(p:Provider){if(p.provider==="EFI"){setMessage("A Efí é gerenciada pelo fluxo seguro abaixo. O ambiente e a ativação são confirmados pela própria integração.");return;}setForm({provider:p.provider,displayName:p.display_name,environment:p.environment,supportedMethods:p.supported_methods??[],notes:p.notes??"",credentialsConfigured:p.credentials_configured,enabled:p.enabled});window.scrollTo({top:0,behavior:"smooth"});}
 async function setupEfi(){setValidatingEfi(true);setMessage("");const{data,error}=await supabase.functions.invoke("efi-pix-setup",{body:{}});if(error||data?.error||data?.ok===false){const code=String(data?.error??"EFI_SETUP_FAILED");setMessage(efiErrorMessage(code,Number(data?.providerStatus)||undefined));setValidatingEfi(false);return;}setMessage(`Efí validada e webhook registrado com sucesso em ${data.environment==="PRODUCTION"?"PRODUÇÃO":"HOMOLOGAÇÃO"}. O PIX está liberado no App Cliente.`);await load();setValidatingEfi(false);}
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
