import { withSupabase } from "npm:@supabase/server@1.4.1";

const env=(name:string)=>Deno.env.get(name)?.trim()||"";
const base=()=>"https://cobrancas.api.efipay.com.br";
const creds=()=>({id:env("EFI_CHARGES_CLIENT_ID")||env("EFI_PIX_CLIENT_ID"),secret:env("EFI_CHARGES_CLIENT_SECRET")||env("EFI_PIX_CLIENT_SECRET")});

async function auth(){
  const c=creds();
  if(!c.id||!c.secret)throw new Error("EFI_CHARGES_CREDENTIALS_REQUIRED");
  const response=await fetch(`${base()}/v1/authorize`,{method:"POST",headers:{Authorization:`Basic ${btoa(`${c.id}:${c.secret}`)}`,"Content-Type":"application/json"},body:JSON.stringify({grant_type:"client_credentials"})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.access_token)throw new Error(`EFI_CHARGES_OAUTH_${response.status}`);
  return String(data.access_token);
}

async function getCharge(access:string,chargeId:number){
  const response=await fetch(`${base()}/v1/charge/${chargeId}`,{headers:{Authorization:`Bearer ${access}`}});
  const data=await response.json().catch(()=>({}));
  return{ok:response.ok,status:response.status,data,providerStatus:String((data?.data??data)?.status??"").toUpperCase()};
}

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
  if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
  let body:any;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
  const orderId=String(body.orderId??"");
  const reason=String(body.reason??"").trim().slice(0,500);
  if(!orderId||!reason)return Response.json({error:"ORDER_AND_REASON_REQUIRED"},{status:400});

  const userId=ctx.userClaims!.id;
  const role=String(ctx.userClaims!.appMetadata?.clickfood_role??"");
  const{data:order}=await ctx.supabaseAdmin.from("orders").select("id,store_id,customer_id,status,payment_status").eq("id",orderId).maybeSingle();
  if(!order)return Response.json({error:"ORDER_NOT_FOUND"},{status:404});

  let authorized=["SUPER_ADMIN","ADMIN","SUPPORT"].includes(role)||(order.customer_id===userId&&["CANCELLED","REJECTED"].includes(order.status));
  if(!authorized){
    const{data:membership}=await ctx.supabaseAdmin.from("store_memberships").select("role").eq("store_id",order.store_id).eq("user_id",userId).eq("active",true).maybeSingle();
    authorized=!!membership&&["OWNER","MANAGER"].includes(String(membership.role));
  }
  if(!authorized)return Response.json({error:"REFUND_DENIED"},{status:403});

  const{data:payment}=await ctx.supabaseAdmin.from("payments").select("id,amount,status,provider,method").eq("order_id",order.id).eq("method","CREDIT_CARD").order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(!payment||payment.provider!=="EFI")return Response.json({error:"EFI_CARD_PAYMENT_NOT_FOUND"},{status:409});
  if(payment.status==="REFUNDED")return Response.json({ok:true,refundStatus:"COMPLETED",reused:true});
  if(payment.status!=="PAID")return Response.json({error:"CARD_PAYMENT_NOT_REFUNDABLE",paymentStatus:payment.status},{status:409});

  const{data:charge}=await ctx.supabaseAdmin.from("efi_card_charges").select("id,charge_id,status").eq("payment_id",payment.id).maybeSingle();
  if(!charge?.charge_id)return Response.json({error:"EFI_CARD_REFERENCE_MISSING"},{status:409});
  const chargeId=Number(charge.charge_id);

  let access:string;
  try{access=await auth()}catch(e:any){return Response.json({error:String(e?.message??"EFI_CARD_AUTH_FAILED"),refundStatus:"PENDING"},{status:502})}

  let{data:active}=await ctx.supabaseAdmin.from("refunds").select("id,status,provider_refund_id,amount").eq("payment_id",payment.id).in("status",["PENDING","PROCESSING"]).order("created_at",{ascending:false}).limit(1).maybeSingle();

  if(active){
    const remote=await getCharge(access,chargeId);
    if(!remote.ok)return Response.json({error:"EFI_CARD_REFUND_STATUS_FAILED",providerStatus:remote.status,refundStatus:active.status},{status:502});
    if(remote.providerStatus==="REFUNDED"){
      const settled=await ctx.supabaseAdmin.rpc("complete_efi_card_refund_atomic",{p_charge_id:chargeId,p_provider_payload:remote.data});
      if(settled.error)return Response.json({error:"EFI_CARD_REFUND_RECONCILIATION_FAILED"},{status:500});
      return Response.json({ok:true,refundStatus:"COMPLETED",reused:true});
    }
    if(active.status==="PROCESSING")return Response.json({ok:true,refundStatus:"PROCESSING",providerStatus:remote.providerStatus,reused:true},{status:202});
  }

  if(!active){
    const created=await ctx.supabaseAdmin.from("refunds").insert({payment_id:payment.id,amount:Number(payment.amount),reason,status:"PENDING",provider_refund_id:String(chargeId),created_by:userId}).select("id,status,provider_refund_id,amount").single();
    if(created.error){
      const{data:concurrent}=await ctx.supabaseAdmin.from("refunds").select("id,status,provider_refund_id,amount").eq("payment_id",payment.id).in("status",["PENDING","PROCESSING"]).order("created_at",{ascending:false}).limit(1).maybeSingle();
      if(!concurrent)return Response.json({error:"REFUND_CREATE_FAILED"},{status:500});
      active=concurrent;
      if(active.status==="PROCESSING")return Response.json({ok:true,refundStatus:"PROCESSING",reused:true},{status:202});
    }else active=created.data;
  }

  const response=await fetch(`${base()}/v1/charge/card/${chargeId}/refund`,{method:"POST",headers:{Authorization:`Bearer ${access}`,"Content-Type":"application/json"},body:"{}"});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const remote=await getCharge(access,chargeId);
    if(remote.ok&&remote.providerStatus==="REFUNDED"){
      const settled=await ctx.supabaseAdmin.rpc("complete_efi_card_refund_atomic",{p_charge_id:chargeId,p_provider_payload:remote.data});
      if(settled.error)return Response.json({error:"EFI_CARD_REFUND_RECONCILIATION_FAILED"},{status:500});
      return Response.json({ok:true,refundStatus:"COMPLETED",reused:true});
    }
    const uncertain=response.status>=500||response.status===409;
    await ctx.supabaseAdmin.from("refunds").update({status:uncertain?"PENDING":"FAILED"}).eq("id",active!.id);
    return Response.json({error:"EFI_CARD_REFUND_FAILED",providerStatus:response.status,refundStatus:uncertain?"PENDING":"FAILED"},{status:502});
  }

  await Promise.all([
    ctx.supabaseAdmin.from("refunds").update({status:"PROCESSING"}).eq("id",active!.id),
    ctx.supabaseAdmin.from("efi_card_charges").update({status:"REFUND_PENDING",updated_at:new Date().toISOString()}).eq("id",charge.id),
    ctx.supabaseAdmin.from("audit_logs").insert({actor_id:userId,action:"EFI_CARD_REFUND_REQUESTED",entity_type:"refund",entity_id:active!.id,after_data:{orderId,chargeId,amount:Number(payment.amount)}}),
  ]);
  return Response.json({ok:true,refundStatus:"PROCESSING",reused:false},{status:202});
})};
