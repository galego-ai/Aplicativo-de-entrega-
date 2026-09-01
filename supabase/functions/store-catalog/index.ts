import { withSupabase } from "npm:@supabase/server@1.4.1";

const dayMap:Record<string,number>={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
type HoursRow={store_id:string;weekday:number;opens_at:string|null;closes_at:string|null;closed:boolean};
function clockParts(timezone:string){const fmt=new Intl.DateTimeFormat("en-US",{timeZone:timezone,weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});const parts=Object.fromEntries(fmt.formatToParts(new Date()).map(p=>[p.type,p.value]));return{weekday:dayMap[parts.weekday]??0,minutes:Number(parts.hour)*60+Number(parts.minute)};}
function hm(v:string|null){if(!v)return null;const[h,m]=v.slice(0,5).split(":").map(Number);return h*60+m;}
function isOpen(rows:HoursRow[],timezone:string){if(!rows.length)return true;const{weekday,minutes}=clockParts(timezone);const today=rows.find(r=>r.weekday===weekday);if(today&&!today.closed){const open=hm(today.opens_at),close=hm(today.closes_at);if(open==null&&close==null)return true;if(open!=null&&close!=null){if(open===close)return true;if(open<close&&minutes>=open&&minutes<close)return true;if(open>close&&minutes>=open)return true;}}const prev=rows.find(r=>r.weekday===((weekday+6)%7));if(prev&&!prev.closed){const open=hm(prev.opens_at),close=hm(prev.closes_at);if(open!=null&&close!=null&&open>close&&minutes<close)return true;}return false;}
export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="GET"&&req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
 // Contatos administrativos (telefone, WhatsApp, e-mail e redes sociais) são deliberadamente
 // excluídos deste catálogo. O app Cliente recebe somente dados necessários para descobrir a loja,
 // consultar o cardápio e concluir a compra dentro do CLICK-FOOD.
 const{data:stores,error}=await ctx.supabaseAdmin.from("stores").select("id,name,slogan,description,logo_url,cover_url,primary_color,secondary_color,minimum_order,average_preparation_time,city_id,cities(timezone)").eq("status","ACTIVE").order("name").limit(100);
 if(error)return Response.json({error:"STORE_CATALOG_FAILED"},{status:500});
 const ids=(stores??[]).map((s:any)=>s.id);
 const[{data:hours},{data:deliverySettings}]=await Promise.all([
  ids.length?ctx.supabaseAdmin.from("store_business_hours").select("store_id,weekday,opens_at,closes_at,closed").in("store_id",ids):Promise.resolve({data:[] as HoursRow[]}),
  ids.length?ctx.supabaseAdmin.from("store_delivery_settings").select("store_id,pickup_enabled,clickfood_delivery_enabled,own_delivery_enabled,max_radius_km").in("store_id",ids):Promise.resolve({data:[] as any[]}),
 ]);
 const byStore=new Map<string,HoursRow[]>();for(const row of (hours??[]) as HoursRow[]){const list=byStore.get(row.store_id)??[];list.push(row);byStore.set(row.store_id,list);}
 const deliveryByStore=new Map((deliverySettings??[]).map((row:any)=>[String(row.store_id),row]));
 const result=(stores??[]).map((s:any)=>{const city=Array.isArray(s.cities)?s.cities[0]:s.cities;const timezone=String(city?.timezone??"America/Sao_Paulo");const delivery:any=deliveryByStore.get(String(s.id));return{id:s.id,name:s.name,slogan:s.slogan,description:s.description,logo_url:s.logo_url,cover_url:s.cover_url,primary_color:s.primary_color??"#F4C400",secondary_color:s.secondary_color??"#111111",minimum_order:Number(s.minimum_order),average_preparation_time:Number(s.average_preparation_time),timezone,open_now:isOpen(byStore.get(s.id)??[],timezone),pickup_enabled:Boolean(delivery?.pickup_enabled??true),clickfood_delivery_enabled:Boolean(delivery?.clickfood_delivery_enabled??true),own_delivery_enabled:Boolean(delivery?.own_delivery_enabled??false),max_radius_km:delivery?.max_radius_km==null?null:Number(delivery.max_radius_km)};});
 return Response.json({stores:result,generatedAt:new Date().toISOString()});
})};
