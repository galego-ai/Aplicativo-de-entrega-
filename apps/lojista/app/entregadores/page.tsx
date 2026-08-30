"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Store={id:string;name:string;role:string};
type Order={id:string;order_number:number;total:number;status:string;created_at:string};
type Driver={id:string;name:string;avatarUrl:string|null;rating:number;acceptanceRate:number;distanceToStoreKm:number|null;vehicle:{type:string;brand:string|null;model:string|null;plate:string|null}|null;lastLocationAt:string};

const brl=(value:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value||0);
const vehicleLabel:Record<string,string>={MOTORCYCLE:"Moto",CAR:"Carro",BICYCLE:"Bicicleta"};

export default function EntregadoresPage(){
 const[loading,setLoading]=useState(true);const[store,setStore]=useState<Store|null>(null);const[orders,setOrders]=useState<Order[]>([]);const[drivers,setDrivers]=useState<Driver[]>([]);const[selectedOrderId,setSelectedOrderId]=useState("");const[busyDriverId,setBusyDriverId]=useState<string|null>(null);const[message,setMessage]=useState("");
 const selectedOrder=useMemo(()=>orders.find(o=>o.id===selectedOrderId)??null,[orders,selectedOrderId]);

 useEffect(()=>{bootstrap();},[]);

 async function bootstrap(){
  setLoading(true);setMessage("");
  const{data:{session}}=await supabase.auth.getSession();
  if(!session){window.location.href="/";return;}
  const{data:memberships}=await supabase.from("store_memberships").select("store_id,role,stores!inner(id,name)").eq("user_id",session.user.id).eq("active",true).in("role",["OWNER","MANAGER"]).limit(1);
  if(!memberships?.length){setMessage("Somente proprietário ou gerente pode atribuir entregadores.");setLoading(false);return;}
  const membership:any=memberships[0],rel=Array.isArray(membership.stores)?membership.stores[0]:membership.stores;
  const nextStore={id:String(membership.store_id),name:String(rel?.name??"Minha loja"),role:String(membership.role)};setStore(nextStore);
  await refresh(nextStore.id);setLoading(false);
 }

 async function refresh(storeId=store?.id){
  if(!storeId)return;
  const[ordersResult,driversResult]=await Promise.all([
   supabase.from("orders").select("id,order_number,total,status,created_at").eq("store_id",storeId).eq("delivery_type","DELIVERY").in("status",["READY","WAITING_DRIVER"]).order("created_at",{ascending:true}),
   supabase.functions.invoke("store-driver-management",{body:{action:"LIST_AVAILABLE",storeId}}),
  ]);
  const orderRows=(ordersResult.data??[]).map((o:any)=>({...o,total:Number(o.total)})) as Order[];setOrders(orderRows);
  setSelectedOrderId(current=>orderRows.some(o=>o.id===current)?current:(orderRows[0]?.id??""));
  if(driversResult.error||driversResult.data?.error){setDrivers([]);setMessage("Não foi possível consultar os entregadores disponíveis.");}
  else setDrivers((driversResult.data?.drivers??[]) as Driver[]);
 }

 async function assign(driver:Driver){
  if(!selectedOrderId)return setMessage("Escolha um pedido primeiro.");
  setBusyDriverId(driver.id);setMessage("");
  const{data,error}=await supabase.functions.invoke("store-driver-management",{body:{action:"ASSIGN",orderId:selectedOrderId,driverId:driver.id}});
  if(error||data?.error){
   const code=String(data?.error??"");
   const labels:Record<string,string>={DRIVER_BUSY:"Esse entregador acabou de receber outra entrega.",DRIVER_NOT_AVAILABLE:"O entregador ficou indisponível.",DRIVER_LOCATION_STALE:"A localização do entregador está desatualizada.",DRIVER_OUTSIDE_RADIUS:"O entregador está fora do raio permitido.",DELIVERY_ALREADY_ASSIGNED:"Esse pedido já possui entregador.",ORDER_NOT_WAITING_DRIVER:"O pedido mudou de etapa e não pode mais ser atribuído."};
   setMessage(labels[code]??"Não foi possível atribuir esse entregador.");
  }else{
   setMessage(`${driver.name} atribuído ao pedido #${selectedOrder?.order_number??""}. Ganho calculado pelo sistema: ${brl(Number(data.earning))}.`);
  }
  setBusyDriverId(null);await refresh();
 }

 if(loading)return <main style={styles.page}><div style={styles.card}><b>CLICK-FOOD</b><p>Carregando entregadores...</p></div></main>;
 if(!store)return <main style={styles.page}><div style={styles.card}><h1>Acesso restrito</h1><p>{message||"Nenhuma loja encontrada."}</p><a href="/">Voltar ao painel</a></div></main>;

 return <main style={styles.page}>
  <section style={styles.shell}>
   <header style={styles.header}><div><div style={styles.logo}><span style={styles.yellow}>CLICK</span>-FOOD</div><p style={styles.muted}>{store.name} • {store.role}</p><h1 style={styles.title}>Atribuir entregador</h1></div><div style={styles.headerActions}><button style={styles.secondary} onClick={()=>refresh()}>Atualizar</button><a style={styles.back} href="/">← Voltar ao painel</a></div></header>
   {!!message&&<div style={styles.notice}>{message}</div>}
   <div style={styles.grid}>
    <aside style={styles.card}>
     <small style={styles.kicker}>PEDIDOS PRONTOS</small><h2>Aguardando entregador</h2>
     {orders.length?orders.map(order=><button key={order.id} onClick={()=>setSelectedOrderId(order.id)} style={{...styles.orderButton,...(selectedOrderId===order.id?styles.orderActive:{})}}><b>Pedido #{order.order_number}</b><span>{brl(order.total)}</span><small>{order.status==="READY"?"Pronto para retirada":"Buscando entregador"}</small></button>):<p style={styles.empty}>Nenhum pedido aguardando atribuição.</p>}
    </aside>
    <section style={styles.card}>
     <div style={styles.sectionHead}><div><small style={styles.kicker}>ONLINE AGORA</small><h2>Entregadores disponíveis</h2></div><span style={styles.count}>{drivers.length}</span></div>
     {!selectedOrder&&<p style={styles.empty}>Selecione um pedido para atribuir.</p>}
     {selectedOrder&&drivers.length===0&&<p style={styles.empty}>Nenhum entregador elegível neste momento. O chamado automático pode ser tentado novamente pelo painel.</p>}
     {selectedOrder&&drivers.map(driver=><article key={driver.id} style={styles.driverCard}>
       <div style={styles.avatar}>{driver.avatarUrl?<img src={driver.avatarUrl} alt="" style={styles.avatarImage}/>:driver.name.slice(0,2).toUpperCase()}</div>
       <div style={styles.driverInfo}><b>{driver.name}</b><span>★ {driver.rating.toFixed(1)} • aceitação {Math.round(driver.acceptanceRate)}%</span><span>{driver.distanceToStoreKm==null?"Distância indisponível":`${driver.distanceToStoreKm.toFixed(1)} km da loja`}</span><span>{driver.vehicle?`${vehicleLabel[driver.vehicle.type]??driver.vehicle.type} • ${[driver.vehicle.brand,driver.vehicle.model].filter(Boolean).join(" ")}${driver.vehicle.plate?` • ${driver.vehicle.plate}`:""}`:"Veículo não informado"}</span></div>
       <button style={styles.assign} disabled={busyDriverId===driver.id} onClick={()=>assign(driver)}>{busyDriverId===driver.id?"ATRIBUINDO...":"ATRIBUIR"}</button>
     </article>)}
    </section>
   </div>
   <p style={styles.foot}>O ganho do entregador é calculado pelo backend conforme a tarifa da cidade. O lojista não consegue alterar o valor manualmente.</p>
  </section>
 </main>;
}

const styles:Record<string,React.CSSProperties>={
 page:{minHeight:"100vh",background:"#f5f5f2",padding:"32px",color:"#111",fontFamily:"Arial, sans-serif"},shell:{maxWidth:1180,margin:"0 auto"},header:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:20,marginBottom:20},logo:{fontSize:24,fontWeight:900},yellow:{color:"#d5aa00"},muted:{color:"#777",margin:"6px 0"},title:{fontSize:34,margin:"8px 0 0"},headerActions:{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"},secondary:{background:"#fff",border:"1px solid #ddd",padding:"11px 15px",borderRadius:10,fontWeight:800,cursor:"pointer"},back:{background:"#111",color:"#fff",padding:"11px 15px",borderRadius:10,textDecoration:"none",fontWeight:800},notice:{background:"#fff4c5",border:"1px solid #ead16c",padding:"13px 15px",borderRadius:12,marginBottom:16},grid:{display:"grid",gridTemplateColumns:"minmax(260px, .75fr) minmax(420px, 1.6fr)",gap:16},card:{background:"#fff",border:"1px solid #e4e4df",borderRadius:18,padding:20,boxShadow:"0 8px 25px rgba(0,0,0,.04)"},kicker:{fontSize:10,fontWeight:900,letterSpacing:1.2,color:"#8b7000"},orderButton:{width:"100%",display:"grid",gridTemplateColumns:"1fr auto",gap:5,textAlign:"left",background:"#fafafa",border:"1px solid #e5e5e5",padding:13,borderRadius:12,marginTop:9,cursor:"pointer"},orderActive:{background:"#fff7cf",border:"2px solid #e0b500"},empty:{color:"#777",padding:"20px 0",lineHeight:1.5},sectionHead:{display:"flex",justifyContent:"space-between",alignItems:"center"},count:{background:"#111",color:"#fff",minWidth:32,height:32,borderRadius:16,display:"grid",placeItems:"center",fontWeight:900},driverCard:{display:"flex",alignItems:"center",gap:13,borderTop:"1px solid #eee",padding:"15px 0"},avatar:{width:52,height:52,borderRadius:26,background:"#f4c400",display:"grid",placeItems:"center",fontWeight:900,overflow:"hidden",flex:"0 0 auto"},avatarImage:{width:"100%",height:"100%",objectFit:"cover"},driverInfo:{display:"flex",flexDirection:"column",gap:4,flex:1,fontSize:12,color:"#666"},assign:{background:"#f4c400",border:0,padding:"11px 14px",borderRadius:10,fontWeight:900,cursor:"pointer"},foot:{fontSize:12,color:"#777",marginTop:16,lineHeight:1.5}
};
