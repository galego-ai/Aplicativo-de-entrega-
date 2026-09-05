"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

const secondaryTabs = ["Cidades", "Planos", "Bônus", "Auditoria"] as const;
const operationLinks = [
  ["Saúde operacional", "/saude-operacional"],
  ["Mapa", "/mapa"],
  ["Entregadores CLICK-FOOD", "/entregadores"],
  ["Permissões das lojas", "/permissoes-lojas"],
  ["Clientes", "/clientes"],
  ["Avaliações", "/avaliacoes"],
  ["Catálogos", "/catalogos"],
  ["Documentos dos entregadores", "/documentos-entregadores"],
] as const;
const financeLinks = [["Relatórios", "/relatorios"],["Cobrança", "/cobranca"],["Pagamentos", "/pagamentos"],["Regras de Divisão", "/regras-divisao"],["Repasses", "/repasses"]] as const;
const communicationLinks = [["Marketing", "/marketing"],["Notificações", "/notificacoes"],["Suporte", "/suporte"]] as const;
const adminLinks = [["Usuários", "/usuarios"],["Termos & Privacidade", "/legal"]] as const;
const RECOVERY_URL = "https://rmlbmacoqnynqdqmxecz.supabase.co/functions/v1/password-recovery";
function samePath(pathname:string,href:string){return pathname===href||pathname.startsWith(`${href}/`)}
export default function AdminNavigationTools(){
 const pathname=usePathname();const[mountNode,setMountNode]=useState<HTMLElement|null>(null);const[moreOpen,setMoreOpen]=useState(false);const[secondaryActive,setSecondaryActive]=useState(false);
 useEffect(()=>{let treeObserver:MutationObserver|null=null,navObserver:MutationObserver|null=null,nav:HTMLElement|null=null;const sync=()=>{if(!nav)return;setSecondaryActive(Array.from(nav.querySelectorAll<HTMLButtonElement>("button.matrixSecondaryTab")).some(b=>b.classList.contains("active")))};const attach=()=>{nav=document.querySelector<HTMLElement>(".sidebar nav");if(!nav)return false;for(const b of Array.from(nav.querySelectorAll<HTMLButtonElement>(":scope > button")))if(secondaryTabs.includes(b.textContent?.trim() as any))b.classList.add("matrixSecondaryTab");let mount=nav.querySelector<HTMLElement>("[data-clickfood-matrix-tools]");if(!mount){mount=document.createElement("div");mount.dataset.clickfoodMatrixTools="true";mount.className="matrixPortalMount";nav.appendChild(mount)}setMountNode(mount);sync();navObserver=new MutationObserver(sync);navObserver.observe(nav,{attributes:true,subtree:true,attributeFilter:["class"]});return true};if(!attach()){treeObserver=new MutationObserver(()=>{if(attach())treeObserver?.disconnect()});treeObserver.observe(document.body,{childList:true,subtree:true})}return()=>{treeObserver?.disconnect();navObserver?.disconnect();document.querySelectorAll<HTMLButtonElement>(".sidebar nav > button.matrixSecondaryTab").forEach(b=>b.classList.remove("matrixSecondaryTab"));document.querySelector<HTMLElement>("[data-clickfood-matrix-tools]")?.remove();setMountNode(null)}},[pathname]);
 useEffect(()=>setMoreOpen(false),[pathname]);useEffect(()=>{if(!moreOpen||!mountNode)return;const outside=(e:PointerEvent)=>{if(!mountNode.contains(e.target as Node))setMoreOpen(false)},esc=(e:KeyboardEvent)=>{if(e.key==="Escape")setMoreOpen(false)};document.addEventListener("pointerdown",outside);document.addEventListener("keydown",esc);return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",esc)}},[moreOpen,mountNode]);
 function openInternalTab(label:(typeof secondaryTabs)[number]){Array.from(document.querySelectorAll<HTMLButtonElement>(".sidebar nav > button")).find(x=>x.textContent?.trim()===label)?.click();setSecondaryActive(true);setMoreOpen(false)}
 if(!mountNode)return null;const group=(title:string,links:readonly(readonly[string,string])[])=><section className="matrixMoreGroup" key={title}><small>{title}</small><div className="matrixMoreLinks">{links.map(([label,href])=><a key={href} href={href} className={samePath(pathname,href)?"active":""}>{label}</a>)}</div></section>;
 return createPortal(<div className="matrixMoreRoot"><button type="button" className={`matrixMoreButton${moreOpen||secondaryActive?" active":""}`} onClick={()=>setMoreOpen(v=>!v)} aria-expanded={moreOpen}><span><b aria-hidden="true">＋</b> Mais</span><span>{moreOpen?"▴":"▾"}</span></button>{moreOpen&&<div id="clickfood-matrix-more" className="matrixMorePanel" role="menu"><div className="matrixMoreHeader"><div><small>MATRIZ CLICK-FOOD</small><strong>Mais opções</strong></div><button type="button" className="matrixMoreClose" onClick={()=>setMoreOpen(false)}>×</button></div><section className="matrixMoreGroup"><small>GESTÃO</small><div className="matrixMoreLinks">{secondaryTabs.map(label=><button key={label} type="button" onClick={()=>openInternalTab(label)}>{label}</button>)}</div></section>{group("OPERAÇÃO",operationLinks)}{group("FINANCEIRO E RELATÓRIOS",financeLinks)}{group("COMUNICAÇÃO",communicationLinks)}{group("ADMINISTRAÇÃO",adminLinks)}<section className="matrixMoreGroup matrixAccessGroup"><small>ACESSO</small><div className="matrixMoreLinks"><a href={RECOVERY_URL}>Recuperar acesso</a></div></section></div>}</div>,mountNode)
}
