import { createClient } from "npm:@supabase/supabase-js@2";

const safeEq=(a:string,b:string)=>{if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;};
const payoutError=(pix:any)=>{const e=pix?.gnExtras?.erro;const parts=[e?.codigo,e?.origem,e?.motivo].filter(Boolean).map(String);return parts.length?parts.join(" • ").slice(0,500):null;};

export default{fetch:async(req:Request)=>{
 if(req.method!=="POST")return new Response("ok",{status:200});
 const url=new URL(req.url);const expected=Deno.env.get("EFI_WEBHOOK_HMAC")??"";const received=url.searchParams.get("hmac")??"";
 if(!expected||!safeEq(received,expected))return new Response("unauthorized",{status:401});
 let body:any;try{body=await req.json()}catch{return new Response("invalid",{status:400})}
 const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
 const items=Array.isArray(body?.pix)?body.pix:[];let processed=0,ignored=0;

 for(const pix of items){
  const txid=String(pix?.txid??"");const e2e=String(pix?.endToEndId??"");
  const sendId=String(pix?.gnExtras?.idEnvio??"");const pixType=String(pix?.tipo??"").toUpperCase();

  if(sendId&&pixType==="SOLICITACAO"){
   const status=String(pix?.status??"EM_PROCESSAMENTO").toUpperCase();
   const eventId=`payout:${sendId}:${status}:${e2e||"none"}`;
   const{data:existing}=await supabase.from("webhook_events").select("id,processed").eq("provider","EFI").eq("event_id",eventId).maybeSingle();
   if(existing?.processed){ignored++;continue;}
   if(!existing)await supabase.from("webhook_events").insert({provider:"EFI",event_id:eventId,event_type:`PIX_SENT_${status||"UNKNOWN"}`,payload:pix,processed:false});
   const{data:attempt}=await supabase.from("payout_provider_attempts").select("id").eq("id_envio",sendId).maybeSingle();
   if(!attempt){await supabase.from("webhook_events").update({processed:true,processed_at:new Date().toISOString(),last_error:"IGNORED_UNKNOWN_PAYOUT_SEND"}).eq("provider","EFI").eq("event_id",eventId);ignored++;continue;}
   const err=payoutError(pix);
   const{error}=await supabase.schema("private").rpc("sync_efi_payout_attempt_atomic",{p_id_envio:sendId,p_status:status||"EM_PROCESSAMENTO",p_e2e_id:e2e||null,p_payload:pix,p_error:err});
   if(error){await supabase.from("webhook_events").update({last_error:String(error.message).slice(0,500)}).eq("provider","EFI").eq("event_id",eventId);return new Response("retry",{status:500});}
   await supabase.from("webhook_events").update({processed:true,processed_at:new Date().toISOString(),last_error:null}).eq("provider","EFI").eq("event_id",eventId);processed++;continue;
  }

  const refunds=Array.isArray(pix?.devolucoes)?pix.devolucoes:[];
  if(refunds.length){
   for(const refund of refunds){
    const refundId=String(refund?.id??"");const status=String(refund?.status??"").toUpperCase();
    const eventId=`${e2e||txid}:refund:${refundId||"unknown"}:${status||"unknown"}`;
    const{data:existing}=await supabase.from("webhook_events").select("id,processed").eq("provider","EFI").eq("event_id",eventId).maybeSingle();
    if(existing?.processed){ignored++;continue;}
    if(!existing)await supabase.from("webhook_events").insert({provider:"EFI",event_id:eventId,event_type:`PIX_REFUND_${status||"UNKNOWN"}`,payload:refund,processed:false});
    if(!refundId){await supabase.from("webhook_events").update({processed:true,processed_at:new Date().toISOString(),last_error:"IGNORED_REFUND_NO_ID"}).eq("provider","EFI").eq("event_id",eventId);ignored++;continue;}
    const{data:local}=await supabase.from("refunds").select("id").eq("provider_refund_id",refundId).maybeSingle();
    if(!local){await supabase.from("webhook_events").update({processed:true,processed_at:new Date().toISOString(),last_error:"IGNORED_UNKNOWN_REFUND"}).eq("provider","EFI").eq("event_id",eventId);ignored++;continue;}
    const{error}=await supabase.rpc("settle_efi_pix_refund_atomic",{p_provider_refund_id:refundId,p_provider_status:status||"EM_PROCESSAMENTO",p_provider_payload:refund});
    if(error){await supabase.from("webhook_events").update({last_error:String(error.message).slice(0,500)}).eq("provider","EFI").eq("event_id",eventId);return new Response("retry",{status:500});}
    await supabase.from("webhook_events").update({processed:true,processed_at:new Date().toISOString(),last_error:null}).eq("provider","EFI").eq("event_id",eventId);processed++;
   }
   continue;
  }

  const value=Number(String(pix?.valor??"0").replace(",","."));const paidAt=pix?.horario?new Date(pix.horario).toISOString():new Date().toISOString();
  const eventId=`receipt:${e2e||`${txid}:${paidAt}:${value}`}`;
  const{data:existing}=await supabase.from("webhook_events").select("id,processed").eq("provider","EFI").eq("event_id",eventId).maybeSingle();
  if(existing?.processed){ignored++;continue;}
  if(!existing)await supabase.from("webhook_events").insert({provider:"EFI",event_id:eventId,event_type:"PIX_RECEIVED",payload:pix,processed:false});
  if(!txid||!Number.isFinite(value)){await supabase.from("webhook_events").update({processed:true,processed_at:new Date().toISOString(),last_error:"IGNORED_NO_TXID_OR_VALUE"}).eq("provider","EFI").eq("event_id",eventId);ignored++;continue;}
  const{data:charge}=await supabase.from("efi_pix_charges").select("id").eq("txid",txid).maybeSingle();
  if(!charge){await supabase.from("webhook_events").update({processed:true,processed_at:new Date().toISOString(),last_error:"IGNORED_UNKNOWN_TXID"}).eq("provider","EFI").eq("event_id",eventId);ignored++;continue;}
  const{error}=await supabase.rpc("complete_efi_pix_payment_atomic",{p_txid:txid,p_end_to_end_id:e2e||null,p_paid_amount:value,p_paid_at:paidAt,p_payload:pix});
  if(error){const msg=String(error.message).slice(0,500);if(msg.includes("AMOUNT_MISMATCH")){await supabase.from("webhook_events").update({processed:true,processed_at:new Date().toISOString(),last_error:"EFI_PIX_AMOUNT_MISMATCH"}).eq("provider","EFI").eq("event_id",eventId);ignored++;continue;}await supabase.from("webhook_events").update({last_error:msg}).eq("provider","EFI").eq("event_id",eventId);return new Response("retry",{status:500});}
  await supabase.from("webhook_events").update({processed:true,processed_at:new Date().toISOString(),last_error:null}).eq("provider","EFI").eq("event_id",eventId);processed++;
 }
 return Response.json({ok:true,processed,ignored});
}};
