import { withSupabase } from "npm:@supabase/server@1.4.1";

type ActionBody = { orderId:string; action:"ACCEPT"|"REJECT"|"START_PREPARING"|"MARK_READY"|"COMPLETE_PICKUP"|"CANCEL"; reason?:string };
const transitionByAction={ACCEPT:["WAITING_STORE","ACCEPTED"],REJECT:["WAITING_STORE","REJECTED"],START_PREPARING:["ACCEPTED","PREPARING"],MARK_READY:["PREPARING","READY"]} as const;
const allowedRolesByAction:Record<ActionBody["action"],string[]>={ACCEPT:["OWNER","MANAGER"],REJECT:["OWNER","MANAGER"],START_PREPARING:["OWNER","MANAGER","KITCHEN"],MARK_READY:["OWNER","MANAGER","KITCHEN","EXPEDITION"],COMPLETE_PICKUP:["OWNER","MANAGER","EXPEDITION"],CANCEL:["OWNER","MANAGER"]};
async function requestRefund(req:Request,orderId:string,reason:string){const auth=req.headers.get("Authorization")??"";if(!auth)return{ok:false,data:{error:"AUTH_REQUIRED"}};const response=await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-refund`,{method:"POST",headers:{Authorization:auth,"Content-Type":"application/json"},body:JSON.stringify({orderId,reason})});let data:any={};try{data=await response.json()}catch{}return{ok:response.ok,data};}

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
 let body:ActionBody;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
 if(!body.orderId||!body.action||!allowedRolesByAction[body.action])return Response.json({error:"ORDER_AND_VALID_ACTION_REQUIRED"},{status:400});
 const userId=ctx.userClaims!.id,role=String(ctx.userClaims!.appMetadata?.clickfood_role??""),isAdmin=["SUPER_ADMIN","ADMIN","SUPPORT"].includes(role);
 const{data:order,error:orderError}=await ctx.supabaseAdmin.from("orders").select("id,store_id,status,payment_status,delivery_type").eq("id",body.orderId).maybeSingle();
 if(orderError)return Response.json({error:"ORDER_LOOKUP_FAILED"},{status:500});if(!order)return Response.json({error:"ORDER_NOT_FOUND"},{status:404});
 if(!isAdmin){const{data:membership}=await ctx.supabaseAdmin.from("store_memberships").select("role").eq("store_id",order.store_id).eq("user_id",userId).eq("active",true).maybeSingle();if(!membership||!allowedRolesByAction[body.action].includes(membership.role))return Response.json({error:"STORE_ACTION_DENIED"},{status:403});}
 if(["REJECT","CANCEL"].includes(body.action)&&!body.reason?.trim())return Response.json({error:"REASON_REQUIRED"},{status:400});

 if(body.action==="COMPLETE_PICKUP"){
  if(order.delivery_type!=="PICKUP")return Response.json({error:"ORDER_NOT_PICKUP"},{status:409});
  const{data:updated,error}=await ctx.supabaseAdmin.rpc("complete_store_pickup_atomic",{p_order_id:order.id,p_actor_id:userId});
  if(error){const msg=String(error.message??"");const code=msg.includes("ORDER_NOT_READY")?"ORDER_NOT_READY":msg.includes("PAYMENT_NOT_CONFIRMED")?"PAYMENT_NOT_CONFIRMED":msg.includes("ORDER_NOT_PICKUP")?"ORDER_NOT_PICKUP":"PICKUP_COMPLETION_FAILED";return Response.json({error:code},{status:code==="PICKUP_COMPLETION_FAILED"?500:409});}
  return Response.json({order:updated,pickupCompleted:true,dispatchRequired:false,refundRequired:false});
 }

 let expected:string,next:string;
 if(body.action==="CANCEL"){
  expected=order.status;next="CANCELLED";
  if(!["WAITING_STORE","ACCEPTED","PREPARING","READY","WAITING_DRIVER","DRIVER_ASSIGNED"].includes(expected))return Response.json({error:"ORDER_CANNOT_BE_CANCELLED"},{status:409});
 }else{
  [expected,next]=transitionByAction[body.action];
  if(order.status!==expected)return Response.json({error:"ORDER_STATUS_CHANGED",currentStatus:order.status},{status:409});
 }
 const{data:updatedOrder,error:transitionError}=await ctx.supabaseAdmin.rpc("transition_order_atomic",{p_order_id:order.id,p_expected_status:expected,p_next_status:next,p_actor_id:userId,p_reason:body.reason?.trim()??null});
 if(transitionError){const conflict=transitionError.message?.includes("STATUS")||transitionError.message?.includes("TRANSITION");return Response.json({error:conflict?"ORDER_STATUS_CHANGED":"ORDER_ACTION_FAILED"},{status:conflict?409:500});}
 if(["REJECTED","CANCELLED"].includes(next)){
  const{data:delivery}=await ctx.supabaseAdmin.from("deliveries").select("id,driver_id,status").eq("order_id",order.id).maybeSingle();
  if(delivery&&!["DELIVERED","DELIVERY_CANCELLED"].includes(delivery.status)){
   await Promise.all([ctx.supabaseAdmin.from("deliveries").update({status:"DELIVERY_CANCELLED",updated_at:new Date().toISOString()}).eq("id",delivery.id),ctx.supabaseAdmin.from("delivery_offers").update({status:"EXPIRED",responded_at:new Date().toISOString()}).eq("delivery_id",delivery.id).eq("status","PENDING")]);
   if(delivery.driver_id){const{data:driver}=await ctx.supabaseAdmin.from("drivers").select("user_id").eq("id",delivery.driver_id).maybeSingle();if(driver?.user_id)await ctx.supabaseAdmin.from("notifications").insert({user_id:driver.user_id,notification_type:"DELIVERY_CANCELLED",title:"Entrega cancelada",body:"O pedido foi cancelado pela loja. Você já pode receber novos chamados.",data:{orderId:order.id,deliveryId:delivery.id}});}
  }
  if(["PAID","PARTIALLY_REFUNDED"].includes(order.payment_status)){const refund=await requestRefund(req,order.id,body.reason?.trim()||"Pedido cancelado pela loja");return Response.json({order:updatedOrder,dispatchRequired:false,refundRequired:true,refundPending:!refund.ok||!["COMPLETED","FAILED"].includes(String(refund.data?.refundStatus??"")),refundStatus:refund.data?.refundStatus??"PENDING",refundError:refund.ok?null:(refund.data?.error??"PAYMENT_REFUND_FAILED")});}
 }
 return Response.json({order:updatedOrder,dispatchRequired:next==="READY"&&order.delivery_type==="DELIVERY",refundRequired:false});
})};
