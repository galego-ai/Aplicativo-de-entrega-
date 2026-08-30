"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Provider={id:string;provider:string;display_name:string;environment:"SANDBOX"|"PRODUCTION";enabled:boolean;credentials_configured:boolean;supported_methods:string[];notes:string|null;updated_at:string};
const methods=["PIX","CREDIT_CARD","DEBIT_CARD"] as const;
const labels:Record<string,string>={PIX:"PIX",CREDIT_CARD:"Cartão de crédito",DEBIT_CARD:"Cartão de débito"};

export default function PaymentsPage(){
 const[allowed,setAllowed]=useState<boolean|null>(null);const[providers,setProviders]=useState<Provider[]>([]);const[message,setMessage]=useState("");const[saving,setSaving]=useState(false);
 const[form,setForm]=useState({provider:"",displayName:"",environment:"SANDBOX" as "SANDBOX"|"PRODUCTION",supportedMethods:["PIX"] as string[],notes:"",credentialsConfigured:false,enabled:false});
 async function load(){
  const{data:{session}}=await supabase.auth.getSession();const role=String(session?.user.app_metadata?.clickfood_role??"");const ok=!!session&&["SUPER_ADMIN","ADMIN"].includes(role);setAllowed(ok);if(!ok)return;
  const{data,error}=await supabase.functions.invoke("admin-payment-config",{body:{action:"LIST"}});if(error||data?.error){setMessage("Não foi possível carregar a configuração de pagamentos.");return;}setProviders(data.providers??[]);
 }
 useEffect(()=>{load();},[]);
 function toggleMethod(method:string){setForm({...form,supportedMethods:form.supportedMethods.includes(method)?form.supportedMethods.filter(x=>x!==method):[...form.supportedMethods,method]});}
 async function save(e:FormEvent){e.preventDefault();setSaving(true);setMessage("");const{data,error}=await supabase.functions.invoke("admin-payment-config",{body:{action:"UPSERT",provider:form.provider,displayName:form.displayName,environment:form.environment,supportedMethods:form.supportedMethods,notes:form.notes,credentialsConfigured:form.credentialsConfigured,enabled:form.enabled}});if(error||data?.error){setMessage("Não foi possível salvar o provedor.");setSaving(false);return;}setMessage(data.warning==="CREDENTIALS_REQUIRED_TO_ENABLE"?"Configuração salva, mas o provedor ficou desativado porque as credenciais reais ainda não foram instaladas como segredo do backend.":"Configuração do provedor salva.");setForm({provider:"",displayName:"",environment:"SANDBOX",supportedMethods:["PIX"],notes:"",credentialsConfigured:false,enabled:false});await load();setSaving(false);}
 function edit(p:Provider){setForm({provider:p.provider,displayName:p.display_name,environment:p.environment,supportedMethods:p.supported_methods??[],notes:p.notes??"",credentialsConfigured:p.credentials_configured,enabled:p.enabled});window.scrollTo({top:0,behavior:"smooth"});}
 if(allowed===null)return <main className="adminPage"><div className="adminPanel">Carregando...</div></main>;
 if(!allowed)return <main className="adminPage"><div className="adminPanel"><h1>Acesso restrito</h1><p>Entre na Matriz com perfil Super Admin ou Admin.</p></div></main>;
 return <main className="adminPage">
  <header className="adminHeader"><div><small>FINANCEIRO</small><h1>Pagamentos online</h1><p>Camada neutra para PIX e cartões. As credenciais secretas nunca são armazenadas nesta tela.</p></div><a className="adminLink" href="/">← Matriz</a></header>
  {message&&<div className="adminNotice">{message}</div>}
  <div className="adminGrid2">
   <form className="adminPanel adminForm" onSubmit={save}><h2>Configurar provedor</h2>
    <label>Código do provedor<input placeholder="Ex.: EFI, MERCADO_PAGO, ASAAS" value={form.provider} onChange={e=>setForm({...form,provider:e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g,"_")})} required/></label>
    <label>Nome exibido<input placeholder="Ex.: Efí Bank" value={form.displayName} onChange={e=>setForm({...form,displayName:e.target.value})} required/></label>
    <label>Ambiente<select value={form.environment} onChange={e=>setForm({...form,environment:e.target.value as "SANDBOX"|"PRODUCTION"})}><option value="SANDBOX">Sandbox / testes</option><option value="PRODUCTION">Produção</option></select></label>
    <div><b>Métodos aceitos</b>{methods.map(m=><label key={m} style={{display:"flex",gridTemplateColumns:"auto 1fr",alignItems:"center"}}><input style={{width:"auto"}} type="checkbox" checked={form.supportedMethods.includes(m)} onChange={()=>toggleMethod(m)}/>{labels[m]}</label>)}</div>
    <label><span>Credenciais instaladas no backend</span><select value={form.credentialsConfigured?"YES":"NO"} onChange={e=>setForm({...form,credentialsConfigured:e.target.value==="YES"})}><option value="NO">Não</option><option value="YES">Sim</option></select></label>
    <label><span>Status desejado</span><select value={form.enabled?"ON":"OFF"} onChange={e=>setForm({...form,enabled:e.target.value==="ON"})}><option value="OFF">Desativado</option><option value="ON">Ativado</option></select></label>
    <label>Observações<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Anotações operacionais, sem chaves ou senhas."/></label>
    <button className="primaryAction" disabled={saving}>{saving?"SALVANDO...":"SALVAR CONFIGURAÇÃO"}</button>
    <p className="muted">Nenhuma API key, client secret, certificado ou token deve ser colado aqui. Esses dados pertencem aos Secrets das Edge Functions.</p>
   </form>
   <section className="adminPanel"><h2>Provedores cadastrados</h2><div className="adminList">{providers.map(p=><div key={p.id}><div><b>{p.display_name}</b><small>{p.provider} • {p.environment} • {(p.supported_methods??[]).map(x=>labels[x]??x).join(" / ")||"sem método"}</small><small>{p.credentials_configured?"Credenciais marcadas como instaladas":"Credenciais pendentes"} • {p.enabled?"ATIVO":"DESATIVADO"}</small></div><button onClick={()=>edit(p)}>Editar</button></div>)}{!providers.length&&<p className="muted">Nenhum gateway configurado. Dinheiro continua sendo o método operacional atual até um provedor online receber credenciais reais.</p>}</div></section>
  </div>
 </main>;
}
