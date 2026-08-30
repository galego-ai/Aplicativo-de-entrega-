import { withSupabase } from "npm:@supabase/server@1.4.1";

type Method="PIX"|"BANK_TRANSFER"|"OTHER";
type AdminStatus="APPROVED"|"PROCESSING"|"PAID"|"FAILED"|"REJECTED";
type Body=
 | {action:"REQUEST";storeId:string;amount:number;method:Method;destinationValue:string}
 | {action:"CANCEL";payoutId:string}
 | {action:"DRIVER_SUMMARY"}
 | {action:"DRIVER_REQUEST";amount:number;method:Method;destinationValue:string}
 | {action:"DRIVER_CANCEL";payoutId:string}
 | {action:"ADMIN_STATUS";payoutId:string;status:AdminStatus;notes?:string;providerId?:string};

function errorCode(message?:string){for(const code of ["INVALID_AMOUNT","INVALID_METHOD","DESTINATION_REQUIRED","STORE_MANAGER_REQUIRED","DRIVER_REQUIRED","INSUFFICIENT_AVAILABLE_BALANCE","PAYOUT_NOT_FOUND","INVALID_RECIPIENT","INVALID_PAYOUT_TRANSITION"])if(message?.includes(code))return code;return "PAYOUT_OPERATION_FAILED";}

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
 let body:Body;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
 const userId=ctx.userClaims!.id;const platformRole=String(ctx.userClaims!.appMetadata?.clickfood_role??"");

 if(body.action==="DRIVER_SUMMARY"){
  const{data:driver}=await ctx.supabaseAdmin.from("drivers").select("id").eq("user_id",userId).maybeSingle();
  if(!driver)return Response.json({error:"DRIVER_REQUIRED"},{status:403});
  const[{data:available,error:balanceError},{data:payouts}]=await Promise.all([
   ctx.supabaseAdmin.schema("private").rpc("driver_available_balance",{p_driver_id:driver.id}),
   ctx.supabaseAdmin.from("payouts").select("id,amount,method,status,destination_value,requested_at,processed_at,review_notes,provider_id").eq("recipient_type","DRIVER").eq("driver_id",driver.id).order("requested_at",{ascending:false}).limit(30),
  ]);
  if(balanceError)return Response.json({error:"DRIVER_BALANCE_FAILED"},{status:500});
  const balance=Math.max(0,Math.round(Number(available??0)*100)/100);
  return Response.json({driverId:driver.id,availableBalance:balance,payouts:(payouts??[]).map((p:any)=>({...p,amount:Number(p.amount)}))});
 }

 if(body.action==="REQUEST"){
  const amount=Number(body.amount);if(!body.storeId||!Number.isFinite(amount)||amount<=0||!body.destinationValue?.trim())return Response.json({error:"INVALID_REQUEST"},{status:400});
  const{data,error}=await ctx.supabaseAdmin.schema("private").rpc("request_store_payout_atomic",{p_store_id:body.storeId,p_user_id:userId,p_amount:amount,p_method:body.method,p_destination_value:body.destinationValue});
  if(error)return Response.json({error:errorCode(error.message)},{status:error.message?.includes("INSUFFICIENT")?409:400});
  return Response.json({payoutId:data},{status:201});
 }

 if(body.action==="DRIVER_REQUEST"){
  const amount=Number(body.amount);if(!Number.isFinite(amount)||amount<=0||!body.destinationValue?.trim())return Response.json({error:"INVALID_REQUEST"},{status:400});
  const{data:driver}=await ctx.supabaseAdmin.from("drivers").select("id").eq("user_id",userId).maybeSingle();
  if(!driver)return Response.json({error:"DRIVER_REQUIRED"},{status:403});
  const{data,error}=await ctx.supabaseAdmin.schema("private").rpc("request_driver_payout_atomic",{p_driver_id:driver.id,p_user_id:userId,p_amount:amount,p_method:body.method,p_destination_value:body.destinationValue});
  if(error)return Response.json({error:errorCode(error.message)},{status:error.message?.includes("INSUFFICIENT")?409:400});
  return Response.json({payoutId:data},{status:201});
 }

 if(body.action==="CANCEL"){
  const{data:payout}=await ctx.supabaseAdmin.from("payouts").select("id,store_id,status").eq("id",body.payoutId).eq("recipient_type","STORE").maybeSingle();
  if(!payout?.store_id)return Response.json({error:"PAYOUT_NOT_FOUND"},{status:404});
  const{data:membership}=await ctx.supabaseAdmin.from("store_memberships").select("id").eq("store_id",payout.store_id).eq("user_id",userId).eq("active",true).in("role",["OWNER","MANAGER"]).maybeSingle();
  if(!membership)return Response.json({error:"STORE_MANAGER_REQUIRED"},{status:403});
  const{data,error}=await ctx.supabaseAdmin.schema("private").rpc("review_store_payout_atomic",{p_payout_id:body.payoutId,p_target_status:"CANCELLED",p_actor_id:userId,p_notes:"Cancelado pelo lojista",p_provider_id:null});
  if(error)return Response.json({error:errorCode(error.message)},{status:409});return Response.json({payout:data});
 }

 if(body.action==="DRIVER_CANCEL"){
  const{data:payout}=await ctx.supabaseAdmin.from("payouts").select("id,driver_id,status").eq("id",body.payoutId).eq("recipient_type","DRIVER").maybeSingle();
  if(!payout?.driver_id)return Response.json({error:"PAYOUT_NOT_FOUND"},{status:404});
  const{data:driver}=await ctx.supabaseAdmin.from("drivers").select("id").eq("id",payout.driver_id).eq("user_id",userId).maybeSingle();
  if(!driver)return Response.json({error:"DRIVER_REQUIRED"},{status:403});
  const{data,error}=await ctx.supabaseAdmin.schema("private").rpc("review_driver_payout_atomic",{p_payout_id:body.payoutId,p_target_status:"CANCELLED",p_actor_id:userId,p_notes:"Cancelado pelo entregador",p_provider_id:null});
  if(error)return Response.json({error:errorCode(error.message)},{status:409});return Response.json({payout:data});
 }

 if(body.action==="ADMIN_STATUS"){
  if(!["SUPER_ADMIN","ADMIN"].includes(platformRole))return Response.json({error:"ADMIN_REQUIRED"},{status:403});
  const{data:payout}=await ctx.supabaseAdmin.from("payouts").select("recipient_type").eq("id",body.payoutId).maybeSingle();
  if(!payout)return Response.json({error:"PAYOUT_NOT_FOUND"},{status:404});
  const rpc=payout.recipient_type==="DRIVER"?"review_driver_payout_atomic":"review_store_payout_atomic";
  const{data,error}=await ctx.supabaseAdmin.schema("private").rpc(rpc,{p_payout_id:body.payoutId,p_target_status:body.status,p_actor_id:userId,p_notes:body.notes??null,p_provider_id:body.providerId??null});
  if(error)return Response.json({error:errorCode(error.message)},{status:409});return Response.json({payout:data});
 }
 return Response.json({error:"UNKNOWN_ACTION"},{status:400});
})};