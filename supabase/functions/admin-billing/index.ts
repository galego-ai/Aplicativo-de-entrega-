import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body=
 | {action:"UPDATE_POLICY";graceDays:number;suspendAfterDays:number;autoSuspend:boolean}
 | {action:"SYNC_OVERDUE"}
 | {action:"CREATE_INVOICE";storeId:string;subscriptionId?:string|null;amount:number;dueDate:string;referenceMonth:string}
 | {action:"SET_INVOICE_STATUS";invoiceId:string;status:"PAID"|"WAIVED"|"CANCELLED"|"OPEN"}
 | {action:"SET_SUBSCRIPTION_STATUS";subscriptionId:string;status:"TRIAL"|"ACTIVE"|"PAST_DUE"|"SUSPENDED"|"CANCELLED"};

const dateOnly=(d:Date)=>d.toISOString().slice(0,10);
const daysAgo=(n:number)=>{const d=new Date();d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-n);return dateOnly(d)};

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
 const role=String(ctx.userClaims!.appMetadata?.clickfood_role??"");if(!["SUPER_ADMIN","ADMIN"].includes(role))return Response.json({error:"ADMIN_REQUIRED"},{status:403});
 let body:Body;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})};const actor=ctx.userClaims!.id;
 const audit=async(action:string,entity_type:string,entity_id:string|null,after_data:Record<string,unknown>)=>{await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:actor,action,entity_type,entity_id,after_data})};
 const restoreIfClear=async(storeId:string)=>{
  const{data:policy}=await ctx.supabaseAdmin.from("billing_policy").select("grace_days").eq("id",1).single();const cutoff=daysAgo(Number(policy?.grace_days??3));
  const{data:remaining}=await ctx.supabaseAdmin.from("invoices").select("id").eq("store_id",storeId).in("status",["OPEN","PAST_DUE"]).lt("due_date",cutoff).limit(1);
  if(remaining?.length)return;
  await ctx.supabaseAdmin.from("subscriptions").update({status:"ACTIVE",updated_at:new Date().toISOString()}).eq("store_id",storeId).in("status",["PAST_DUE","SUSPENDED"]);
  const{data:lock}=await ctx.supabaseAdmin.from("store_billing_locks").select("previous_store_status").eq("store_id",storeId).maybeSingle();
  if(lock){const{data:store}=await ctx.supabaseAdmin.from("stores").select("status").eq("id",storeId).single();if(store?.status==="SUSPENDED")await ctx.supabaseAdmin.from("stores").update({status:lock.previous_store_status,updated_at:new Date().toISOString()}).eq("id",storeId);await ctx.supabaseAdmin.from("store_billing_locks").delete().eq("store_id",storeId);}
 };
 if(body.action==="UPDATE_POLICY"){
  const grace=Number(body.graceDays),suspend=Number(body.suspendAfterDays);if(!Number.isInteger(grace)||!Number.isInteger(suspend)||grace<0||grace>90||suspend<1||suspend>180||suspend<grace)return Response.json({error:"INVALID_POLICY"},{status:400});
  const{data,error}=await ctx.supabaseAdmin.from("billing_policy").update({grace_days:grace,suspend_after_days:suspend,auto_suspend:Boolean(body.autoSuspend),updated_by:actor,updated_at:new Date().toISOString()}).eq("id",1).select("*").single();if(error)return Response.json({error:"POLICY_UPDATE_FAILED"},{status:500});await audit("BILLING_POLICY_UPDATED","billing_policy",null,{grace_days:grace,suspend_after_days:suspend,auto_suspend:Boolean(body.autoSuspend)});return Response.json({policy:data});
 }
 if(body.action==="SYNC_OVERDUE"){
  const{data:policy,error:pError}=await ctx.supabaseAdmin.from("billing_policy").select("grace_days,suspend_after_days,auto_suspend").eq("id",1).single();if(pError)return Response.json({error:"POLICY_LOOKUP_FAILED"},{status:500});
  const graceCutoff=daysAgo(Number(policy.grace_days)),suspendCutoff=daysAgo(Number(policy.suspend_after_days));
  const{data:pastDue,error:iError}=await ctx.supabaseAdmin.from("invoices").update({status:"PAST_DUE"}).eq("status","OPEN").lt("due_date",graceCutoff).select("id,store_id,due_date");if(iError)return Response.json({error:"INVOICE_SYNC_FAILED"},{status:500});
  const stores=[...new Set((pastDue??[]).map(x=>x.store_id))];for(const storeId of stores)await ctx.supabaseAdmin.from("subscriptions").update({status:"PAST_DUE",updated_at:new Date().toISOString()}).eq("store_id",storeId).in("status",["ACTIVE","TRIAL"]);
  let suspended=0;
  if(policy.auto_suspend){const{data:severe}=await ctx.supabaseAdmin.from("invoices").select("id,store_id,due_date").eq("status","PAST_DUE").lt("due_date",suspendCutoff);const grouped=new Map<string,string>();for(const row of severe??[])if(!grouped.has(row.store_id))grouped.set(row.store_id,row.id);for(const[storeId,invoiceId]of grouped){const{data:store}=await ctx.supabaseAdmin.from("stores").select("status").eq("id",storeId).single();if(store&&store.status==="ACTIVE"){await ctx.supabaseAdmin.from("store_billing_locks").upsert({store_id:storeId,invoice_id:invoiceId,previous_store_status:store.status,locked_at:new Date().toISOString()},{onConflict:"store_id"});await ctx.supabaseAdmin.from("stores").update({status:"SUSPENDED",updated_at:new Date().toISOString()}).eq("id",storeId);await ctx.supabaseAdmin.from("subscriptions").update({status:"SUSPENDED",updated_at:new Date().toISOString()}).eq("store_id",storeId);suspended++;}}
  }
  await audit("BILLING_OVERDUE_SYNC","billing_policy",null,{marked_past_due:pastDue?.length??0,suspended});return Response.json({markedPastDue:pastDue?.length??0,suspended});
 }
 if(body.action==="CREATE_INVOICE"){
  const amount=Number(body.amount);if(!body.storeId||!Number.isFinite(amount)||amount<0||!/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)||!/^\d{4}-\d{2}-\d{2}$/.test(body.referenceMonth))return Response.json({error:"INVALID_INVOICE"},{status:400});
  const{data,error}=await ctx.supabaseAdmin.from("invoices").insert({store_id:body.storeId,subscription_id:body.subscriptionId||null,reference_month:body.referenceMonth,amount,due_date:body.dueDate,status:"OPEN"}).select("*").single();if(error)return Response.json({error:"INVOICE_CREATE_FAILED",detail:error.message},{status:500});await audit("INVOICE_CREATED","invoice",data.id,{store_id:body.storeId,amount,due_date:body.dueDate});return Response.json({invoice:data},{status:201});
 }
 if(body.action==="SET_INVOICE_STATUS"){
  const allowed=new Set(["PAID","WAIVED","CANCELLED","OPEN"]);if(!allowed.has(body.status))return Response.json({error:"INVALID_STATUS"},{status:400});const{data:before}=await ctx.supabaseAdmin.from("invoices").select("id,store_id,status").eq("id",body.invoiceId).maybeSingle();if(!before)return Response.json({error:"INVOICE_NOT_FOUND"},{status:404});const patch:any={status:body.status,paid_at:body.status==="PAID"?new Date().toISOString():null};const{data,error}=await ctx.supabaseAdmin.from("invoices").update(patch).eq("id",body.invoiceId).select("*").single();if(error)return Response.json({error:"INVOICE_UPDATE_FAILED"},{status:500});if(["PAID","WAIVED","CANCELLED"].includes(body.status))await restoreIfClear(before.store_id);await audit("INVOICE_STATUS_CHANGED","invoice",body.invoiceId,{from:before.status,to:body.status});return Response.json({invoice:data});
 }
 if(body.action==="SET_SUBSCRIPTION_STATUS"){
  const{data:before}=await ctx.supabaseAdmin.from("subscriptions").select("id,store_id,status").eq("id",body.subscriptionId).maybeSingle();if(!before)return Response.json({error:"SUBSCRIPTION_NOT_FOUND"},{status:404});const patch:any={status:body.status,updated_at:new Date().toISOString()};if(body.status==="CANCELLED")patch.cancelled_at=new Date().toISOString();const{data,error}=await ctx.supabaseAdmin.from("subscriptions").update(patch).eq("id",body.subscriptionId).select("*").single();if(error)return Response.json({error:"SUBSCRIPTION_UPDATE_FAILED"},{status:500});await audit("SUBSCRIPTION_STATUS_CHANGED","subscription",body.subscriptionId,{from:before.status,to:body.status,store_id:before.store_id});return Response.json({subscription:data});
 }
 return Response.json({error:"UNKNOWN_ACTION"},{status:400});
})};