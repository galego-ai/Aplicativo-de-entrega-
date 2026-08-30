import { withSupabase } from "npm:@supabase/server@1.4.1";

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
 const userId=ctx.userClaims!.id;
 const{data:wallets,error}=await ctx.supabaseAdmin.from("customer_loyalty_wallets").select("id,store_id,balance,updated_at,stores(name,logo_url)").eq("customer_id",userId).order("updated_at",{ascending:false});if(error)return Response.json({error:"LOYALTY_LOOKUP_FAILED"},{status:500});
 const storeIds=[...new Set((wallets??[]).map((w:any)=>String(w.store_id)))];const walletIds=(wallets??[]).map((w:any)=>String(w.id));
 let programs:any[]=[];let rewards:any[]=[];let transactions:any[]=[];
 if(storeIds.length){const p=await ctx.supabaseAdmin.from("loyalty_programs").select("id,store_id,points_per_currency,active").in("store_id",storeIds).eq("active",true);if(p.error)return Response.json({error:"LOYALTY_PROGRAM_LOOKUP_FAILED"},{status:500});programs=p.data??[];const programIds=programs.map((x:any)=>String(x.id));if(programIds.length){const r=await ctx.supabaseAdmin.from("loyalty_rewards").select("id,program_id,name,points_cost,reward_type,reward_value,product_id,active").in("program_id",programIds).eq("active",true).order("points_cost");if(r.error)return Response.json({error:"REWARD_LOOKUP_FAILED"},{status:500});rewards=r.data??[];}}
 if(walletIds.length){const t=await ctx.supabaseAdmin.from("loyalty_transactions").select("id,wallet_id,transaction_type,points,order_id,reward_id,created_at").in("wallet_id",walletIds).order("created_at",{ascending:false}).limit(100);if(t.error)return Response.json({error:"LOYALTY_HISTORY_FAILED"},{status:500});transactions=t.data??[];}
 const programByStore=new Map(programs.map((p:any)=>[String(p.store_id),p]));const rewardsByProgram=new Map<string,any[]>();for(const r of rewards){const id=String(r.program_id);rewardsByProgram.set(id,[...(rewardsByProgram.get(id)??[]),r]);}
 const result=(wallets??[]).map((w:any)=>{const program=programByStore.get(String(w.store_id));const store=Array.isArray(w.stores)?w.stores[0]:w.stores;return{id:w.id,storeId:w.store_id,storeName:store?.name??"CLICK-FOOD",storeLogo:store?.logo_url??null,balance:Number(w.balance||0),pointsPerCurrency:program?Number(program.points_per_currency):0,rewards:program?(rewardsByProgram.get(String(program.id))??[]):[],transactions:transactions.filter((t:any)=>String(t.wallet_id)===String(w.id)).slice(0,20)};});
 return Response.json({wallets:result,totalPoints:result.reduce((s:number,w:any)=>s+Number(w.balance||0),0)});
})};
