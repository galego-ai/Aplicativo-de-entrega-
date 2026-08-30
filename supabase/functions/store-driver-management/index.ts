import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body=
 | {action:"LIST_AVAILABLE";storeId:string}
 | {action:"ASSIGN";orderId:string;driverId:string};

const toRad=(value:number)=>(value*Math.PI)/180;
function haversineKm(a:{lat:number;lng:number},b:{lat:number;lng:number}){
 const r=6371,dLat=toRad(b.lat-a.lat),dLng=toRad(b.lng-a.lng),lat1=toRad(a.lat),lat2=toRad(b.lat);
 const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
 return 2*r*Math.asin(Math.sqrt(h));
}
const money=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;

async function authorizeStore(ctx:any,storeId:string){
 const role=String(ctx.userClaims!.appMetadata?.clickfood_role??"");
 if(["SUPER_ADMIN","ADMIN","SUPPORT"].includes(role))return true;
 const{data}=await ctx.supabaseAdmin.from("store_memberships").select("role").eq("store_id",storeId).eq("user_id",ctx.userClaims!.id).eq("active",true).maybeSingle();
 return !!data&&["OWNER","MANAGER"].includes(String(data.role));
}

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
 let body:Body;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}

 if(body.action==="LIST_AVAILABLE"){
  if(!body.storeId)return Response.json({error:"STORE_REQUIRED"},{status:400});
  if(!(await authorizeStore(ctx,body.storeId)))return Response.json({error:"STORE_ACCESS_DENIED"},{status:403});
  const{data:store}=await ctx.supabaseAdmin.from("stores").select("id,city_id,latitude,longitude").eq("id",body.storeId).maybeSingle();
  if(!store?.city_id)return Response.json({error:"STORE_CITY_REQUIRED"},{status:409});
  const{data:drivers,error:driversError}=await ctx.supabaseAdmin.from("drivers").select("id,user_id,rating,acceptance_rate").eq("city_id",store.city_id).eq("status","ACTIVE").eq("online",true);
  if(driversError)return Response.json({error:"DRIVER_SEARCH_FAILED"},{status:500});
  if(!drivers?.length)return Response.json({drivers:[]});
  const ids=drivers.map((d:any)=>d.id),userIds=drivers.map((d:any)=>d.user_id);
  const[{data:profiles},{data:locations},{data:vehicles},{data:active},{data:dispatch}]=await Promise.all([
   ctx.supabaseAdmin.from("profiles").select("id,full_name,avatar_url").in("id",userIds),
   ctx.supabaseAdmin.from("driver_locations").select("driver_id,latitude,longitude,recorded_at").in("driver_id",ids),
   ctx.supabaseAdmin.from("driver_vehicles").select("driver_id,vehicle_type,brand,model,plate").in("driver_id",ids).eq("active",true),
   ctx.supabaseAdmin.from("deliveries").select("driver_id,status").in("driver_id",ids).not("status","in","(DELIVERED,DELIVERY_CANCELLED)"),
   ctx.supabaseAdmin.from("delivery_dispatch_settings").select("max_radius_km").eq("city_id",store.city_id).maybeSingle(),
  ]);
  const profileMap=new Map((profiles??[]).map((p:any)=>[p.id,p]));
  const locationMap=new Map((locations??[]).map((l:any)=>[l.driver_id,l]));
  const vehicleMap=new Map((vehicles??[]).map((v:any)=>[v.driver_id,v]));
  const busy=new Set((active??[]).filter((d:any)=>d.driver_id).map((d:any)=>d.driver_id));
  const maxRadius=Number(dispatch?.max_radius_km??20);
  const hasStorePoint=store.latitude!=null&&store.longitude!=null;
  const storePoint=hasStorePoint?{lat:Number(store.latitude),lng:Number(store.longitude)}:null;
  const now=Date.now();
  const result=[] as any[];
  for(const d of drivers){
   if(busy.has(d.id))continue;
   const loc=locationMap.get(d.id);if(!loc)continue;
   const locationAgeMs=now-new Date(loc.recorded_at).getTime();if(locationAgeMs>5*60*1000)continue;
   const distance=storePoint?haversineKm(storePoint,{lat:Number(loc.latitude),lng:Number(loc.longitude)}):null;
   if(distance!=null&&distance>maxRadius)continue;
   const p=profileMap.get(d.user_id),v=vehicleMap.get(d.id);
   result.push({id:d.id,name:p?.full_name??"Entregador CLICK-FOOD",avatarUrl:p?.avatar_url??null,rating:Number(d.rating),acceptanceRate:Number(d.acceptance_rate),distanceToStoreKm:distance==null?null:money(distance),vehicle:v?{type:v.vehicle_type,brand:v.brand,model:v.model,plate:v.plate}:null,lastLocationAt:loc.recorded_at});
  }
  result.sort((a,b)=>(a.distanceToStoreKm??999)-(b.distanceToStoreKm??999)||b.rating-a.rating);
  return Response.json({drivers:result});
 }

 if(body.action==="ASSIGN"){
  if(!body.orderId||!body.driverId)return Response.json({error:"ORDER_AND_DRIVER_REQUIRED"},{status:400});
  const{data:order}=await ctx.supabaseAdmin.from("orders").select("id,order_number,store_id,address_id,delivery_type,status,delivery_fee").eq("id",body.orderId).maybeSingle();
  if(!order||order.delivery_type!=="DELIVERY")return Response.json({error:"DELIVERY_ORDER_NOT_FOUND"},{status:404});
  if(!(await authorizeStore(ctx,order.store_id)))return Response.json({error:"STORE_ACCESS_DENIED"},{status:403});
  if(!["READY","WAITING_DRIVER"].includes(order.status))return Response.json({error:"ORDER_NOT_WAITING_DRIVER"},{status:409});
  const[{data:store},{data:address},{data:driver}]=await Promise.all([
   ctx.supabaseAdmin.from("stores").select("city_id,latitude,longitude").eq("id",order.store_id).single(),
   ctx.supabaseAdmin.from("customer_addresses").select("latitude,longitude").eq("id",order.address_id).maybeSingle(),
   ctx.supabaseAdmin.from("drivers").select("id,user_id,city_id,status,online").eq("id",body.driverId).maybeSingle(),
  ]);
  if(!store||store.latitude==null||store.longitude==null||!address||address.latitude==null||address.longitude==null)return Response.json({error:"DELIVERY_COORDINATES_REQUIRED"},{status:422});
  if(!driver||driver.status!=="ACTIVE"||!driver.online)return Response.json({error:"DRIVER_NOT_AVAILABLE"},{status:409});
  if(driver.city_id!==store.city_id)return Response.json({error:"DRIVER_WRONG_CITY"},{status:409});
  const{data:location}=await ctx.supabaseAdmin.from("driver_locations").select("latitude,longitude,recorded_at").eq("driver_id",driver.id).maybeSingle();
  if(!location||Date.now()-new Date(location.recorded_at).getTime()>5*60*1000)return Response.json({error:"DRIVER_LOCATION_STALE"},{status:409});
  const[{data:pricing},{data:dispatch}]=await Promise.all([
   ctx.supabaseAdmin.from("city_delivery_pricing").select("driver_base_earning,driver_per_km,driver_minimum_earning").eq("city_id",store.city_id).maybeSingle(),
   ctx.supabaseAdmin.from("delivery_dispatch_settings").select("max_radius_km").eq("city_id",store.city_id).maybeSingle(),
  ]);
  const storePoint={lat:Number(store.latitude),lng:Number(store.longitude)};
  const pickupDistance=haversineKm(storePoint,{lat:Number(location.latitude),lng:Number(location.longitude)});
  if(pickupDistance>Number(dispatch?.max_radius_km??20))return Response.json({error:"DRIVER_OUTSIDE_RADIUS"},{status:409});
  const deliveryDistance=haversineKm(storePoint,{lat:Number(address.latitude),lng:Number(address.longitude)});
  const earning=money(Math.max(Number(pricing?.driver_minimum_earning??6),Number(pricing?.driver_base_earning??4)+(pickupDistance+deliveryDistance)*Number(pricing?.driver_per_km??1)));
  const{data:deliveryId,error}=await ctx.supabaseAdmin.rpc("assign_delivery_manual_atomic",{p_order_id:order.id,p_driver_id:driver.id,p_driver_earning:earning,p_actor_id:ctx.userClaims!.id});
  if(error){
   const msg=String(error.message??"");
   const code=["DRIVER_BUSY","DRIVER_NOT_AVAILABLE","DRIVER_WRONG_CITY","DELIVERY_ALREADY_ASSIGNED","ORDER_NOT_WAITING_DRIVER","DELIVERY_NOT_ASSIGNABLE"].find(x=>msg.includes(x))??"MANUAL_ASSIGN_FAILED";
   return Response.json({error:code},{status:409});
  }
  await Promise.all([
   ctx.supabaseAdmin.from("notifications").insert({user_id:driver.user_id,notification_type:"DELIVERY_ASSIGNED",title:"Entrega atribuída a você",body:`Pedido #${order.order_number} • ganho ${new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(earning)}`,data:{deliveryId,orderId:order.id,earning}}),
   ctx.supabaseAdmin.from("audit_logs").insert({actor_id:ctx.userClaims!.id,action:"DELIVERY_MANUAL_ASSIGNED",entity_type:"delivery",entity_id:deliveryId,after_data:{orderId:order.id,driverId:driver.id,earning,pickupDistanceKm:money(pickupDistance),deliveryDistanceKm:money(deliveryDistance)}}),
  ]);
  return Response.json({deliveryId,driverId:driver.id,earning,pickupDistanceKm:money(pickupDistance),deliveryDistanceKm:money(deliveryDistance)});
 }
 return Response.json({error:"UNKNOWN_ACTION"},{status:400});
})};
