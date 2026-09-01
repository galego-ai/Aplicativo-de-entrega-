"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

type StoreAccess={id:string;name:string;role:string};
type ItemOption={id:string;order_item_id:string;option_name_snapshot:string;quantity:number;price:number};
type OrderItem={id:string;order_id:string;product_name_snapshot:string;quantity:number;notes:string|null;options:ItemOption[]};
type KitchenOrder={id:string;order_number:number;status:string;delivery_type:string;source:string;customer_notes:string|null;created_at:string;accepted_at:string|null;ready_at:string|null;items:OrderItem[]};

const columns=[
 {key:"WAITING_STORE",title:"Novos",hint:"Aguardando aceite"},
 {key:"ACCEPTED",title:"Aceitos",hint:"Aguardando preparo"},
 {key:"PREPARING",title:"Em preparo",hint:"Na cozinha agora"},
 {key:"READY",title:"Prontos",hint:"Expedição / retirada"},
] as const;
const statusLabel:Record<string,string>={WAITING_STORE:"NOVO",ACCEPTED:"ACEITO",PREPARING:"EM PREPARO",READY:"PRONTO"};
const typeLabel:Record<string,string>={DELIVERY:"ENTREGA",PICKUP:"RETIRADA"};

function elapsed(value:string){const seconds=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/1000));const min=Math.floor(seconds/60);return min<60?`${min} min`:`${Math.floor(min/60)}h ${min%60}m`;}
function hhmm(value:string|null){if(!value)return"--:--";return new Date(value).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});}

export default function CozinhaPage(){
 const[loading,setLoading]=useState(true);const[store,setStore]=useState<StoreAccess|null>(null);const[orders,setOrders]=useState<KitchenOrder[]>([]);const[message,setMessage]=useState("");const[busyId,setBusyId]=useState<string|null>(null);const[clock,setClock]=useState(Date.now());const[printingId,setPrintingId]=useState<string|null>(null);
 const previousNewIds=useRef<Set<string>>(new Set());
 const canAccept=store?.role==="OWNER"||store?.role==="MANAGER";const canCook=["OWNER","MANAGER","KITCHEN"].includes(store?.role??"");const canReady=["OWNER","MANAGER","KITCHEN","EXPEDITION"].includes(store?.role??"");
 const counts=useMemo(()=>Object.fromEntries(columns.map(col=>[col.key,orders.filter(o=>o.status===col.key).length])),[orders]);

 async function resolveStore(){
  setLoading(true);const{data:sessionData}=await supabase.auth.getSession();if(!sessionData.session){setMessage("Entre no Painel Lojista para abrir a cozinha.");setLoading(false);return;}
  const{data,error}=await supabase.from("store_memberships").select("store_id,role,stores!inner(name)").eq("user_id",sessionData.session.user.id).eq("active",true).limit(1);
  if(error||!data?.length){setMessage("Sua conta não está vinculada a uma loja.");setLoading(false);return;}
  const row:any=data[0],related=Array.isArray(row.stores)?row.stores[0]:row.stores;const access={id:String(row.store_id),name:String(related?.name??"Minha loja"),role:String(row.role)};setStore(access);await loadOrders(access.id,true);setLoading(false);
 }

 async function loadOrders(storeId=store?.id,initial=false){
  if(!storeId)return;
  const{data:orderRows,error}=await supabase.from("orders").select("id,order_number,status,delivery_type,source,customer_notes,created_at,accepted_at,ready_at").eq("store_id",storeId).in("status",columns.map(c=>c.key)).order("created_at",{ascending:true});
  if(error){setMessage("Não foi possível atualizar a fila da cozinha.");return;}
  const base=(orderRows??[]) as Omit<KitchenOrder,"items">[];const orderIds=base.map(o=>o.id);
  let itemRows:any[]=[];if(orderIds.length){const result=await supabase.from("order_items").select("id,order_id,product_name_snapshot,quantity,notes").in("order_id",orderIds).order("id");if(result.error){setMessage("Não foi possível carregar os itens dos pedidos.");return;}itemRows=result.data??[];}
  const itemIds=itemRows.map(i=>String(i.id));let optionRows:any[]=[];if(itemIds.length){const result=await supabase.from("order_item_options").select("id,order_item_id,option_name_snapshot,quantity,price").in("order_item_id",itemIds).order("id");if(!result.error)optionRows=result.data??[];}
  const optionsByItem=new Map<string,ItemOption[]>();for(const raw of optionRows){const id=String(raw.order_item_id),list=optionsByItem.get(id)??[];list.push({...raw,quantity:Number(raw.quantity),price:Number(raw.price)} as ItemOption);optionsByItem.set(id,list);}
  const itemsByOrder=new Map<string,OrderItem[]>();for(const raw of itemRows){const orderId=String(raw.order_id),list=itemsByOrder.get(orderId)??[];list.push({...raw,quantity:Number(raw.quantity),options:optionsByItem.get(String(raw.id))??[]} as OrderItem);itemsByOrder.set(orderId,list);}
  const next=base.map(o=>({...o,order_number:Number(o.order_number),items:itemsByOrder.get(o.id)??[]})) as KitchenOrder[];
  const newIds=new Set(next.filter(o=>o.status==="WAITING_STORE").map(o=>o.id));if(!initial&&[...newIds].some(id=>!previousNewIds.current.has(id)))setMessage("🔔 Novo pedido recebido na cozinha.");previousNewIds.current=newIds;setOrders(next);
 }

 useEffect(()=>{void resolveStore();},[]);
 useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),30000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{if(!store)return;const timer=setInterval(()=>void loadOrders(store.id),20000);const channel=supabase.channel(`kds-${store.id}`).on("postgres_changes",{event:"*",schema:"public",table:"orders",filter:`store_id=eq.${store.id}`},()=>void loadOrders(store.id)).subscribe();return()=>{clearInterval(timer);void supabase.removeChannel(channel);};},[store?.id]);

 async function action(order:KitchenOrder,kind:"ACCEPT"|"REJECT"|"START_PREPARING"|"MARK_READY"){
  if(busyId)return;let reason:string|undefined;if(kind==="REJECT"){reason=window.prompt(`Motivo para recusar o pedido #${order.order_number}:`)?.trim()||undefined;if(!reason)return;}
  setBusyId(order.id);setMessage("");const{data,error}=await supabase.functions.invoke("store-order-action",{body:{orderId:order.id,action:kind,reason}});
  if(error||data?.error){const code=String(data?.error??"");const labels:Record<string,string>={STORE_ACTION_DENIED:"Seu perfil não tem permissão para esta etapa.",ORDER_STATUS_CHANGED:"O pedido foi alterado em outro terminal. Atualizando a tela...",REASON_REQUIRED:"Informe o motivo da recusa."};setMessage(labels[code]??"Não foi possível atualizar o pedido.");setBusyId(null);await loadOrders();return;}
  if(data?.dispatchRequired){const dispatch=await supabase.functions.invoke("dispatch-delivery",{body:{orderId:order.id}});setMessage(dispatch.error||dispatch.data?.error?"Pedido pronto. Ainda não há entregador disponível; a expedição poderá tentar novamente.":"Pedido pronto e chamado enviado aos entregadores.");}
  setBusyId(null);await loadOrders();
 }

 function printTicket(order:KitchenOrder){setPrintingId(order.id);setTimeout(()=>{window.print();setTimeout(()=>setPrintingId(null),250);},80);}

 if(loading)return <main className="kdsPage"><div className="kdsLoading">Abrindo tela da cozinha...</div></main>;
 if(!store)return <main className="kdsPage"><div className="kdsLoading"><h1>Cozinha</h1><p>{message}</p><a href="/">Voltar ao painel</a></div></main>;
 return <main className="kdsPage">
  <header className="kdsHeader"><div><span>CLICK-FOOD • KDS</span><h1>Cozinha</h1><p>{store.name} • atualização automática dos pedidos</p></div><div className="kdsHeaderActions"><b>{store.role}</b><button onClick={()=>void loadOrders(store.id)}>Atualizar</button><a href="/">Painel</a></div></header>
  {message&&<div className="kdsNotice">{message}</div>}
  <section className="kdsSummary">{columns.map(col=><article key={col.key}><span>{col.title}</span><b>{counts[col.key]??0}</b><small>{col.hint}</small></article>)}</section>
  <section className="kdsBoard">{columns.map(col=><div className={`kdsColumn kds-${col.key.toLowerCase()}`} key={col.key}><div className="kdsColumnHead"><div><small>{col.hint}</small><h2>{col.title}</h2></div><b>{counts[col.key]??0}</b></div><div className="kdsCards">
   {orders.filter(order=>order.status===col.key).map(order=><article className={`kdsOrder ${printingId===order.id?"printing":""}`} key={order.id} data-order={order.id}>
    <div className="kdsOrderTop"><div><span>{statusLabel[order.status]??order.status}</span><h3>#{order.order_number}</h3></div><div className="kdsOrderMeta"><b>{typeLabel[order.delivery_type]??order.delivery_type}</b><small>{order.source==="POS"?"PDV":"APP"}</small></div></div>
    <div className="kdsTime"><strong>{elapsed(order.accepted_at??order.created_at)}</strong><span>Entrada {hhmm(order.created_at)}{order.accepted_at?` • aceite ${hhmm(order.accepted_at)}`:""}</span></div>
    <div className="kdsItems">{order.items.map(item=><div className="kdsItem" key={item.id}><div><b>{item.quantity}×</b><strong>{item.product_name_snapshot}</strong></div>{item.options.map(option=><small key={option.id}>+ {option.quantity}× {option.option_name_snapshot}</small>)}{item.notes&&<p>OBS.: {item.notes}</p>}</div>)}{!order.items.length&&<p className="kdsEmpty">Itens ainda não carregados.</p>}</div>
    {order.customer_notes&&<div className="kdsCustomerNote"><b>OBSERVAÇÃO DO PEDIDO</b><p>{order.customer_notes}</p></div>}
    <div className="kdsActions"><button className="kdsPrint" onClick={()=>printTicket(order)}>Imprimir ficha</button>{order.status==="WAITING_STORE"&&canAccept&&<><button className="kdsPrimary" disabled={busyId===order.id} onClick={()=>void action(order,"ACCEPT")}>ACEITAR</button><button className="kdsDanger" disabled={busyId===order.id} onClick={()=>void action(order,"REJECT")}>RECUSAR</button></>}{order.status==="WAITING_STORE"&&!canAccept&&<span className="kdsWaiting">Aguardando gerente aceitar</span>}{order.status==="ACCEPTED"&&canCook&&<button className="kdsPrimary" disabled={busyId===order.id} onClick={()=>void action(order,"START_PREPARING")}>INICIAR PREPARO</button>}{order.status==="PREPARING"&&canReady&&<button className="kdsReady" disabled={busyId===order.id} onClick={()=>void action(order,"MARK_READY")}>MARCAR PRONTO</button>}{order.status==="READY"&&<span className="kdsDone">✓ PRONTO PARA {order.delivery_type==="PICKUP"?"RETIRADA":"EXPEDIÇÃO"}</span>}</div>
   </article>)}{!orders.some(order=>order.status===col.key)&&<div className="kdsNoOrders">Nenhum pedido nesta etapa.</div>}
  </div></div>)}</section>
  <span style={{display:"none"}}>{clock}</span>
 </main>;
}
