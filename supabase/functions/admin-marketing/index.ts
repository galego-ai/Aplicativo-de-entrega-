import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body=
 | {action:"CREATE_CAMPAIGN";name:string;description?:string;campaignType?:string;storeId?:string|null;startsAt?:string|null;endsAt?:string|null;config?:Record<string,unknown>}
 | {action:"TOGGLE_CAMPAIGN";campaignId:string;active:boolean}
 | {action:"CREATE_COUPON";code:string;discountType:"PERCENTAGE"|"FIXED"|"FREE_DELIVERY";discountValue:number;minimumOrder?:number;maxUses?:number|null;maxUsesPerCustomer?:number|null;startsAt?:string|null;endsAt?:string|null;storeId?:string|null;firstOrderOnly?:boolean}
 | {action:"TOGGLE_COUPON";couponId:string;active:boolean};

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
 const role=String(ctx.userClaims!.appMetadata?.clickfood_role??"");
 if(!["SUPER_ADMIN","ADMIN"].includes(role))return Response.json({error:"ADMIN_REQUIRED"},{status:403});
 let body:Body;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
 const actor=ctx.userClaims!.id;
 if(body.action==="CREATE_CAMPAIGN"){
  if(!body.name?.trim())return Response.json({error:"NAME_REQUIRED"},{status:400});
  if(body.startsAt&&body.endsAt&&new Date(body.endsAt)<=new Date(body.startsAt))return Response.json({error:"INVALID_PERIOD"},{status:400});
  const{data,error}=await ctx.supabaseAdmin.from("campaigns").insert({store_id:body.storeId||null,name:body.name.trim(),description:body.description?.trim()||null,campaign_type:body.campaignType||"PROMOTION",starts_at:body.startsAt||null,ends_at:body.endsAt||null,active:true,config:body.config??{},created_by:actor}).select("*").single();
  if(error)return Response.json({error:"CAMPAIGN_CREATE_FAILED",detail:error.message},{status:500});
  await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:actor,action:"CAMPAIGN_CREATED",entity_type:"campaign",entity_id:data.id,after_data:{name:data.name,store_id:data.store_id}});
  return Response.json({campaign:data},{status:201});
 }
 if(body.action==="TOGGLE_CAMPAIGN"){
  const{data,error}=await ctx.supabaseAdmin.from("campaigns").update({active:body.active,updated_at:new Date().toISOString()}).eq("id",body.campaignId).select("id,active").single();
  if(error)return Response.json({error:"CAMPAIGN_UPDATE_FAILED"},{status:500});
  await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:actor,action:"CAMPAIGN_STATUS_CHANGED",entity_type:"campaign",entity_id:body.campaignId,after_data:{active:body.active}});
  return Response.json({campaign:data});
 }
 if(body.action==="CREATE_COUPON"){
  const code=body.code?.trim().toUpperCase();const value=Number(body.discountValue??0),minimum=Number(body.minimumOrder??0);
  if(!code||!body.discountType||!Number.isFinite(value)||value<0||!Number.isFinite(minimum)||minimum<0)return Response.json({error:"INVALID_COUPON"},{status:400});
  if(body.discountType==="PERCENTAGE"&&value>100)return Response.json({error:"INVALID_PERCENTAGE"},{status:400});
  if(body.startsAt&&body.endsAt&&new Date(body.endsAt)<=new Date(body.startsAt))return Response.json({error:"INVALID_PERIOD"},{status:400});
  const{data:existing}=await ctx.supabaseAdmin.from("coupons").select("id").ilike("code",code).maybeSingle();if(existing)return Response.json({error:"COUPON_EXISTS"},{status:409});
  const{data,error}=await ctx.supabaseAdmin.from("coupons").insert({store_id:body.storeId||null,code,discount_type:body.discountType,discount_value:value,minimum_order:minimum,max_uses:body.maxUses??null,max_uses_per_customer:body.maxUsesPerCustomer??null,starts_at:body.startsAt||null,ends_at:body.endsAt||null,active:true}).select("*").single();
  if(error)return Response.json({error:"COUPON_CREATE_FAILED",detail:error.message},{status:500});
  if(body.firstOrderOnly){const{error:ruleError}=await ctx.supabaseAdmin.from("coupon_rules").insert({coupon_id:data.id,rule_type:"FIRST_ORDER",rule_value:{enabled:true}});if(ruleError){await ctx.supabaseAdmin.from("coupons").delete().eq("id",data.id);return Response.json({error:"COUPON_RULE_FAILED"},{status:500});}}
  await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:actor,action:"GLOBAL_COUPON_CREATED",entity_type:"coupon",entity_id:data.id,after_data:{code:data.code,store_id:data.store_id}});
  return Response.json({coupon:data},{status:201});
 }
 if(body.action==="TOGGLE_COUPON"){
  const{data,error}=await ctx.supabaseAdmin.from("coupons").update({active:body.active}).eq("id",body.couponId).select("id,active").single();
  if(error)return Response.json({error:"COUPON_UPDATE_FAILED"},{status:500});
  await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:actor,action:"COUPON_STATUS_CHANGED",entity_type:"coupon",entity_id:body.couponId,after_data:{active:body.active}});
  return Response.json({coupon:data});
 }
 return Response.json({error:"UNKNOWN_ACTION"},{status:400});
})};
