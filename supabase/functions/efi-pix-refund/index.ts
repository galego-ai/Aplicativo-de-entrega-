import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body={orderId:string;reason:string};
const required=(name:string)=>{const v=Deno.env.get(name);if(!v)throw new Error(`MISSING_SECRET_${name}`);return v;};
const baseUrl=()=>Deno.env.get("EFI_PIX_SANDBOX")==="false"?"https://pix.api.efipay.com.br":"https://pix-h.api.efipay.com.br";
function decodeB64(name:string){const value=Deno.env.get(name);if(!value)return null;try{const binary=atob(value.trim());const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));return new TextDecoder().decode(bytes);}catch{throw new Error(`INVALID_SECRET_${name}`)}}
function tlsSecret(pemName:string,b64Name:string){return decodeB64(b64Name)??required(pemName);}
function httpClient(){return Deno.createHttpClient({cert:tlsSecret("EFI_PIX_CERT_PEM","EFI_PIX_CERT_B64"),key:tlsSecret("EFI_PIX_KEY_PEM","EFI_PIX_KEY_B64")});}
async function token(client:Deno.HttpClient){const id=required("EFI_PIX_CLIENT_ID"),secret=required("EFI_PIX_CLIENT_SECRET");const res=await fetch(`${baseUrl()}/oauth/token`,{method:"POST",headers:{Authorization:`Basic ${btoa(`${id}:${secret}`)}`,"Content-Type":"application/json"},body:JSON.stringify({grant_type:"client_credentials"}),client} as any);let data:any={};try{data=await res.json()}catch{}if(!res.ok||!data.access_token)throw new Error(`EFI_OAUTH_${res.status}`);return String(data.access_token);}
async function api(client:Deno.HttpClient,access:string,path:string,init:RequestInit={}){const res=await fetch(`${baseUrl()}${path}`,{...init,headers:{Authorization:`Bearer ${access}`,"Content-Type":"application/json",...(init.headers??{})},client} as any);const text=await res.text();let data:any={};try{data=text?JSON.parse(text):{}}catch{data={raw:text}}return{ok:res.ok,status:res.status,data};}
const providerStatus=(value:any)=>String(value?.status??"").toUpperCase();

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
 let body:Body;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
 const orderId=String(body?.orderId??"");const reason=String(body?.reason??"").trim();
 if(!orderId||!reason)return Response.json({error:"ORDER_AND_REASON_REQUIRED"},{status:400});
 const userId=ctx.userClaims!.id;const globalRole=String(ctx.userClaims!.appMetadata?.clickfood_role??"");
 const{data:order,error:orderError}=await ctx.supabaseAdmin.from("orders").select("id,store_id,customer_id,status,payment_status,total").eq("id",orderId).maybeSingle();
 if(orderError)return Response.json({error:"ORDER_LOOKUP_FAILED"},{status:500});if(!order)return Response.json({error:"ORDER_NOT_FOUND"},{status:404});
 if(!["CANCELLED","REJECTED"].includes(order.status))return Response.json({error:"ORDER_MUST_BE_CANCELLED_OR_REJECTED"},{status:409});
 let authorized=["SUPER_ADMIN","ADMIN","SUPPORT"].includes(globalRole)||(order.customer_id===userId&&order.status==="CANCELLED");
 if(!authorized){const{data:membership}=await ctx.supabaseAdmin.from("store_memberships").select("role").eq("store_id",order.store_id).eq("user_id",userId).eq("active",true).maybeSingle();authorized=!!membership&&["OWNER","MANAGER"].includes(String(membership.role));}
 if(!authorized)return Response.json({error:"REFUND_DENIED"},{status:403});
 const{data:payment}=await ctx.supabaseAdmin.from("payments").select("id,amount,status,provider,method").eq("order_id",order.id).eq("method","PIX").order("created_at",{ascending:false}).limit(1).maybeSingle();
 if(!payment)return Response.json({error:"PIX_PAYMENT_NOT_FOUND"},{status:409});
 if(payment.provider!=="EFI")return Response.json({error:"PAYMENT_PROVIDER_NOT_EFI"},{status:409});
 if(payment.status==="REFUNDED")return Response.json({ok:true,refundStatus:"COMPLETED",paymentStatus:"REFUNDED",reused:true});
 if(!["PAID","PARTIALLY_REFUNDED"].includes(payment.status))return Response.json({error:"PAYMENT_NOT_REFUNDABLE",paymentStatus:payment.status},{status:409});
 const{data:charge}=await ctx.supabaseAdmin.from("efi_pix_charges").select("id,end_to_end_id,status").eq("payment_id",payment.id).maybeSingle();
 if(!charge?.end_to_end_id)return Response.json({error:"EFI_PIX_REFERENCE_MISSING"},{status:409});
 const{data:done}=await ctx.supabaseAdmin.from("refunds").select("amount").eq("payment_id",payment.id).eq("status","COMPLETED");
 const completed=(done??[]).reduce((s:any,r:any)=>s+Number(r.amount),0);const remaining=Math.round((Number(payment.amount)-completed)*100)/100;
 if(remaining<=0)return Response.json({ok:true,refundStatus:"COMPLETED",paymentStatus:"REFUNDED",reused:true});
 let{data:refund}=await ctx.supabaseAdmin.from("refunds").select("id,amount,status,provider_refund_id").eq("payment_id",payment.id).in("status",["PENDING","PROCESSING"]).order("created_at",{ascending:false}).limit(1).maybeSingle();
 let client:Deno.HttpClient|undefined;
 try{
  client=httpClient();const access=await token(client);
  if(refund?.provider_refund_id){
   const check=await api(client,access,`/v2/pix/${encodeURIComponent(charge.end_to_end_id)}/devolucao/${encodeURIComponent(refund.provider_refund_id)}`,{method:"GET"});
   if(check.ok){const status=providerStatus(check.data);const{data:settled,error:settleError}=await ctx.supabaseAdmin.rpc("settle_efi_pix_refund_atomic",{p_provider_refund_id:refund.provider_refund_id,p_provider_status:status,p_provider_payload:check.data});if(settleError)throw settleError;return Response.json({ok:true,...settled,reused:true});}
   if(check.status!==400&&check.status!==404)return Response.json({error:"EFI_REFUND_STATUS_FAILED",refundStatus:refund.status},{status:502});
  }
  if(!refund){
   const providerRefundId=crypto.randomUUID().replaceAll("-","");
   const insert=await ctx.supabaseAdmin.from("refunds").insert({payment_id:payment.id,amount:remaining,reason:reason.slice(0,500),status:"PENDING",provider_refund_id:providerRefundId,created_by:userId}).select("id,amount,status,provider_refund_id").single();
   if(insert.error){const{data:active}=await ctx.supabaseAdmin.from("refunds").select("id,amount,status,provider_refund_id").eq("payment_id",payment.id).in("status",["PENDING","PROCESSING"]).order("created_at",{ascending:false}).limit(1).maybeSingle();if(!active)throw insert.error;refund=active;}else refund=insert.data;
  }
  if(!refund?.provider_refund_id)throw new Error("REFUND_ID_MISSING");
  let send=await api(client,access,`/v2/pix/${encodeURIComponent(charge.end_to_end_id)}/devolucao/${encodeURIComponent(refund.provider_refund_id)}`,{method:"PUT",body:JSON.stringify({valor:Number(refund.amount).toFixed(2)})});
  if(send.status===409){send=await api(client,access,`/v2/pix/${encodeURIComponent(charge.end_to_end_id)}/devolucao/${encodeURIComponent(refund.provider_refund_id)}`,{method:"GET"});}
  if(!send.ok){if(send.status>=400&&send.status<500){await ctx.supabaseAdmin.from("refunds").update({status:"FAILED"}).eq("id",refund.id);}return Response.json({error:"EFI_PIX_REFUND_FAILED",providerStatus:send.status,refundStatus:send.status>=500?"PENDING":"FAILED"},{status:502});}
  const status=providerStatus(send.data)||"EM_PROCESSAMENTO";const{data:settled,error:settleError}=await ctx.supabaseAdmin.rpc("settle_efi_pix_refund_atomic",{p_provider_refund_id:refund.provider_refund_id,p_provider_status:status,p_provider_payload:send.data});if(settleError)throw settleError;
  await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:userId,action:"EFI_PIX_REFUND_REQUESTED",entity_type:"refund",entity_id:refund.id,after_data:{orderId:order.id,paymentId:payment.id,amount:Number(refund.amount),providerRefundId:refund.provider_refund_id,providerStatus:status}});
  return Response.json({ok:true,...settled,reused:false},{status:status==="DEVOLVIDO"?200:202});
 }catch(e:any){return Response.json({error:String(e?.message??"EFI_PIX_REFUND_FAILED").startsWith("EFI_OAUTH_")?"EFI_AUTH_FAILED":"EFI_PIX_REFUND_FAILED",refundStatus:refund?.status??null},{status:502});}finally{client?.close();}
})};
