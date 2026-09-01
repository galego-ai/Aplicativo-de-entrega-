"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Store = { id:string; name:string; latitude:number|null; longitude:number|null };
type Delivery = { id:string; order_id:string; driver_id:string|null; status:string; orders:any };
type DriverLocation = { driver_id:string; latitude:number; longitude:number; recorded_at:string };

const activeStatuses = new Set(["SEARCHING_DRIVER","OFFER_SENT","DRIVER_ASSIGNED","DRIVER_TO_STORE","DRIVER_AT_STORE","PICKUP_CONFIRMED","DRIVER_TO_CUSTOMER","DRIVER_AT_CUSTOMER","CUSTOMER_UNAVAILABLE","INCIDENT","RETURN_REQUIRED"]);
const rel = (value:any) => Array.isArray(value) ? value[0] : value;
const ago = (value:string|null|undefined) => {
  if (!value) return "sem GPS";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  return seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds/60)}min` : `${Math.floor(seconds/3600)}h`;
};
const merc = (lat:number) => Math.log(Math.tan(Math.PI/4 + (Math.max(-85, Math.min(85, lat))*Math.PI/180)/2));

export default function StoreOperationalMap() {
  const [loading,setLoading] = useState(true);
  const [store,setStore] = useState<Store|null>(null);
  const [deliveries,setDeliveries] = useState<Delivery[]>([]);
  const [locations,setLocations] = useState<DriverLocation[]>([]);
  const [maxRadiusKm,setMaxRadiusKm] = useState<number|null>(null);
  const [message,setMessage] = useState("");
  const [lastRefresh,setLastRefresh] = useState<Date|null>(null);

  async function resolveStore() {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return null;
    const { data } = await supabase
      .from("store_memberships")
      .select("store_id,stores!inner(id,name,latitude,longitude)")
      .eq("user_id", userId)
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const related:any = rel((data as any).stores);
    return {
      id: String((data as any).store_id),
      name: String(related?.name ?? "Minha loja"),
      latitude: related?.latitude == null ? null : Number(related.latitude),
      longitude: related?.longitude == null ? null : Number(related.longitude),
    } as Store;
  }

  async function load(currentStore = store) {
    if (!currentStore) return;
    const [deliveryResult,settingsResult] = await Promise.all([
      supabase
        .from("deliveries")
        .select("id,order_id,driver_id,status,orders!inner(id,order_number,status,store_id)")
        .eq("orders.store_id", currentStore.id)
        .limit(250),
      supabase
        .from("store_delivery_settings")
        .select("max_radius_km")
        .eq("store_id", currentStore.id)
        .maybeSingle(),
    ]);
    const { data: deliveryData, error: deliveryError } = deliveryResult;
    if (deliveryError) {
      setMessage("Não foi possível carregar as entregas da loja agora.");
      return;
    }
    setMaxRadiusKm(settingsResult.data?.max_radius_km == null ? null : Number(settingsResult.data.max_radius_km));
    const active = ((deliveryData ?? []) as any[]).filter(item => activeStatuses.has(String(item.status))) as Delivery[];
    setDeliveries(active);
    const driverIds = [...new Set(active.map(item => item.driver_id).filter(Boolean))] as string[];
    if (!driverIds.length) {
      setLocations([]);
      setLastRefresh(new Date());
      setMessage("");
      return;
    }
    const { data: locationData, error: locationError } = await supabase
      .from("driver_locations")
      .select("driver_id,latitude,longitude,recorded_at")
      .in("driver_id", driverIds);
    if (locationError) {
      setMessage("As entregas foram carregadas, mas o GPS dos entregadores não pôde ser atualizado.");
      return;
    }
    setLocations((locationData ?? []).map((item:any) => ({
      driver_id: String(item.driver_id),
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
      recorded_at: String(item.recorded_at),
    })));
    setLastRefresh(new Date());
    setMessage("");
  }

  async function boot() {
    setLoading(true);
    const currentStore = await resolveStore();
    setStore(currentStore);
    if (currentStore) await load(currentStore);
    setLoading(false);
  }

  useEffect(() => { void boot(); }, []);
  useEffect(() => {
    if (!store) return;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void load(store); }, 250);
    };
    const channel = supabase
      .channel(`lojista-map-${store.id}`)
      .on("postgres_changes", { event:"*", schema:"public", table:"driver_locations" }, refresh)
      .on("postgres_changes", { event:"*", schema:"public", table:"deliveries" }, refresh)
      .on("postgres_changes", { event:"*", schema:"public", table:"orders", filter:`store_id=eq.${store.id}` }, refresh)
      .on("postgres_changes", { event:"*", schema:"public", table:"store_delivery_settings", filter:`store_id=eq.${store.id}` }, refresh)
      .subscribe();
    const fallback = setInterval(() => { void load(store); }, 10000);
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(fallback);
      void supabase.removeChannel(channel);
    };
  }, [store?.id]);

  const pins = useMemo(() => locations.map(location => {
    const delivery = deliveries.find(item => item.driver_id === location.driver_id);
    const order:any = rel(delivery?.orders);
    return { ...location, delivery, orderNumber: order?.order_number ?? null };
  }), [locations, deliveries]);

  const coverage = useMemo(() => {
    if (!store || store.latitude == null || store.longitude == null || maxRadiusKm == null || maxRadiusKm <= 0) return null;
    const latDelta = maxRadiusKm / 111.32;
    const cosine = Math.max(0.2, Math.cos(store.latitude * Math.PI / 180));
    const lngDelta = maxRadiusKm / (111.32 * cosine);
    return { latDelta, lngDelta };
  }, [store?.id,store?.latitude,store?.longitude,maxRadiusKm]);

  const bounds = useMemo(() => {
    const points:Array<[number,number]> = [];
    if (store?.latitude != null && store.longitude != null) {
      points.push([store.latitude, store.longitude]);
      if (coverage) {
        points.push([store.latitude + coverage.latDelta, store.longitude]);
        points.push([store.latitude - coverage.latDelta, store.longitude]);
        points.push([store.latitude, store.longitude + coverage.lngDelta]);
        points.push([store.latitude, store.longitude - coverage.lngDelta]);
      }
    }
    for (const pin of pins) points.push([pin.latitude, pin.longitude]);
    if (!points.length) return { minLat:-16.15,maxLat:-15.35,minLng:-48.25,maxLng:-47.45 };
    let minLat=Math.min(...points.map(p=>p[0])), maxLat=Math.max(...points.map(p=>p[0]));
    let minLng=Math.min(...points.map(p=>p[1])), maxLng=Math.max(...points.map(p=>p[1]));
    const latPad=Math.max(.01,(maxLat-minLat)*.18), lngPad=Math.max(.01,(maxLng-minLng)*.18);
    return { minLat:minLat-latPad,maxLat:maxLat+latPad,minLng:minLng-lngPad,maxLng:maxLng+lngPad };
  }, [store?.id, store?.latitude, store?.longitude, pins, coverage]);

  const pinStyle = (lat:number,lng:number) => {
    const x=(lng-bounds.minLng)/(bounds.maxLng-bounds.minLng);
    const top=(merc(bounds.maxLat)-merc(lat))/(merc(bounds.maxLat)-merc(bounds.minLat));
    return { left:`${Math.max(0,Math.min(1,x))*100}%`, top:`${Math.max(0,Math.min(1,top))*100}%` };
  };

  const coverageStyle = useMemo(() => {
    if (!store || store.latitude == null || store.longitude == null || !coverage) return null;
    const center = pinStyle(store.latitude,store.longitude);
    const width = Math.min(190,(coverage.lngDelta / Math.max(.000001,bounds.maxLng-bounds.minLng))*200);
    const height = Math.min(190,(coverage.latDelta / Math.max(.000001,bounds.maxLat-bounds.minLat))*200);
    return { ...center, width:`${width}%`, height:`${height}%` };
  }, [store?.id,store?.latitude,store?.longitude,coverage,bounds.minLat,bounds.maxLat,bounds.minLng,bounds.maxLng]);

  const osm = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(`${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`)}&layer=mapnik`;

  if (loading) return <main className="storePage"><section className="storePanel">Carregando mapa operacional...</section></main>;
  if (!store) return <main className="storePage"><section className="storePanel"><h1>Acesso restrito</h1><p className="muted">Entre com uma conta vinculada a uma loja.</p></section></main>;

  return <main className="storePage">
    <section className="storeHeader">
      <div><small>LOGÍSTICA EM TEMPO REAL</small><h1>Mapa da loja</h1><p>{store.name} • acompanhe entregadores e a área máxima configurada para entrega.</p></div>
      <div><button className="primaryAction" onClick={()=>void load(store)}>ATUALIZAR AGORA</button><small style={{display:"block",marginTop:8}}>Última atualização: {lastRefresh?.toLocaleTimeString("pt-BR") ?? "-"}</small></div>
    </section>
    {message && <div className="storeNotice">{message}</div>}
    <section className="metricGrid">
      <article><b>{deliveries.length}</b><span>Entregas ativas</span></article>
      <article><b>{pins.length}</b><span>Entregadores com GPS</span></article>
      <article><b>{maxRadiusKm == null ? "—" : `${maxRadiusKm.toFixed(1)} km`}</b><span>Raio máximo de entrega</span></article>
      <article><b>{deliveries.filter(item=>item.status==="DRIVER_AT_CUSTOMER").length}</b><span>No cliente</span></article>
    </section>
    <section className="storePanel">
      <div className="panelTitle"><div><small>OPERAÇÃO AO VIVO</small><h2>Entregadores em rota</h2></div></div>
      <div style={{position:"relative",height:520,borderRadius:18,overflow:"hidden",border:"1px solid #ddd",background:"#e9ecef"}}>
        <iframe title="Mapa OpenStreetMap" src={osm} style={{position:"absolute",inset:0,width:"100%",height:"100%",border:0,pointerEvents:"none"}} />
        {coverageStyle && <div title={`Área máxima de entrega • ${maxRadiusKm?.toFixed(1)} km`} style={{position:"absolute",transform:"translate(-50%,-50%)",...coverageStyle,border:"2px dashed #d3a900",background:"rgba(244,196,0,.13)",borderRadius:"50%",zIndex:2,pointerEvents:"none"}} />}
        {store.latitude!=null && store.longitude!=null && <div title={store.name} style={{position:"absolute",transform:"translate(-50%,-50%)",...pinStyle(store.latitude,store.longitude),zIndex:3}}><div style={{background:"#111",color:"#fff",borderRadius:18,padding:"7px 9px",fontSize:17,border:"2px solid #fff"}}>🏪</div></div>}
        {pins.map(pin => <div key={pin.driver_id} title={`Pedido #${pin.orderNumber ?? "-"} • GPS ${ago(pin.recorded_at)}`} style={{position:"absolute",transform:"translate(-50%,-50%)",...pinStyle(pin.latitude,pin.longitude),zIndex:4}}><div style={{background:"#f4c400",borderRadius:20,padding:"7px 9px",fontSize:18,border:"2px solid #111",boxShadow:"0 2px 8px #0005"}}>🛵</div></div>)}
        <div style={{position:"absolute",left:12,bottom:12,zIndex:5,background:"rgba(17,17,17,.88)",color:"#fff",padding:"8px 10px",borderRadius:10,fontSize:10}}>🏪 loja &nbsp; 🛵 entregador &nbsp; ◯ área de entrega</div>
      </div>
      <p className="muted">Mapa-base: OpenStreetMap. O círculo representa o raio máximo configurado para a loja. O RLS libera somente o GPS de entregadores associados às próprias entregas ativas.</p>
    </section>
    <section className="storePanel">
      <div className="panelTitle"><div><small>ENTREGAS</small><h2>Rastreamento disponível</h2></div></div>
      <div className="adminList">
        {deliveries.map(delivery => {
          const order:any = rel(delivery.orders);
          const location = locations.find(item => item.driver_id === delivery.driver_id);
          return <div key={delivery.id}><div><b>Pedido #{order?.order_number ?? "-"}</b><small>{delivery.status} • GPS {location ? ago(location.recorded_at) : "aguardando localização"}</small></div><span>{location ? "📍" : "—"}</span></div>;
        })}
        {!deliveries.length && <p className="muted">Nenhuma entrega ativa agora.</p>}
      </div>
    </section>
  </main>;
}
