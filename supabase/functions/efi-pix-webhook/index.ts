import { createClient } from "npm:@supabase/supabase-js@2";

const safeEq=(a:string,b:string)=>{if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;};

export default{fetch:async(req:Request)=>{
 if(req.method!=="POST")return new Response("ok",{status:200});
 const url=new URL(req.url);const expected=Deno.env.get("EFI_WEBHOOK_HMAC")??"";const received=url.searchParams.get("hmac")??"";
 if(!expected||!safeEq(received,expected))return new Response("unauthorized",{status:401});
 let body:any;try{body=await req.json()}catch{return new Response("invalid",{status:400})}
 const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
 const items=Array.isArray(body?.pix)?body.pix:[];let processed=0,ignored=0;
 for(const pix of items){
  const txid=String(pix?.txid??"");const e2e=String(pix?.endToEndId??"");const value=Number(String(pix?.valor??"0").replace(",","."));const paidAt=pix?.horario?new Date(pix.horario).toISOString():new Date().toISOString();
  const eventId=e2e||`${txid}:${paidAt}:${value}`;
  const{data:existing}=await supabase.from("webhook_events").select("id,processed").eq("provider","EFI").eq("event_id",eventId).maybeSingle();
  if(existing?.processed){ignored++;continue;}
  if(!existing){await supabase.from("webhook_events").insert({provider:"EFI",event_id:eventId,event_type:"PIX_RECEIVED",payload:pix,processed:false});}
  if(!txid||!Number.isFinite(value)){await supabase.from("webhook_events").update({processed:true,processed_at:new Date().toISOString(),last_error:"IGNORED_NO_TXID_OR_VALUE"}).eq("provider","EFI").eq("event_id",eventId);ignored++;continue;}
  const{data:charge}=await supabase.from("efi_pix_charges").select("id").eq("txid",txid).maybeSingle();
  if(!charge){await supabase.from("webhook_events").update({processed:true,processed_at:new Date().toISOString(),last_error:"IGNORED_UNKNOWN_TXID"}).eq("provider","EFI").eq("event_id",eventId);ignored++;continue;}
  const{error}=await supabase.rpc("complete_efi_pix_payment_atomic",{p_txid:txid,p_end_to_end_id:e2e||null,p_paid_amount:value,p_paid_at:paidAt,p_payload:pix});
  if(error){const msg=String(error.message).slice(0,500);if(msg.includes("AMOUNT_MISMATCH")){await supabase.from("webhook_events").update({processed:true,processed_at:new Date().toISOString(),last_error:"EFI_PIX_AMOUNT_MISMATCH"}).eq("provider","EFI").eq("event_id",eventId);ignored++;continue;}await supabase.from("webhook_events").update({last_error:msg}).eq("provider","EFI").eq("event_id",eventId);return new Response("retry",{status:500});}
  await supabase.from("webhook_events").update({processed:true,processed_at:new Date().toISOString(),last_error:null}).eq("provider","EFI").eq("event_id",eventId);processed++;
 }
 return Response.json({ok:true,processed,ignored});
}};