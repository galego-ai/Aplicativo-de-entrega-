import { createClient } from "npm:@supabase/supabase-js@2";

const env=(name:string)=>Deno.env.get(name)?.trim()||"";
const base=()=>"https://cobrancas.api.efipay.com.br";
const creds=()=>({id:env("EFI_CHARGES_CLIENT_ID")||env("EFI_PIX_CLIENT_ID"),secret:env("EFI_CHARGES_CLIENT_SECRET")||env("EFI_PIX_CLIENT_SECRET")});
const safe=(a:string,b:string)=>{if(!a||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;};

async function auth(){
  const c=creds();
  if(!c.id||!c.secret)throw new Error("EFI_CHARGES_CREDENTIALS_REQUIRED");
  const response=await fetch(`${base()}/v1/authorize`,{method:"POST",headers:{Authorization:`Basic ${btoa(`${c.id}:${c.secret}`)}`,"Content-Type":"application/json"},body:JSON.stringify({grant_type:"client_credentials"})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.access_token)throw new Error(`EFI_CHARGES_OAUTH_${response.status}`);
  return String(data.access_token);
}

export default {fetch:async(req:Request)=>{
  if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
  const supabase=createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
  const received=req.headers.get("x-clickfood-card-worker-token")??"";
  const tokenResult=await supabase.from("card_reconcile_worker_tokens").select("token").eq("singleton",true).maybeSingle();
  if(tokenResult.error||!tokenResult.data?.token||!safe(String(tokenResult.data.token),received))return Response.json({error:"UNAUTHORIZED"},{status:401});

  const configResult=await supabase.from("payment_provider_configs").select("enabled,credentials_configured,supported_methods").eq("provider","EFI_BANK").eq("environment","PRODUCTION").maybeSingle();
  const config:any=configResult.data;
  if(configResult.error)return Response.json({error:"PAYMENT_CONFIG_LOOKUP_FAILED"},{status:500});
  if(!config?.enabled||!config?.credentials_configured||!(config.supported_methods??[]).includes("CREDIT_CARD"))return Response.json({ok:true,skipped:"EFI_CARD_DISABLED",checked:0,reconciled:0});

  const since=new Date(Date.now()-24*60*60*1000).toISOString();
  const pending=await supabase.from("efi_card_charges").select("charge_id,status,order_id,payment_id,updated_at").in("status",["CREATED","WAITING","APPROVED"]).gte("created_at",since).order("updated_at",{ascending:true}).limit(50);
  if(pending.error)return Response.json({error:"CARD_CHARGE_LOOKUP_FAILED"},{status:500});
  const charges=(pending.data??[]) as any[];
  if(!charges.length)return Response.json({ok:true,checked:0,reconciled:0,failed:0});

  let access:string;
  try{access=await auth();}catch(error:any){return Response.json({error:String(error?.message??"EFI_CARD_AUTH_FAILED")},{status:502});}
  let reconciled=0,failed=0;
  const failures:Array<{chargeId:number;error:string}>=[];
  for(const charge of charges){
    const chargeId=Number(charge.charge_id);
    try{
      const response=await fetch(`${base()}/v1/charge/${chargeId}`,{headers:{Authorization:`Bearer ${access}`}});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(`EFI_CARD_STATUS_${response.status}`);
      const remote=payload?.data??payload;
      const status=String(remote?.status??charge.status).toUpperCase();
      if(status==="REFUNDED"){
        const result=await supabase.rpc("complete_efi_card_refund_atomic",{p_charge_id:chargeId,p_provider_payload:payload});
        if(result.error)throw result.error;
      }else{
        const paidAt=remote?.payment?.paid_at??remote?.paid_at??null;
        const result=await supabase.rpc("reconcile_efi_card_charge_atomic",{p_charge_id:chargeId,p_status:status,p_payload:payload,p_paid_at:paidAt});
        if(result.error)throw result.error;
      }
      reconciled++;
    }catch(error:any){
      failed++;
      failures.push({chargeId,error:String(error?.message??"CARD_RECONCILE_FAILED").slice(0,160)});
    }
  }
  return Response.json({ok:failed===0,checked:charges.length,reconciled,failed,failures});
}};
