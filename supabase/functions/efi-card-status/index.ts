import { withSupabase } from "npm:@supabase/server@1.4.1";

const env=(name:string)=>Deno.env.get(name)?.trim()||"";
const base=()=>env("EFI_PIX_SANDBOX")==="false"?"https://cobrancas.api.efipay.com.br":"https://cobrancas-h.api.efipay.com.br";
const creds=()=>({id:env("EFI_CHARGES_CLIENT_ID")||env("EFI_PIX_CLIENT_ID"),secret:env("EFI_CHARGES_CLIENT_SECRET")||env("EFI_PIX_CLIENT_SECRET")});

async function auth(){
  const c=creds();
  if(!c.id||!c.secret)throw new Error("EFI_CHARGES_CREDENTIALS_REQUIRED");
  const response=await fetch(`${base()}/v1/authorize`,{method:"POST",headers:{Authorization:`Basic ${btoa(`${c.id}:${c.secret}`)}`,"Content-Type":"application/json"},body:JSON.stringify({grant_type:"client_credentials"})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.access_token)throw new Error(`EFI_CHARGES_OAUTH_${response.status}`);
  return String(data.access_token);
}

async function recoverRefund(req:Request,orderId:string,reason:string){
  const authorization=req.headers.get("Authorization")??"";
  if(!authorization)return null;
  const response=await fetch(`${env("SUPABASE_URL")}/functions/v1/efi-card-refund`,{method:"POST",headers:{Authorization:authorization,"Content-Type":"application/json"},body:JSON.stringify({orderId,reason})});
  const data=await response.json().catch(()=>({}));
  return{ok:response.ok,status:response.status,data};
}

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
  if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
  let body:any;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
  const orderId=String(body.orderId??"");
  if(!orderId)return Response.json({error:"ORDER_REQUIRED"},{status:400});

  const role=String(ctx.userClaims!.appMetadata?.clickfood_role??"");
  const{data:order}=await ctx.supabaseAdmin.from("orders").select("id,customer_id,status,payment_status").eq("id",orderId).maybeSingle();
  if(!order||(!["SUPER_ADMIN","ADMIN","SUPPORT"].includes(role)&&order.customer_id!==ctx.userClaims!.id))return Response.json({error:"ORDER_NOT_FOUND"},{status:404});

  const{data:charge}=await ctx.supabaseAdmin.from("efi_card_charges").select("charge_id,status,card_mask,brand,installments,installment_value,refusal_reason,retry_allowed,payment_id").eq("order_id",orderId).maybeSingle();
  if(!charge?.charge_id)return Response.json({error:"EFI_CARD_CHARGE_NOT_FOUND"},{status:404});

  if(order.payment_status==="REFUNDED"||charge.status==="REFUNDED")return Response.json({paid:false,refunded:true,status:"REFUNDED",refundStatus:"COMPLETED",charge});

  const{data:refund}=await ctx.supabaseAdmin.from("refunds").select("id,status,reason").eq("payment_id",charge.payment_id).in("status",["PENDING","PROCESSING","FAILED"]).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(refund&&["CANCELLED","REJECTED","REFUNDED"].includes(order.status)){
    const recovered=await recoverRefund(req,orderId,String(refund.reason||"Reconciliação de estorno de cartão"));
    if(recovered?.ok){
      const refundStatus=String(recovered.data?.refundStatus??refund.status).toUpperCase();
      if(refundStatus==="COMPLETED")return Response.json({paid:false,refunded:true,status:"REFUNDED",refundStatus,charge:{...charge,status:"REFUNDED"}});
      return Response.json({paid:false,refunded:false,status:"REFUND_PENDING",refundStatus,charge:{...charge,status:"REFUND_PENDING"}});
    }
    if(refund.status==="FAILED")return Response.json({error:"EFI_CARD_REFUND_RETRY_FAILED",refundStatus:"FAILED"},{status:502});
  }

  let access:string;
  try{access=await auth()}catch{return Response.json({error:"EFI_CARD_AUTH_FAILED"},{status:502})}
  const response=await fetch(`${base()}/v1/charge/${charge.charge_id}`,{headers:{Authorization:`Bearer ${access}`}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)return Response.json({error:"EFI_CARD_STATUS_FAILED",providerStatus:response.status},{status:502});

  const remote=data?.data??data;
  const status=String(remote?.status??charge.status).toUpperCase();
  const paidAt=remote?.payment?.paid_at??remote?.paid_at??null;
  if(status==="REFUNDED"){
    const completed=await ctx.supabaseAdmin.rpc("complete_efi_card_refund_atomic",{p_charge_id:Number(charge.charge_id),p_provider_payload:data});
    if(completed.error)return Response.json({error:"EFI_CARD_REFUND_RECONCILIATION_FAILED"},{status:500});
  }else{
    const reconciled=await ctx.supabaseAdmin.rpc("reconcile_efi_card_charge_atomic",{p_charge_id:Number(charge.charge_id),p_status:status,p_payload:data,p_paid_at:paidAt});
    if(reconciled.error)return Response.json({error:"EFI_CARD_RECONCILIATION_FAILED"},{status:500});
  }
  return Response.json({paid:status==="PAID",approved:status==="APPROVED",refunded:status==="REFUNDED",status,refundStatus:status==="REFUNDED"?"COMPLETED":refund?.status??null,charge:{...charge,status}});
})};
