"use client";

import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";

type LegalDocument={id:string;document_type:string;version:string;title:string;content:string;accepted:boolean};

export default function LegalConsentGate({children}:{children:ReactNode}){
  const[sessionReady,setSessionReady]=useState(false);const[hasSession,setHasSession]=useState(false);const[documents,setDocuments]=useState<LegalDocument[]>([]);const[visible,setVisible]=useState(false);const[busy,setBusy]=useState(false);const[message,setMessage]=useState("");
  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{const logged=!!data.session;setHasSession(logged);setSessionReady(true);if(logged)void load();});
    const{data}=supabase.auth.onAuthStateChange((_event,session)=>{const logged=!!session;setHasSession(logged);setSessionReady(true);if(logged)void load();else setVisible(false);});
    return()=>data.subscription.unsubscribe();
  },[]);
  async function load(){
    const{data,error}=await supabase.functions.invoke("legal-consent",{body:{action:"STATUS",audience:"STORE",app:"STORE"}});
    if(error||data?.error){setMessage("Não foi possível verificar os documentos legais. Atualize a página ou tente novamente.");setVisible(true);return;}
    const required=(data?.required??[]) as LegalDocument[];setDocuments(required);setVisible(required.some(doc=>!doc.accepted));setMessage("");
  }
  async function accept(){
    const ids=documents.filter(doc=>!doc.accepted).map(doc=>doc.id);if(!ids.length){setVisible(false);return;}
    setBusy(true);setMessage("");const{data,error}=await supabase.functions.invoke("legal-consent",{body:{action:"ACCEPT",audience:"STORE",app:"STORE",documentIds:ids}});setBusy(false);
    if(error||data?.error||!data?.compliant){setMessage("Não foi possível registrar seu aceite. Tente novamente.");return;}setVisible(false);
  }
  return <>{children}{sessionReady&&hasSession&&visible&&<div style={overlay} role="dialog" aria-modal="true" aria-label="Termos e Privacidade"><div style={panel}><div style={header}><strong style={{fontSize:22}}><span style={{color:"#e2b500"}}>CLICK</span>-FOOD</strong><h1 style={{margin:"18px 0 6px",fontSize:30}}>Termos e Privacidade</h1><p style={{margin:0,color:"#666"}}>Para continuar no painel, leia e aceite a versão atual dos documentos.</p></div><div style={docs}>{documents.filter(doc=>!doc.accepted).map(doc=><section key={doc.id} style={card}><h2 style={{margin:"0 0 4px"}}>{doc.title}</h2><div style={{fontSize:12,fontWeight:800,color:"#8b7000",marginBottom:14}}>Versão {doc.version}</div><div style={{whiteSpace:"pre-wrap",lineHeight:1.6,fontSize:14}}>{doc.content}</div></section>)}{message&&<div style={error}>{message}</div>}</div><div style={footer}>{message&&<button type="button" onClick={load} style={secondary}>Tentar novamente</button>}<button type="button" onClick={accept} disabled={busy||documents.filter(doc=>!doc.accepted).length===0} style={{...primary,opacity:busy?.6:1}}>{busy?"REGISTRANDO...":"LI E CONCORDO"}</button><small style={{color:"#777"}}>O aceite fica registrado com usuário, versão e data.</small></div></div></div>}</>;
}

const overlay:React.CSSProperties={position:"fixed",inset:0,zIndex:99999,background:"rgba(0,0,0,.72)",display:"grid",placeItems:"center",padding:20};
const panel:React.CSSProperties={background:"#f7f7f7",width:"min(900px,100%)",height:"min(760px,95vh)",borderRadius:18,display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 25px 80px rgba(0,0,0,.35)"};
const header:React.CSSProperties={padding:"24px 26px 14px"};const docs:React.CSSProperties={padding:"8px 24px 28px",overflowY:"auto",flex:1};const card:React.CSSProperties={background:"#fff",border:"1px solid #e5e5e5",borderRadius:14,padding:20,marginBottom:14};const footer:React.CSSProperties={borderTop:"1px solid #e3e3e3",background:"#fff",padding:18,display:"grid",gap:9};const primary:React.CSSProperties={background:"#f4c400",border:0,borderRadius:11,padding:"14px 18px",fontWeight:900,cursor:"pointer"};const secondary:React.CSSProperties={background:"#fff",border:"1px solid #bbb",borderRadius:11,padding:"12px 18px",fontWeight:800,cursor:"pointer"};const error:React.CSSProperties={background:"#fde5e1",color:"#8b2722",padding:12,borderRadius:10};
