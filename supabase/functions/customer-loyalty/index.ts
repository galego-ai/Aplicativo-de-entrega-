import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body={action?:"SUMMARY"|"REDEEM";rewardId?:string};

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
 let body:Body={};try{body=await req.json()}catch{}
 const action=body.action??"SUMMARY";const userId=ctx.userClaims!.id;

 if(action==="REDEEM"){
  const rewardId=String(body.rewardId??"");if(!rewardId)return Response.json({error:"REWARD_REQUIRED"},{status:400});
  const{data,error}=await ctx.supabaseAdmin.rpc("redeem_customer_loyalty_reward_atomic",{p_customer_id:userId,p_reward_id:rewardId});
  if(error){const msg=String(error.message??"");const code=msg.includes("INSUFFICIENT_LOYALTY_POINTS")?"INSUFFICIENT_LOYALTY_POINTS":msg.includes("NOT_AVAILABLE")?"LOYALTY_REWARD_NOT_AVAILABLE":msg.includes("NOT_ACTIVE")?"LOYALTY_PROGRAM_NOT_ACTIVE":msg.includes("TYPE_NOT_REDEEMABLE")?"LOYALTY_REWARD_TYPE_NOT_REDEEMABLE":"LOYALTY_REDEEM_FAILED";return Response.json({error:code},{status:code==="INSUFFICIENT_LOYALTY_POINTS"?409:code==="LOYALTY_REDEEM_FAILED"?500:409});}
  return Response.json({redemption:data},{status:201});
 }
 if(action!=="SUMMARY")return Response.json({error:"INVALID_ACTION"},{status:400});

 const{data:wallets,error}=await ctx.supabaseAdmin.from("customer_loyalty_wallets").select("id,store_id,balance,updated_at,stores(name,logo_url)").eq("customer_id",userId).order("updated_at",{ascending:false});if(error)return Response.json({error:"LOYALTY_LOOKUP_FAILED"},{status:500});
 const storeIds=[...new Set((wallets??[]).map((w:any)=>String(w.store_id)))];const walletIds=(wallets??[]).map((w:any)=>String(w.id));
 let programs:any[]=[];let rewards:any[]=[];let transactions:any[]=[];let redemptions:any[]=[];let coupons:any[]=[];
 if(storeIds.length){const p=await ctx.supabaseAdmin.from("loyalty_programs").select("id,store_id,points_per_currency,active").in("store_id",storeIds).eq("active",true);if(p.error)return Response.json({error:"LOYALTY_PROGRAM_LOOKUP_FAILED"},{status:500});programs=p.data??[];const programIds=programs.map((x:any)=>String(x.id));if(programIds.length){const r=await ctx.supabaseAdmin.from("loyalty_rewards").select("id,program_id,name,points_cost,reward_type,reward_value,product_id,active").in("program_id",programIds).eq("active",true).order("points_cost");if(r.error)return Response.json({error:"REWARD_LOOKUP_FAILED"},{status:500});rewards=r.data??[];}}
 if(walletIds.length){const[t,r]=await Promise.all([ctx.supabaseAdmin.from("loyalty_transactions").select("id,wallet_id,transaction_type,points,order_id,reward_id,created_at").in("wallet_id",walletIds).order("created_at",{ascending:false}).limit(100),ctx.supabaseAdmin.from("customer_loyalty_redemptions").select("id,wallet_id,reward_id,coupon_id,points_spent,status,expires_at,used_at,created_at").in("wallet_id",walletIds).order("created_at",{ascending:false}).limit(100)]);if(t.error)return Response.json({error:"LOYALTY_HISTORY_FAILED"},{status:500});if(r.error)return Response.json({error:"LOYALTY_REDEMPTION_HISTORY_FAILED"},{status:500});transactions=t.data??[];redemptions=r.data??[];const couponIds=redemptions.map((x:any)=>String(x.coupon_id));if(couponIds.length){const c=await ctx.supabaseAdmin.from("coupons").select("id,code,discount_type,discount_value,active,ends_at").in("id",couponIds);if(c.error)return Response.json({error:"LOYALTY_COUPON_LOOKUP_FAILED"},{status:500});coupons=c.data??[];}}
 const programByStore=new Map(programs.map((p:any)=>[String(p.store_id),p]));const rewardsByProgram=new Map<string,any[]>();for(const r of rewards){const id=String(r.program_id);rewardsByProgram.set(id,[...(rewardsByProgram.get(id)??[]),r]);}const couponById=new Map(coupons.map((c:any)=>[String(c.id),c]));const rewardById=new Map(rewards.map((r:any)=>[String(r.id),r]));
 const result=(wallets??[]).map((w:any)=>{const program=programByStore.get(String(w.store_id));const store=Array.isArray(w.stores)?w.stores[0]:w.stores;return{id:w.id,storeId:w.store_id,storeName:store?.name??"CLICK-FOOD",storeLogo:store?.logo_url??null,balance:Number(w.balance||0),pointsPerCurrency:program?Number(program.points_per_currency):0,rewards:program?(rewardsByProgram.get(String(program.id))??[]):[],transactions:transactions.filter((t:any)=>String(t.wallet_id)===String(w.id)).slice(0,20),redemptions:redemptions.filter((r:any)=>String(r.wallet_id)===String(w.id)).map((r:any)=>({...r,points_spent:Number(r.points_spent),coupon:couponById.get(String(r.coupon_id))??null,rewardName:rewardById.get(String(r.reward_id))?.name??"Recompensa"})).slice(0,20)};});
 return Response.json({wallets:result,totalPoints:result.reduce((s:number,w:any)=>s+Number(w.balance||0),0)});
})};
