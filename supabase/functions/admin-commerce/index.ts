import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body =
 | {action:"CREATE_PLAN";name:string;description?:string;setupFee:number;monthlyFee:number;commissionPercentage:number;includedOrders?:number|null;extraOrderFee:number}
 | {action:"TOGGLE_PLAN";planId:string;active:boolean}
 | {action:"ASSIGN_PLAN";storeId:string;planId:string;status?:"TRIAL"|"ACTIVE"|"PAST_DUE"|"SUSPENDED"}
 | {action:"CREATE_BONUS_RULE";name:string;metric:"COMPLETED_ORDERS"|"GMV"|"NEW_CUSTOMERS"|"RATING"|"CUSTOM";target:number;period:"DAILY"|"WEEKLY"|"MONTHLY"|"CAMPAIGN";pointsAwarded:number}
 | {action:"CREATE_BONUS_REWARD";name:string;description?:string;pointsCost:number;rewardType:"CREDIT"|"FREE_MONTH"|"APP_HIGHLIGHT"|"CAMPAIGN"|"CUSTOM";rewardValue?:number|null;requiresApproval?:boolean}
 | {action:"REVIEW_BONUS_REDEMPTION";redemptionId:string;status:"APPROVED"|"REJECTED"|"FULFILLED"}
 | {action:"UPDATE_CITY_DELIVERY";cityId:string;driverBaseEarning:number;driverPerKm:number;driverMinimumEarning:number;offerTimeoutSeconds:number;initialRadiusKm:number;maxRadiusKm:number;batchSize:number}
 | {action:"INVOICE_STATUS";invoiceId:string;status:"PAID"|"CANCELLED"|"WAIVED"|"OPEN"|"PAST_DUE"};

export default { fetch: withSupabase({auth:"user"}, async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
 const role=String(ctx.userClaims!.appMetadata?.clickfood_role??""); if(!["SUPER_ADMIN","ADMIN"].includes(role))return Response.json({error:"ADMIN_REQUIRED"},{status:403});
 let body:Body;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}; const actor=ctx.userClaims!.id;
 if(body.action==="CREATE_PLAN"){
  const name=body.name?.trim();const setup=Number(body.setupFee),monthly=Number(body.monthlyFee),commission=Number(body.commissionPercentage),extra=Number(body.extraOrderFee),included=body.includedOrders==null?null:Number(body.includedOrders);
  if(!name||![setup,monthly,commission,extra].every(Number.isFinite)||setup<0||monthly<0||commission<0||commission>100||extra<0||(included!=null&&(!Number.isInteger(included)||included<0)))return Response.json({error:"INVALID_PLAN"},{status:400});
  const {data,error}=await ctx.supabaseAdmin.from("plans").insert({name,description:body.description?.trim()||null,setup_fee:setup,monthly_fee:monthly,commission_percentage:commission,included_orders:included,extra_order_fee:extra,active:true}).select("*").single();if(error)return Response.json({error:error.code==="23505"?"PLAN_EXISTS":"PLAN_CREATE_FAILED"},{status:error.code==="23505"?409:500});await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:actor,action:"PLAN_CREATED",entity_type:"plan",entity_id:data.id,after_data:data});return Response.json({plan:data},{status:201});
 }
 if(body.action==="TOGGLE_PLAN"){
  const {data,error}=await ctx.supabaseAdmin.from("plans").update({active:body.active,updated_at:new Date().toISOString()}).eq("id",body.planId).select("*").single();if(error)return Response.json({error:"PLAN_UPDATE_FAILED"},{status:500});return Response.json({plan:data});
 }
 if(body.action==="ASSIGN_PLAN"){
  const status=body.status??"ACTIVE";const {data,error}=await ctx.supabaseAdmin.from("subscriptions").upsert({store_id:body.storeId,plan_id:body.planId,status,started_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:"store_id"}).select("*").single();if(error)return Response.json({error:"SUBSCRIPTION_UPDATE_FAILED"},{status:500});await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:actor,action:"STORE_PLAN_CHANGED",entity_type:"store",entity_id:body.storeId,after_data:{plan_id:body.planId,status}});return Response.json({subscription:data});
 }
 if(body.action==="CREATE_BONUS_RULE"){
  const target=Number(body.target),points=Number(body.pointsAwarded);if(!body.name?.trim()||!Number.isFinite(target)||target<0||!Number.isInteger(points)||points<=0)return Response.json({error:"INVALID_BONUS_RULE"},{status:400});const {data,error}=await ctx.supabaseAdmin.from("bonus_rules").insert({name:body.name.trim(),metric:body.metric,target,period:body.period,points_awarded:points,active:true}).select("*").single();if(error)return Response.json({error:"BONUS_RULE_CREATE_FAILED"},{status:500});return Response.json({rule:data},{status:201});
 }
 if(body.action==="CREATE_BONUS_REWARD"){
  const points=Number(body.pointsCost),value=body.rewardValue==null?null:Number(body.rewardValue);if(!body.name?.trim()||!Number.isInteger(points)||points<=0)return Response.json({error:"INVALID_BONUS_REWARD"},{status:400});const {data,error}=await ctx.supabaseAdmin.from("bonus_rewards").insert({name:body.name.trim(),description:body.description?.trim()||null,points_cost:points,reward_type:body.rewardType,reward_value:value,requires_approval:body.requiresApproval??true,active:true}).select("*").single();if(error)return Response.json({error:"BONUS_REWARD_CREATE_FAILED"},{status:500});return Response.json({reward:data},{status:201});
 }
 if(body.action==="REVIEW_BONUS_REDEMPTION"){
  const {data,error}=await ctx.supabaseAdmin.from("bonus_redemptions").update({status:body.status,reviewed_by:actor,reviewed_at:new Date().toISOString()}).eq("id",body.redemptionId).select("*").single();if(error)return Response.json({error:"REDEMPTION_UPDATE_FAILED"},{status:500});return Response.json({redemption:data});
 }
 if(body.action==="UPDATE_CITY_DELIVERY"){
  const values=[body.driverBaseEarning,body.driverPerKm,body.driverMinimumEarning,body.offerTimeoutSeconds,body.initialRadiusKm,body.maxRadiusKm,body.batchSize].map(Number);if(values.some(v=>!Number.isFinite(v)||v<0)||body.offerTimeoutSeconds<5||body.batchSize<1)return Response.json({error:"INVALID_CITY_SETTINGS"},{status:400});
  const pricing=await ctx.supabaseAdmin.from("city_delivery_pricing").upsert({city_id:body.cityId,driver_base_earning:Number(body.driverBaseEarning),driver_per_km:Number(body.driverPerKm),driver_minimum_earning:Number(body.driverMinimumEarning),updated_at:new Date().toISOString()},{onConflict:"city_id"});
  const dispatch=await ctx.supabaseAdmin.from("delivery_dispatch_settings").upsert({city_id:body.cityId,offer_timeout_seconds:Number(body.offerTimeoutSeconds),initial_radius_km:Number(body.initialRadiusKm),max_radius_km:Number(body.maxRadiusKm),batch_size:Number(body.batchSize),updated_at:new Date().toISOString()},{onConflict:"city_id"});if(pricing.error||dispatch.error)return Response.json({error:"CITY_SETTINGS_UPDATE_FAILED"},{status:500});return Response.json({ok:true});
 }
 if(body.action==="INVOICE_STATUS"){
  const patch:any={status:body.status};if(body.status==="PAID")patch.paid_at=new Date().toISOString();const {data,error}=await ctx.supabaseAdmin.from("invoices").update(patch).eq("id",body.invoiceId).select("*").single();if(error)return Response.json({error:"INVOICE_UPDATE_FAILED"},{status:500});return Response.json({invoice:data});
 }
 return Response.json({error:"UNKNOWN_ACTION"},{status:400});
})};