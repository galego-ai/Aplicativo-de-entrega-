import { createClient } from "npm:@supabase/supabase-js@2";

const env=(name:string)=>Deno.env.get(name)?.trim()||"";
const base=()=>env("EFI_PIX_SANDBOX")==="false"?"https://cobrancas.api.efipay.com.br":"https://cobrancas-h.api.efipay.com.br";
const safe=(a:string,b:string)=>{if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;};
const creds=()=>({id:env("EFI_CHARGES_CLIENT_ID")||env("EFI_PIX_CLIENT_ID"),secret:env("EFI_CHARGES_CLIENT_SECRET")||env("EFI_PIX_CLIENT_SECRET")});

async function auth(){
  const c=creds();
  if(!c.id||!c.secret)throw new Error("EFI_CHARGES_CREDENTIALS_REQUIRED");
  const response=await fetch(`${base()}/v1/authorize`,{method:"POST",headers:{Authorization:`Basic ${btoa(`${c.id}:${c.secret}`)}`,"Content-Type":"application/json"},body:JSON.stringify({grant_type:"client_credentials"})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.access_token)throw new Error(`AUTH_${response.status}`);
  return String(data.access_token);
}

async function tokenFrom(req:Request){
  const contentType=req.headers.get("content-type")??"";
  if(contentType.includes("application/json")){
    const data:any=await req.json().catch(()=>({}));
    return String(data.notification??data.token??"");
  }
  if(contentType.includes("form")){
    const form=await req.formData().catch(()=>null);
    return String(form?.get("notification")??form?.get("token")??"");
  }
  const text=await req.text();
  try{const params=new URLSearchParams(text);return String(params.get("notification")??params.get("token")??"");}catch{return"";}
}

function orderIdFromCustomId(value:unknown){
  const customId=String(value??"");
  const match=customId.match(/^CLICKFOOD_([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i);
  return match?.[1]??null;
}

async function recoverOrphanCharge(supabase:any,event:any,payload:any){
  const chargeId=Number(event?.identifiers?.charge_id);
  const orderId=orderIdFromCustomId(event?.custom_id);
  if(!Number.isFinite(chargeId)||!orderId)return false;

  const{data:order}=await supabase.from("orders").select("id,payment_status").eq("id",orderId).maybeSingle();
  if(!order)return false;

  const{data:payment}=await supabase.from("payments").select("id,amount,status,method").eq("order_id",orderId).eq("method","CREDIT_CARD").order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(!payment)return false;

  const row={
    order_id:orderId,
    payment_id:payment.id,
    charge_id:chargeId,
    status:"CREATED",
    amount:Number(payment.amount),
    installments:1,
    provider_payload:{recovered_from_notification:true,notification:payload},
    updated_at:new Date().toISOString(),
  };
  const inserted=await supabase.from("efi_card_charges").upsert(row,{onConflict:"payment_id",ignoreDuplicates:true});
  if(inserted.error)throw inserted.error;

  const{data:recovered}=await supabase.from("efi_card_charges").select("charge_id").eq("payment_id",payment.id).maybeSingle();
  if(Number(recovered?.charge_id)!==chargeId)return false;

  await supabase.from("payments").update({provider:"EFI",provider_transaction_id:String(chargeId)}).eq("id",payment.id).is("provider_transaction_id",null);
  return true;
}

export default{fetch:async(req:Request)=>{
  if(req.method!=="POST")return new Response("ok",{status:200});
  const url=new URL(req.url);
  const expected=env("EFI_WEBHOOK_HMAC"),received=url.searchParams.get("hmac")??"";
  if(!expected||!safe(expected,received))return new Response("unauthorized",{status:401});

  const notificationToken=await tokenFrom(req);
  if(!notificationToken||notificationToken.length>500)return new Response("invalid",{status:400});

  const supabase=createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false}});
  const{data:old}=await supabase.from("webhook_events").select("processed").eq("provider","EFI_CARD").eq("event_id",notificationToken).maybeSingle();
  if(old?.processed)return new Response("ok",{status:200});
  if(!old)await supabase.from("webhook_events").insert({provider:"EFI_CARD",event_id:notificationToken,event_type:"CHARGE_NOTIFICATION",payload:{token:notificationToken},processed:false});

  try{
    const access=await auth();
    const response=await fetch(`${base()}/v1/notification/${encodeURIComponent(notificationToken)}`,{headers:{Authorization:`Bearer ${access}`}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(`NOTIFICATION_${response.status}`);

    const events=Array.isArray(data?.data)?data.data:[];
    let chosen:any=null;
    for(let i=events.length-1;i>=0;i--){
      const chargeId=Number(events[i]?.identifiers?.charge_id);
      if(!Number.isFinite(chargeId))continue;
      const{data:local}=await supabase.from("efi_card_charges").select("charge_id").eq("charge_id",chargeId).maybeSingle();
      if(local){chosen=events[i];break;}
      if(await recoverOrphanCharge(supabase,events[i],data)){chosen=events[i];break;}
    }

    if(!chosen){
      await supabase.from("webhook_events").update({processed:true,processed_at:new Date().toISOString(),payload:data,last_error:"IGNORED_UNKNOWN_CARD_CHARGE"}).eq("provider","EFI_CARD").eq("event_id",notificationToken);
      return new Response("ok",{status:200});
    }

    const chargeId=Number(chosen.identifiers.charge_id);
    const status=String(chosen?.status?.current??"").toUpperCase();
    if(status==="REFUNDED"){
      const result=await supabase.rpc("complete_efi_card_refund_atomic",{p_charge_id:chargeId,p_provider_payload:data});
      if(result.error)throw result.error;
    }else{
      const result=await supabase.rpc("reconcile_efi_card_charge_atomic",{p_charge_id:chargeId,p_status:status,p_payload:data,p_paid_at:chosen?.received_by_bank_at??null});
      if(result.error)throw result.error;
    }

    await supabase.from("webhook_events").update({processed:true,processed_at:new Date().toISOString(),payload:data,last_error:null}).eq("provider","EFI_CARD").eq("event_id",notificationToken);
    return new Response("ok",{status:200});
  }catch(error:any){
    await supabase.from("webhook_events").update({last_error:String(error?.message??"EFI_CARD_WEBHOOK_FAILED").slice(0,500)}).eq("provider","EFI_CARD").eq("event_id",notificationToken);
    return new Response("retry",{status:500});
  }
}};
