import { withSupabase } from "npm:@supabase/server@1.4.1";

type Action="STATUS"|"RESUME"|"REASSIGN"|"REQUIRE_RETURN"|"COMPLETE_RETURN";
type Body={deliveryId:string;action:Action;note?:string};
const allowedActions:Action[]=["STATUS","RESUME","REASSIGN","REQUIRE_RETURN","COMPLETE_RETURN"];
const activeIncidentStatuses=new Set(["OPEN","RETURN_REQUIRED"]);

async function invokeInternal(req:Request,slug:string,body:Record<string,unknown>){
  const auth=req.headers.get("Authorization")??"";
  if(!auth)return{ok:false,status:401,data:{error:"AUTH_REQUIRED"}};
  const response=await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${slug}`,{method:"POST",headers:{Authorization:auth,"Content-Type":"application/json"},body:JSON.stringify(body)});
  let data:any={};try{data=await response.json()}catch{}
  return{ok:response.ok,status:response.status,data};
}

function capabilities(delivery:any,incident:any){
  const active=!!incident&&activeIncidentStatuses.has(String(incident.status));
  const beforePickup=!delivery?.pickup_at&&["DRIVER_ASSIGNED","DRIVER_TO_STORE","DRIVER_AT_STORE"].includes(String(incident?.previous_status??""));
  return{
    canResume:active&&["INCIDENT","CUSTOMER_UNAVAILABLE"].includes(String(delivery?.status??"")),
    canReassign:active&&delivery?.status==="INCIDENT"&&beforePickup,
    canRequireReturn:active&&["INCIDENT","CUSTOMER_UNAVAILABLE"].includes(String(delivery?.status??""))&&!!delivery?.pickup_at,
    canCompleteReturn:active&&delivery?.status==="RETURN_REQUIRED",
  };
}

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
  if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
  let body:Body;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
  const deliveryId=String(body?.deliveryId??"");const action=body?.action;const note=String(body?.note??"").trim().slice(0,1000);
  if(!deliveryId||!allowedActions.includes(action))return Response.json({error:"DELIVERY_AND_VALID_ACTION_REQUIRED"},{status:400});

  const userId=ctx.userClaims!.id;const globalRole=String(ctx.userClaims!.appMetadata?.clickfood_role??"");
  const{data:delivery,error:deliveryError}=await ctx.supabaseAdmin.from("deliveries").select("id,order_id,driver_id,status,pickup_at,updated_at").eq("id",deliveryId).maybeSingle();
  if(deliveryError)return Response.json({error:"DELIVERY_LOOKUP_FAILED"},{status:500});
  if(!delivery)return Response.json({error:"DELIVERY_NOT_FOUND"},{status:404});
  const{data:order,error:orderError}=await ctx.supabaseAdmin.from("orders").select("id,store_id,customer_id,order_number,status,payment_status").eq("id",delivery.order_id).maybeSingle();
  if(orderError||!order)return Response.json({error:"ORDER_NOT_FOUND"},{status:404});

  let authorized=["SUPER_ADMIN","ADMIN","SUPPORT"].includes(globalRole);
  if(!authorized){
    const{data:membership}=await ctx.supabaseAdmin.from("store_memberships").select("role").eq("store_id",order.store_id).eq("user_id",userId).eq("active",true).maybeSingle();
    authorized=!!membership&&["OWNER","MANAGER"].includes(String(membership.role));
  }
  if(!authorized)return Response.json({error:"INCIDENT_ACTION_DENIED"},{status:403});

  const{data:incident}=await ctx.supabaseAdmin.from("delivery_incidents").select("id,delivery_id,order_id,driver_id,ticket_id,incident_type,previous_status,status,resolution,opened_at,resolved_at,updated_at").eq("delivery_id",deliveryId).order("opened_at",{ascending:false}).limit(1).maybeSingle();
  const currentCaps=capabilities(delivery,incident);
  if(action==="STATUS")return Response.json({delivery,order,incident,capabilities:currentCaps});
  if(!incident||!activeIncidentStatuses.has(String(incident.status)))return Response.json({error:"ACTIVE_INCIDENT_NOT_FOUND"},{status:409});
  if(action==="RESUME"&&!currentCaps.canResume)return Response.json({error:"INCIDENT_NOT_RESUMABLE"},{status:409});
  if(action==="REASSIGN"&&!currentCaps.canReassign)return Response.json({error:"INCIDENT_NOT_REASSIGNABLE"},{status:409});
  if(action==="REQUIRE_RETURN"&&!currentCaps.canRequireReturn)return Response.json({error:"RETURN_NOT_AVAILABLE"},{status:409});
  if(action==="COMPLETE_RETURN"&&!currentCaps.canCompleteReturn)return Response.json({error:"RETURN_NOT_READY_TO_COMPLETE"},{status:409});

  const{data:result,error:rpcError}=await ctx.supabaseAdmin.rpc("resolve_delivery_incident_service",{p_delivery_id:deliveryId,p_action:action,p_actor_id:userId});
  if(rpcError){
    const msg=String(rpcError.message??"");
    const conflict=/INCIDENT_|RETURN_|ACTIVE_|INVALID_|DELIVERY_|ORDER_/.test(msg);
    return Response.json({error:conflict?msg.split(" ")[0]:"INCIDENT_ACTION_FAILED"},{status:conflict?409:500});
  }

  let dispatch:any=null;
  if(result?.dispatchRequired){
    const attempt=await invokeInternal(req,"dispatch-delivery",{orderId:order.id});
    dispatch={ok:attempt.ok,status:attempt.status,error:attempt.ok?null:(attempt.data?.error??"DISPATCH_FAILED")};
  }

  let refund:any=null;
  if(result?.refundRequired){
    const attempt=await invokeInternal(req,"payment-refund",{orderId:order.id,reason:"Retorno do pedido confirmado após incidente de entrega"});
    refund={ok:attempt.ok,status:attempt.status,refundStatus:attempt.data?.refundStatus??null,error:attempt.ok?null:(attempt.data?.error??"REFUND_FAILED")};
  }

  const actionText:Record<Exclude<Action,"STATUS">,string>={
    RESUME:"A operação autorizou a retomada da entrega.",
    REASSIGN:"O entregador foi liberado e uma nova busca de entregador foi iniciada.",
    REQUIRE_RETURN:"A operação determinou o retorno do pedido à loja.",
    COMPLETE_RETURN:"A loja/operação confirmou o recebimento do pedido retornado.",
  };
  if(incident.ticket_id){
    const bodyText=`${actionText[action as Exclude<Action,"STATUS">]}${note?` Observação: ${note}`:""}`;
    await ctx.supabaseAdmin.from("support_messages").insert({ticket_id:incident.ticket_id,sender_id:userId,body:bodyText});
    let ticketStatus="RESOLVED";
    if(action==="REQUIRE_RETURN"||(action==="COMPLETE_RETURN"&&refund&&!refund.ok))ticketStatus="IN_PROGRESS";
    if(action==="COMPLETE_RETURN"&&refund?.refundStatus&&!["COMPLETED","REFUNDED"].includes(String(refund.refundStatus)))ticketStatus="IN_PROGRESS";
    await ctx.supabaseAdmin.from("support_tickets").update({status:ticketStatus,updated_at:new Date().toISOString()}).eq("id",incident.ticket_id);
  }

  if(order.customer_id){
    const customerCopy:Record<Exclude<Action,"STATUS">,[string,string]>={
      RESUME:["Entrega retomada",`A entrega do pedido #${order.order_number} foi retomada.`],
      REASSIGN:["Buscando outro entregador",`Estamos buscando outro entregador para o pedido #${order.order_number}.`],
      REQUIRE_RETURN:["Pedido em retorno",`O pedido #${order.order_number} retornará à loja e a operação está acompanhando o caso.`],
      COMPLETE_RETURN:["Retorno confirmado",result?.refundRequired?`O retorno do pedido #${order.order_number} foi confirmado. O estorno está sendo processado.`:`O retorno do pedido #${order.order_number} foi confirmado.`],
    };
    const copy=customerCopy[action as Exclude<Action,"STATUS">];
    await ctx.supabaseAdmin.from("notifications").insert({user_id:order.customer_id,notification_type:"DELIVERY_INCIDENT_UPDATE",title:copy[0],body:copy[1],data:{orderId:order.id,deliveryId,incidentId:incident.id,action,refundStatus:refund?.refundStatus??null}});
  }

  await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:userId,action:`DELIVERY_INCIDENT_${action}`,entity_type:"delivery_incident",entity_id:incident.id,after_data:{deliveryId,orderId:order.id,note:note||null,result,dispatch,refund}});

  const{data:nextDelivery}=await ctx.supabaseAdmin.from("deliveries").select("id,order_id,driver_id,status,pickup_at,updated_at").eq("id",deliveryId).single();
  const{data:nextIncident}=await ctx.supabaseAdmin.from("delivery_incidents").select("id,delivery_id,order_id,driver_id,ticket_id,incident_type,previous_status,status,resolution,opened_at,resolved_at,updated_at").eq("id",incident.id).single();
  return Response.json({ok:true,result,dispatch,refund,delivery:nextDelivery,incident:nextIncident,capabilities:capabilities(nextDelivery,nextIncident)});
})};
