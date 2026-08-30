import { withSupabase } from "npm:@supabase/server@1.4.1";

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
 const userId=ctx.userClaims!.id;
 const{data:driver,error:driverError}=await ctx.supabaseAdmin.from("drivers").select("id").eq("user_id",userId).maybeSingle();
 if(driverError)return Response.json({error:"DRIVER_LOOKUP_FAILED"},{status:500});
 if(!driver)return Response.json({error:"DRIVER_REQUIRED"},{status:403});

 const{data:deliveries,error:deliveryError}=await ctx.supabaseAdmin.from("deliveries")
  .select("id,order_id,delivery_fee,driver_earning,pickup_at,delivered_at,created_at")
  .eq("driver_id",driver.id).eq("status","DELIVERED")
  .order("delivered_at",{ascending:false}).limit(50);
 if(deliveryError)return Response.json({error:"DELIVERY_HISTORY_FAILED"},{status:500});

 const rows=(deliveries??[]) as any[];
 const orderIds=[...new Set(rows.map(row=>String(row.order_id)))];
 const{data:orders,error:orderError}=orderIds.length?await ctx.supabaseAdmin.from("orders").select("id,order_number,store_id,created_at").in("id",orderIds):{data:[],error:null};
 if(orderError)return Response.json({error:"ORDER_HISTORY_FAILED"},{status:500});
 const orderMap=new Map<string,any>((orders??[]).map((order:any)=>[String(order.id),order]));
 const storeIds=[...new Set((orders??[]).map((order:any)=>String(order.store_id)))];
 const{data:stores,error:storeError}=storeIds.length?await ctx.supabaseAdmin.from("stores").select("id,name").in("id",storeIds):{data:[],error:null};
 if(storeError)return Response.json({error:"STORE_HISTORY_FAILED"},{status:500});
 const storeMap=new Map<string,string>((stores??[]).map((store:any)=>[String(store.id),String(store.name)]));

 const history=rows.map(row=>{
  const order=orderMap.get(String(row.order_id));
  const pickupAt=row.pickup_at?String(row.pickup_at):null;
  const deliveredAt=row.delivered_at?String(row.delivered_at):null;
  const durationMinutes=pickupAt&&deliveredAt?Math.max(0,Math.round((new Date(deliveredAt).getTime()-new Date(pickupAt).getTime())/60000)):null;
  return{
   id:String(row.id),
   orderNumber:order?.order_number==null?null:Number(order.order_number),
   storeName:order?.store_id?storeMap.get(String(order.store_id))??"Loja CLICK-FOOD":"Loja CLICK-FOOD",
   deliveryFee:Number(row.delivery_fee??0),
   driverEarning:Number(row.driver_earning??0),
   pickupAt,
   deliveredAt,
   durationMinutes,
  };
 });
 const totalEarnings=Math.round(history.reduce((sum,item)=>sum+item.driverEarning,0)*100)/100;
 return Response.json({driverId:driver.id,count:history.length,totalEarnings,history});
})};
