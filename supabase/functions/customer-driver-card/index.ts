import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body={orderId:string};

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
 let body:Body;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
 const orderId=String(body?.orderId??"");if(!orderId)return Response.json({error:"ORDER_REQUIRED"},{status:400});
 const userId=ctx.userClaims!.id;
 const{data:order,error:orderError}=await ctx.supabaseAdmin.from("orders").select("id,customer_id,status,delivery_type").eq("id",orderId).maybeSingle();
 if(orderError)return Response.json({error:"ORDER_LOOKUP_FAILED"},{status:500});
 if(!order||order.customer_id!==userId||order.delivery_type!=="DELIVERY")return Response.json({error:"ORDER_NOT_FOUND"},{status:404});
 const{data:delivery,error:deliveryError}=await ctx.supabaseAdmin.from("deliveries").select("id,driver_id,status").eq("order_id",order.id).maybeSingle();
 if(deliveryError)return Response.json({error:"DELIVERY_LOOKUP_FAILED"},{status:500});
 if(!delivery?.driver_id)return Response.json({driver:null,deliveryStatus:delivery?.status??null});
 const{data:driver}=await ctx.supabaseAdmin.from("drivers").select("id,user_id,rating").eq("id",delivery.driver_id).maybeSingle();
 if(!driver)return Response.json({driver:null,deliveryStatus:delivery.status});
 const[{data:profile},{data:vehicle}]=await Promise.all([
  ctx.supabaseAdmin.from("profiles").select("full_name,avatar_url").eq("id",driver.user_id).maybeSingle(),
  ctx.supabaseAdmin.from("driver_vehicles").select("vehicle_type,brand,model,plate").eq("driver_id",driver.id).eq("active",true).limit(1).maybeSingle(),
 ]);
 return Response.json({deliveryStatus:delivery.status,driver:{id:driver.id,name:profile?.full_name??"Entregador CLICK-FOOD",avatarUrl:profile?.avatar_url??null,rating:Number(driver.rating??5),vehicle:vehicle?{type:vehicle.vehicle_type,brand:vehicle.brand??null,model:vehicle.model??null,plate:vehicle.plate??null}:null}});
})};
