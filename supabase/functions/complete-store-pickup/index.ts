import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body={orderId?:string};

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
 let body:Body={};try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
 const orderId=String(body.orderId??"");if(!orderId)return Response.json({error:"ORDER_REQUIRED"},{status:400});
 const userId=ctx.userClaims!.id;const globalRole=String(ctx.userClaims!.appMetadata?.clickfood_role??"");
 const{data:order,error:orderError}=await ctx.supabaseAdmin.from("orders").select("id,store_id,status,delivery_type,payment_status").eq("id",orderId).maybeSingle();
 if(orderError)return Response.json({error:"ORDER_LOOKUP_FAILED"},{status:500});if(!order)return Response.json({error:"ORDER_NOT_FOUND"},{status:404});
 const isAdmin=["SUPER_ADMIN","ADMIN","SUPPORT"].includes(globalRole);
 if(!isAdmin){const{data:membership}=await ctx.supabaseAdmin.from("store_memberships").select("role").eq("store_id",order.store_id).eq("user_id",userId).eq("active",true).maybeSingle();if(!membership||!["OWNER","MANAGER","EXPEDITION"].includes(String(membership.role)))return Response.json({error:"STORE_PICKUP_DENIED"},{status:403});}
 if(order.delivery_type!=="PICKUP")return Response.json({error:"ORDER_NOT_PICKUP"},{status:409});
 if(order.status!=="READY")return Response.json({error:"ORDER_NOT_READY",currentStatus:order.status},{status:409});
 const{data:updated,error}=await ctx.supabaseAdmin.rpc("complete_store_pickup_atomic",{p_order_id:order.id,p_actor_id:userId});
 if(error){const msg=String(error.message??"");const code=msg.includes("PAYMENT_NOT_CONFIRMED")?"PAYMENT_NOT_CONFIRMED":msg.includes("ORDER_NOT_READY")?"ORDER_NOT_READY":msg.includes("ORDER_NOT_PICKUP")?"ORDER_NOT_PICKUP":"PICKUP_COMPLETION_FAILED";return Response.json({error:code},{status:code==="PICKUP_COMPLETION_FAILED"?500:409});}
 return Response.json({ok:true,order:updated});
})};
