import { createClient } from "npm:@supabase/supabase-js@2";

const safeEq=(a:string,b:string)=>{if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;};
const required=(name:string)=>{const v=Deno.env.get(name);if(!v)throw new Error(`MISSING_SECRET_${name}`);return v;};
const baseUrl=()=>Deno.env.get("EFI_PIX_SANDBOX")==="false"?"https://pix.api.efipay.com.br":"https://pix-h.api.efipay.com.br";
function decodeB64(name:string){const value=Deno.env.get(name);if(!value)return null;try{const binary=atob(value.trim());return new TextDecoder().decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));}catch{throw new Error(`INVALID_SECRET_${name}`)}}
function tlsSecret(pemName:string,b64Name:string){return decodeB64(b64Name)??required(pemName);}
function httpClient(){return Deno.createHttpClient({cert:tlsSecret("EFI_PIX_CERT_PEM","EFI_PIX_CERT_B64"),key:tlsSecret("EFI_PIX_KEY_PEM","EFI_PIX_KEY_B64")});}
async function token(client:Deno.HttpClient){const id=required("EFI_PIX_CLIENT_ID"),secret=required("EFI_PIX_CLIENT_SECRET");const res=await fetch(`${baseUrl()}/oauth/token`,{method:"POST",headers:{Authorization:`Basic ${btoa(`${id}:${secret}`)}`,"Content-Type":"application/json"},body:JSON.stringify({grant_type:"client_credentials"}),client} as any);let data:any={};try{data=await res.json()}catch{}if(!res.ok||!data.access_token)throw new Error(`EFI_OAUTH_${res.status}`);return String(data.access_token);}
async function api(client:Deno.HttpClient,access:string,path:string,init:RequestInit={}){const res=await fetch(`${baseUrl()}${path}`,{...init,headers:{Authorization:`Bearer ${access}`,"Content-Type":"application/json",...(init.headers??{})},client} as any);const text=await res.text();let data:any={};try{data=text?JSON.parse(text):{}}catch{data={raw:text}}return{ok:res.ok,status:res.status,data};}
function providerError(data:any){return String(data?.mensagem??data?.detail??data?.violacoes?.[0]?.razao??data?.nome??data?.error_description??"Falha no envio Pix").slice(0,500);}

export default{fetch:async(req:Request)=>{
 if(req.method!=="POST")return new Response("ok",{status:200});
 const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
 const received=req.headers.get("x-clickfood-worker-token")??"";
 const{data:workerToken}=await supabase.from("payout_worker_tokens").select("token").eq("singleton",true).maybeSingle();
 if(!workerToken?.token||!safeEq(received,String(workerToken.token)))return new Response("unauthorized",{status:401});
 const{data:config}=await supabase.from("payout_provider_configs").select("enabled,credentials_configured,automatic_processing").eq("provider","EFI_PIX_SEND").maybeSingle();
 if(!config?.enabled||!config?.credentials_configured||!config?.automatic_processing)return Response.json({ok:true,skipped:"AUTOMATIC_DISABLED"});
 const{data:next,error:nextError}=await supabase.schema("private").rpc("next_automatic_efi_payout");
 if(nextError)return Response.json({error:"QUEUE_LOOKUP_FAILED"},{status:500});
 const payoutId=String(next??"");if(!payoutId)return Response.json({ok:true,skipped:"EMPTY_QUEUE"});
 const{data:prepared,error:prepareError}=await supabase.schema("private").rpc("prepare_efi_payout_send_atomic",{p_payout_id:payoutId,p_actor_id:null});
 if(prepareError){const msg=String(prepareError.message??"");if(msg.includes("ANOTHER_EFI_PAYOUT_PROCESSING"))return Response.json({ok:true,skipped:"ANOTHER_PROCESSING"});return Response.json({error:"PAYOUT_PREPARE_FAILED"},{status:409});}
 const prep=Array.isArray(prepared)?prepared[0]:prepared;const idEnvio=String(prep?.id_envio??"");if(!idEnvio)return Response.json({error:"PAYOUT_SEND_ID_MISSING"},{status:500});
 const{data:payout}=await supabase.from("payouts").select("id,amount,destination_value,status").eq("id",payoutId).maybeSingle();if(!payout)return Response.json({error:"PAYOUT_NOT_FOUND"},{status:404});
 const sync=async(status:string,e2e:string|null,payload:any,error:string|null)=>{const{data,error:rpcError}=await supabase.schema("private").rpc("sync_efi_payout_attempt_atomic",{p_id_envio:idEnvio,p_status:status,p_e2e_id:e2e,p_payload:payload,p_error:error});if(rpcError)throw rpcError;return data;};
 let client:Deno.HttpClient|undefined;
 try{
  client=httpClient();const access=await token(client);
  if(prep?.reused){const check=await api(client,access,`/v2/gn/pix/enviados/id-envio/${encodeURIComponent(idEnvio)}`,{method:"GET"});if(check.ok){const status=String(check.data?.status??"EM_PROCESSAMENTO").toUpperCase();const settled=await sync(status,String(check.data?.endToEndId??check.data?.e2eId??"")||null,check.data,status==="NAO_REALIZADO"?providerError(check.data):null);return Response.json({ok:true,reconciled:true,payout:settled,providerStatus:status});}if(check.status!==404){await sync("UNKNOWN",null,check.data,providerError(check.data));return Response.json({ok:true,pending:true,providerStatus:check.status});}}
  const requestBody={valor:Number(payout.amount).toFixed(2),pagador:{chave:required("EFI_PIX_KEY"),infoPagador:`CLICK-FOOD repasse ${payoutId.slice(0,8)}`},favorecido:{chave:String(payout.destination_value).trim()}};
  let result=await api(client,access,`/v3/gn/pix/${encodeURIComponent(idEnvio)}`,{method:"PUT",body:JSON.stringify(requestBody)});
  if(result.status===409){
   const query=await api(client,access,`/v2/gn/pix/enviados/id-envio/${encodeURIComponent(idEnvio)}`,{method:"GET"});
   if(query.ok)result=query;
   else if(query.status===404){await sync("UNKNOWN",null,query.data,"Conflito no envio; aguardando reconciliação pelo mesmo idEnvio");return Response.json({ok:true,pending:true,providerStatus:409});}
   else result=query;
  }
  if(result.ok){const status=String(result.data?.status??"EM_PROCESSAMENTO").toUpperCase();const settled=await sync(status,String(result.data?.endToEndId??result.data?.e2eId??"")||null,result.data,status==="NAO_REALIZADO"?providerError(result.data):null);return Response.json({ok:true,payout:settled,providerStatus:status});}
  const err=providerError(result.data);
  if([400,404,422].includes(result.status)){const settled=await sync("NAO_REALIZADO",null,result.data,err);return Response.json({ok:false,definitive:true,payout:settled,providerStatus:result.status});}
  await sync("UNKNOWN",null,result.data,err);return Response.json({ok:true,pending:true,providerStatus:result.status});
 }catch(e:any){const msg=String(e?.message??"EFI_PAYOUT_WORKER_FAILED");try{await sync(msg.startsWith("EFI_OAUTH_")?"NAO_REALIZADO":"UNKNOWN",null,null,msg.slice(0,500));}catch{}return Response.json({error:msg.startsWith("EFI_OAUTH_")?"EFI_AUTH_FAILED":"EFI_PAYOUT_WORKER_FAILED"},{status:502});}finally{client?.close();}
}};
