import { withSupabase } from "npm:@supabase/server@1.4.1";

type Method="PIX"|"BANK_TRANSFER"|"OTHER";
type AdminStatus="APPROVED"|"PROCESSING"|"PAID"|"FAILED"|"REJECTED";
type Body=
 | {action:"STORE_SUMMARY";storeId:string}
 | {action:"REQUEST";storeId:string;amount:number;method:Method;destinationValue:string}
 | {action:"CANCEL";payoutId:string}
 | {action:"DRIVER_SUMMARY"}
 | {action:"DRIVER_REQUEST";amount:number;method:Method;destinationValue:string}
 | {action:"DRIVER_CANCEL";payoutId:string}
 | {action:"ADMIN_STATUS";payoutId:string;status:AdminStatus;notes?:string;providerId?:string};

const methods=new Set<Method>(["PIX","BANK_TRANSFER","OTHER"]);

function errorCode(message?:string){
 for(const code of ["INVALID_AMOUNT","INVALID_METHOD","INVALID_PIX_KEY","DESTINATION_REQUIRED","STORE_MANAGER_REQUIRED","DRIVER_REQUIRED","INSUFFICIENT_AVAILABLE_BALANCE","PAYOUT_NOT_FOUND","INVALID_RECIPIENT","INVALID_PAYOUT_TRANSITION"]){
  if(message?.includes(code))return code;
 }
 return "PAYOUT_OPERATION_FAILED";
}

function validCpf(value:string){
 if(!/^\d{11}$/.test(value)||/^(\d)\1{10}$/.test(value))return false;
 const calc=(length:number)=>{let sum=0;for(let i=0;i<length;i++)sum+=Number(value[i])*(length+1-i);const r=(sum*10)%11;return r===10?0:r;};
 return calc(9)===Number(value[9])&&calc(10)===Number(value[10]);
}

function validCnpj(value:string){
 if(!/^\d{14}$/.test(value)||/^(\d)\1{13}$/.test(value))return false;
 const digit=(base:string,weights:number[])=>{const sum=base.split("").reduce((total,n,i)=>total+Number(n)*weights[i],0);const mod=sum%11;return mod<2?0:11-mod;};
 const first=digit(value.slice(0,12),[5,4,3,2,9,8,7,6,5,4,3,2]);
 const second=digit(value.slice(0,12)+first,[6,5,4,3,2,9,8,7,6,5,4,3,2]);
 return first===Number(value[12])&&second===Number(value[13]);
}

function normalizePixKey(input:string){
 const raw=String(input??"").trim();
 if(!raw||raw.length>120)return null;
 if(raw.includes("@")){
  const email=raw.toLowerCase();
  return email.length<=77&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:null;
 }
 if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw))return raw.toLowerCase();
 const digits=raw.replace(/\D/g,"");
 if(raw.startsWith("+"))return digits.length>=10&&digits.length<=15&&digits[0]!=="0"?`+${digits}`:null;
 if(digits.length===11&&validCpf(digits))return digits;
 if(digits.length===14&&validCnpj(digits))return digits;
 if(digits.length===10||digits.length===11)return `+55${digits}`;
 if((digits.length===12||digits.length===13)&&digits.startsWith("55"))return `+${digits}`;
 return null;
}

function prepareRequest(amountInput:unknown,methodInput:unknown,destinationInput:unknown){
 const rawAmount=Number(amountInput);const amount=Math.round(rawAmount*100)/100;
 if(!Number.isFinite(rawAmount)||amount<0.01)return{error:"INVALID_AMOUNT" as const};
 const method=String(methodInput??"") as Method;
 if(!methods.has(method))return{error:"INVALID_METHOD" as const};
 const rawDestination=String(destinationInput??"").trim();
 if(!rawDestination)return{error:"DESTINATION_REQUIRED" as const};
 if(method==="PIX"){
  const destination=normalizePixKey(rawDestination);
  if(!destination)return{error:"INVALID_PIX_KEY" as const};
  return{amount,method,destination};
 }
 if(rawDestination.length>255)return{error:"DESTINATION_REQUIRED" as const};
 return{amount,method,destination:rawDestination};
}

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
 let body:Body;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
 const userId=ctx.userClaims!.id;const platformRole=String(ctx.userClaims!.appMetadata?.clickfood_role??"");

 if(body.action==="STORE_SUMMARY"){
  if(!body.storeId)return Response.json({error:"STORE_REQUIRED"},{status:400});
  const{data:membership}=await ctx.supabaseAdmin.from("store_memberships").select("role").eq("store_id",body.storeId).eq("user_id",userId).eq("active",true).in("role",["OWNER","MANAGER"]).maybeSingle();
  if(!membership)return Response.json({error:"STORE_MANAGER_REQUIRED"},{status:403});
  const[{data:ledger,error:ledgerError},{data:payouts,error:payoutError}]=await Promise.all([
   ctx.supabaseAdmin.from("financial_transactions").select("direction,amount,status").eq("store_id",body.storeId).in("status",["POSTED","PENDING"]),
   ctx.supabaseAdmin.from("payouts").select("id,amount,method,status,destination_value,requested_at,processed_at,review_notes,provider_id").eq("recipient_type","STORE").eq("store_id",body.storeId).order("requested_at",{ascending:false}).limit(100),
  ]);
  if(ledgerError||payoutError)return Response.json({error:"STORE_PAYOUT_SUMMARY_FAILED"},{status:500});
  const available=(ledger??[]).reduce((sum:any,row:any)=>sum+(row.direction==="CREDIT"?Number(row.amount):-Number(row.amount)),0);
  return Response.json({storeId:body.storeId,role:membership.role,availableBalance:Math.max(0,Math.round(available*100)/100),payouts:(payouts??[]).map((p:any)=>({...p,amount:Number(p.amount)}))});
 }

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
  if(!body.storeId)return Response.json({error:"STORE_REQUIRED"},{status:400});
  const prepared=prepareRequest(body.amount,body.method,body.destinationValue);if("error" in prepared)return Response.json({error:prepared.error},{status:400});
  const{data,error}=await ctx.supabaseAdmin.schema("private").rpc("request_store_payout_atomic",{p_store_id:body.storeId,p_user_id:userId,p_amount:prepared.amount,p_method:prepared.method,p_destination_value:prepared.destination});
  if(error)return Response.json({error:errorCode(error.message)},{status:error.message?.includes("INSUFFICIENT")?409:400});
  return Response.json({payoutId:data,amount:prepared.amount,method:prepared.method},{status:201});
 }

 if(body.action==="DRIVER_REQUEST"){
  const prepared=prepareRequest(body.amount,body.method,body.destinationValue);if("error" in prepared)return Response.json({error:prepared.error},{status:400});
  const{data:driver}=await ctx.supabaseAdmin.from("drivers").select("id").eq("user_id",userId).maybeSingle();
  if(!driver)return Response.json({error:"DRIVER_REQUIRED"},{status:403});
  const{data,error}=await ctx.supabaseAdmin.schema("private").rpc("request_driver_payout_atomic",{p_driver_id:driver.id,p_user_id:userId,p_amount:prepared.amount,p_method:prepared.method,p_destination_value:prepared.destination});
  if(error)return Response.json({error:errorCode(error.message)},{status:error.message?.includes("INSUFFICIENT")?409:400});
  return Response.json({payoutId:data,amount:prepared.amount,method:prepared.method},{status:201});
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