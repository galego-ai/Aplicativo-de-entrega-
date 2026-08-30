import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body=
 | {action:"CREATE";storeId?:string|null;orderId?:string|null;category:string;priority?:"LOW"|"NORMAL"|"HIGH"|"CRITICAL";subject:string;message:string}
 | {action:"REPLY";ticketId:string;message:string}
 | {action:"SET_STATUS";ticketId:string;status:"OPEN"|"IN_PROGRESS"|"WAITING_USER"|"RESOLVED"|"CLOSED"};

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
 let body:Body;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
 const userId=ctx.userClaims!.id;const platformRole=String(ctx.userClaims!.appMetadata?.clickfood_role??"");const isAdmin=["SUPER_ADMIN","ADMIN","SUPPORT"].includes(platformRole);

 if(body.action==="CREATE"){
  if(!body.category?.trim()||!body.subject?.trim()||!body.message?.trim())return Response.json({error:"FIELDS_REQUIRED"},{status:400});
  let storeId=body.storeId??null;let orderId=body.orderId??null;
  if(orderId){
   const{data:order,error:orderError}=await ctx.supabaseAdmin.from("orders").select("id,customer_id,store_id").eq("id",orderId).maybeSingle();
   if(orderError)return Response.json({error:"ORDER_LOOKUP_FAILED"},{status:500});
   if(!order)return Response.json({error:"ORDER_NOT_FOUND"},{status:404});
   let allowed=isAdmin||order.customer_id===userId;
   if(!allowed){const{data:m}=await ctx.supabaseAdmin.from("store_memberships").select("id").eq("store_id",order.store_id).eq("user_id",userId).eq("active",true).maybeSingle();allowed=!!m;}
   if(!allowed)return Response.json({error:"ORDER_ACCESS_DENIED"},{status:403});
   if(storeId&&storeId!==order.store_id)return Response.json({error:"STORE_ORDER_MISMATCH"},{status:400});
   storeId=order.store_id;
  }else if(storeId&&!isAdmin){
   const{data:m}=await ctx.supabaseAdmin.from("store_memberships").select("id").eq("store_id",storeId).eq("user_id",userId).eq("active",true).maybeSingle();
   if(!m)return Response.json({error:"STORE_ACCESS_DENIED"},{status:403});
  }
  const{data:ticket,error}=await ctx.supabaseAdmin.from("support_tickets").insert({opened_by:userId,store_id:storeId,order_id:orderId,category:body.category.trim().slice(0,80),priority:body.priority??"NORMAL",subject:body.subject.trim().slice(0,200),status:"OPEN"}).select("id,store_id,order_id,category,priority,status,subject,created_at").single();
  if(error)return Response.json({error:"TICKET_CREATE_FAILED"},{status:500});
  const{error:msgError}=await ctx.supabaseAdmin.from("support_messages").insert({ticket_id:ticket.id,sender_id:userId,body:body.message.trim().slice(0,4000)});
  if(msgError)return Response.json({error:"MESSAGE_CREATE_FAILED"},{status:500});
  return Response.json({ticket},{status:201});
 }

 if(body.action==="REPLY"){
  if(!body.ticketId||!body.message?.trim())return Response.json({error:"FIELDS_REQUIRED"},{status:400});
  const{data:t}=await ctx.supabaseAdmin.from("support_tickets").select("id,opened_by,store_id,status").eq("id",body.ticketId).maybeSingle();if(!t)return Response.json({error:"TICKET_NOT_FOUND"},{status:404});
  let allowed=isAdmin||t.opened_by===userId;if(!allowed&&t.store_id){const{data:m}=await ctx.supabaseAdmin.from("store_memberships").select("id").eq("store_id",t.store_id).eq("user_id",userId).eq("active",true).maybeSingle();allowed=!!m;}if(!allowed)return Response.json({error:"ACCESS_DENIED"},{status:403});
  const{data,error}=await ctx.supabaseAdmin.from("support_messages").insert({ticket_id:body.ticketId,sender_id:userId,body:body.message.trim().slice(0,4000)}).select("id,body,created_at").single();if(error)return Response.json({error:"MESSAGE_CREATE_FAILED"},{status:500});
  await ctx.supabaseAdmin.from("support_tickets").update({updated_at:new Date().toISOString(),status:isAdmin?"WAITING_USER":"OPEN"}).eq("id",body.ticketId);
  return Response.json({message:data});
 }

 if(body.action==="SET_STATUS"){
  if(!isAdmin)return Response.json({error:"ADMIN_REQUIRED"},{status:403});
  const{data,error}=await ctx.supabaseAdmin.from("support_tickets").update({status:body.status,updated_at:new Date().toISOString()}).eq("id",body.ticketId).select("id,status,updated_at").single();if(error)return Response.json({error:"STATUS_UPDATE_FAILED"},{status:500});
  return Response.json({ticket:data});
 }
 return Response.json({error:"UNKNOWN_ACTION"},{status:400});
})};
