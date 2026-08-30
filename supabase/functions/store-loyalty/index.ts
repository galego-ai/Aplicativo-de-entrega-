import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body={storeId:string;action?:"GET"|"SET_PROGRAM"|"SAVE_REWARD"|"DEACTIVATE_REWARD";pointsPerCurrency?:number;active?:boolean;reward?:{id?:string;name?:string;pointsCost?:number;rewardType?:"DISCOUNT_FIXED"|"DISCOUNT_PERCENTAGE"|"PRODUCT"|"FREE_DELIVERY";rewardValue?:number|null;productId?:string|null}};
const writeActions=new Set(["SET_PROGRAM","SAVE_REWARD","DEACTIVATE_REWARD"]);

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
 let body:Body;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
 const storeId=String(body.storeId??"");const action=body.action??"GET";if(!storeId)return Response.json({error:"STORE_REQUIRED"},{status:400});
 const userId=ctx.userClaims!.id;const platformRole=String(ctx.userClaims!.appMetadata?.clickfood_role??"");const isAdmin=["SUPER_ADMIN","ADMIN"].includes(platformRole);
 let membershipRole="";
 if(!isAdmin){const{data:membership,error}=await ctx.supabaseAdmin.from("store_memberships").select("role").eq("store_id",storeId).eq("user_id",userId).eq("active",true).maybeSingle();if(error)return Response.json({error:"MEMBERSHIP_LOOKUP_FAILED"},{status:500});if(!membership)return Response.json({error:"STORE_ACCESS_DENIED"},{status:403});membershipRole=String(membership.role);if(writeActions.has(action)&&!["OWNER","MANAGER"].includes(membershipRole))return Response.json({error:"STORE_WRITE_DENIED"},{status:403});}

 if(action==="GET"){
  const{data:program,error:programError}=await ctx.supabaseAdmin.from("loyalty_programs").select("id,store_id,points_per_currency,active,created_at,updated_at").eq("store_id",storeId).maybeSingle();if(programError)return Response.json({error:"LOYALTY_LOOKUP_FAILED"},{status:500});
  let rewards:any[]=[];if(program?.id){const r=await ctx.supabaseAdmin.from("loyalty_rewards").select("id,name,points_cost,reward_type,reward_value,product_id,active").eq("program_id",program.id).order("points_cost");if(r.error)return Response.json({error:"REWARD_LOOKUP_FAILED"},{status:500});rewards=r.data??[];}
  const{data:wallets}=await ctx.supabaseAdmin.from("customer_loyalty_wallets").select("balance").eq("store_id",storeId);const outstanding=(wallets??[]).reduce((s:any,w:any)=>s+Number(w.balance||0),0);
  const{data:earnRows}=await ctx.supabaseAdmin.from("loyalty_transactions").select("points,customer_loyalty_wallets!inner(store_id)").eq("transaction_type","EARN").eq("customer_loyalty_wallets.store_id",storeId);const issued=(earnRows??[]).reduce((s:any,r:any)=>s+Math.max(0,Number(r.points||0)),0);
  return Response.json({program,rewards,metrics:{customers:(wallets??[]).length,outstandingPoints:outstanding,issuedPoints:issued}});
 }

 if(action==="SET_PROGRAM"){
  const rate=Number(body.pointsPerCurrency);if(!Number.isFinite(rate)||rate<0||rate>1000)return Response.json({error:"INVALID_POINTS_RATE"},{status:400});
  const{data:program,error}=await ctx.supabaseAdmin.from("loyalty_programs").upsert({store_id:storeId,points_per_currency:Math.round(rate*10000)/10000,active:body.active!==false,updated_at:new Date().toISOString()},{onConflict:"store_id"}).select("id,store_id,points_per_currency,active,created_at,updated_at").single();if(error)return Response.json({error:"LOYALTY_SAVE_FAILED"},{status:500});
  await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:userId,action:"LOYALTY_PROGRAM_UPDATED",entity_type:"store",entity_id:storeId,after_data:{pointsPerCurrency:rate,active:body.active!==false}});return Response.json({program});
 }

 if(action==="SAVE_REWARD"){
  const reward=body.reward??{};const name=String(reward.name??"").trim();const pointsCost=Number(reward.pointsCost);const rewardType=String(reward.rewardType??"");if(!name||name.length>120||!Number.isInteger(pointsCost)||pointsCost<1||pointsCost>10000000||!["DISCOUNT_FIXED","DISCOUNT_PERCENTAGE","PRODUCT","FREE_DELIVERY"].includes(rewardType))return Response.json({error:"INVALID_REWARD"},{status:400});
  const{data:program}=await ctx.supabaseAdmin.from("loyalty_programs").select("id").eq("store_id",storeId).maybeSingle();if(!program)return Response.json({error:"LOYALTY_PROGRAM_REQUIRED"},{status:409});
  let rewardValue: number|null=null;let productId:string|null=null;
  if(rewardType==="DISCOUNT_FIXED"){rewardValue=Number(reward.rewardValue);if(!Number.isFinite(rewardValue)||rewardValue<=0||rewardValue>100000)return Response.json({error:"INVALID_REWARD_VALUE"},{status:400});}
  if(rewardType==="DISCOUNT_PERCENTAGE"){rewardValue=Number(reward.rewardValue);if(!Number.isFinite(rewardValue)||rewardValue<=0||rewardValue>100)return Response.json({error:"INVALID_REWARD_VALUE"},{status:400});}
  if(rewardType==="PRODUCT"){productId=String(reward.productId??"");if(!productId)return Response.json({error:"PRODUCT_REQUIRED"},{status:400});const{data:product}=await ctx.supabaseAdmin.from("products").select("id").eq("id",productId).eq("store_id",storeId).maybeSingle();if(!product)return Response.json({error:"PRODUCT_NOT_FOUND"},{status:404});}
  const row={program_id:program.id,name,points_cost:pointsCost,reward_type:rewardType,reward_value:rewardValue,product_id:productId,active:true};let result:any;
  if(reward.id){result=await ctx.supabaseAdmin.from("loyalty_rewards").update(row).eq("id",reward.id).eq("program_id",program.id).select("id,name,points_cost,reward_type,reward_value,product_id,active").single();}else{result=await ctx.supabaseAdmin.from("loyalty_rewards").insert(row).select("id,name,points_cost,reward_type,reward_value,product_id,active").single();}
  if(result.error)return Response.json({error:"REWARD_SAVE_FAILED"},{status:500});await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:userId,action:"LOYALTY_REWARD_SAVED",entity_type:"loyalty_reward",entity_id:result.data.id,after_data:{storeId,rewardType,pointsCost}});return Response.json({reward:result.data});
 }

 if(action==="DEACTIVATE_REWARD"){
  const rewardId=String(body.reward?.id??"");if(!rewardId)return Response.json({error:"REWARD_REQUIRED"},{status:400});const{data:program}=await ctx.supabaseAdmin.from("loyalty_programs").select("id").eq("store_id",storeId).maybeSingle();if(!program)return Response.json({error:"LOYALTY_PROGRAM_REQUIRED"},{status:409});const{data:reward,error}=await ctx.supabaseAdmin.from("loyalty_rewards").update({active:false}).eq("id",rewardId).eq("program_id",program.id).select("id,active").maybeSingle();if(error||!reward)return Response.json({error:"REWARD_NOT_FOUND"},{status:404});await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:userId,action:"LOYALTY_REWARD_DEACTIVATED",entity_type:"loyalty_reward",entity_id:rewardId,after_data:{storeId}});return Response.json({reward});
 }
 return Response.json({error:"INVALID_ACTION"},{status:400});
})};
