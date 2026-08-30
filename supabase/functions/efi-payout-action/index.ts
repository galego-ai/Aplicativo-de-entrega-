import { withSupabase } from "npm:@supabase/server@1.4.1";

const required=(name:string)=>{const v=Deno.env.get(name);if(!v)throw new Error(`MISSING_SECRET_${name}`);return v;};
const baseUrl=()=>Deno.env.get("EFI_PIX_SANDBOX")==="false"?"https://pix.api.efipay.com.br":"https://pix-h.api.efipay.com.br";
function decodeB64(name:string){const value=Deno.env.get(name);if(!value)return null;try{const binary=atob(value.trim());return new TextDecoder().decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));}catch{throw new Error(`INVALID_SECRET_${name}`)}}
function tlsSecret(pemName:string,b64Name:string){return decodeB64(b64Name)??required(pemName);}
function httpClient(){return Deno.createHttpClient({cert:tlsSecret("EFI_PIX_CERT_PEM","EFI_PIX_CERT_B64"),key:tlsSecret("EFI_PIX_KEY_PEM","EFI_PIX_KEY_B64")});}
async function token(client:Deno.HttpClient){const id=required("EFI_PIX_CLIENT_ID"),secret=required("EFI_PIX_CLIENT_SECRET");const res=await fetch(`${baseUrl()}/oauth/token`,{method:"POST",headers:{Authorization:`Basic ${btoa(`${id}:${secret}`)}`,"Content-Type":"application/json"},body:JSON.stringify({grant_type:"client_credentials"}),client} as any);let data:any={};try{data=await res.json()}catch{}if(!res.ok||!data.access_token)throw new Error(`EFI_OAUTH_${res.status}`);return String(data.access_token);}
async function api(client:Deno.HttpClient,access:string,path:string,init:RequestInit={}){const res=await fetch(`${baseUrl()}${path}`,{...init,headers:{Authorization:`Bearer ${access}`,"Content-Type":"application/json",...(init.headers??{})},client} as any);const text=await res.text();let data:any={};try{data=text?JSON.parse(text):{}}catch{data={raw:text}}return{ok:res.ok,status:res.status,data};}
function providerError(data:any){return String(data?.mensagem??data?.detail??data?.violacoes?.[0]?.razao??data?.nome??data?.error_description??"Falha no envio Pix").slice(0,500);}

type Body={action:"SEND"|"STATUS";payoutId:string};

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
 let body:Body;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
 if(!body?.payoutId||!["SEND","STATUS"].includes(body.action))return Response.json({error:"PAYOUT_AND_ACTION_REQUIRED"},{status:400});
 const userId=ctx.userClaims!.id;const role=String(ctx.userClaims!.appMetadata?.clickfood_role??"");if(!["SUPER_ADMIN","ADMIN"].includes(role))return Response.json({error:"ADMIN_REQUIRED"},{status:403});
 const{data:config}=await ctx.supabaseAdmin.from("payout_provider_configs").select("enabled,credentials_configured,environment").eq("provider","EFI_PIX_SEND").maybeSingle();if(!config?.enabled||!config?.credentials_configured)return Response.json({error:"EFI_PAYOUT_NOT_ENABLED"},{status:409});
 const{data:payout,error:lookupError}=await ctx.supabaseAdmin.from("payouts").select("id,amount,method,status,destination_value,provider_name,provider_id").eq("id",body.payoutId).maybeSingle();
 if(lookupError)return Response.json({error:"PAYOUT_LOOKUP_FAILED"},{status:500});if(!payout)return Response.json({error:"PAYOUT_NOT_FOUND"},{status:404});if(payout.method!=="PIX"||!payout.destination_value?.trim())return Response.json({error:"PAYOUT_PIX_DESTINATION_REQUIRED"},{status:409});
 const sync=async(idEnvio:string,status:string,e2e:string|null,payload:any,error:string|null)=>{const{data,error:rpcError}=await ctx.supabaseAdmin.schema("private").rpc("sync_efi_payout_attempt_atomic",{p_id_envio:idEnvio,p_status:status,p_e2e_id:e2e,p_payload:payload,p_error:error});if(rpcError)throw rpcError;return data;};
 const reconcile=async(client:Deno.HttpClient,access:string,idEnvio:string)=>{const result=await api(client,access,`/v2/gn/pix/enviados/id-envio/${encodeURIComponent(idEnvio)}`,{method:"GET"});if(!result.ok)return{ok:false,status:result.status,data:result.data};const status=String(result.data?.status??"EM_PROCESSAMENTO").toUpperCase();const settled=await sync(idEnvio,status,String(result.data?.endToEndId??result.data?.e2eId??"")||null,result.data,status==="NAO_REALIZADO"?providerError(result.data):null);return{ok:true,status:result.status,data:result.data,settled};};
 let client:Deno.HttpClient|undefined;let activeId=String(payout.provider_name==="EFI"?payout.provider_id??"":"");
 try{
  client=httpClient();const access=await token(client);
  if(body.action==="STATUS"){
   if(!activeId)return Response.json({error:"EFI_PAYOUT_TRANSFER_NOT_STARTED"},{status:409});
   const result=await reconcile(client,access,activeId);if(!result.ok)return Response.json({error:result.status===404?"EFI_PAYOUT_STATUS_NOT_FOUND":"EFI_PAYOUT_STATUS_FAILED",providerStatus:result.status},{status:result.status===404?404:502});
   return Response.json({ok:true,payout:result.settled,providerStatus:String(result.data?.status??"")});
  }
  if(payout.status==="PAID")return Response.json({ok:true,reused:true,payoutStatus:"PAID",providerId:activeId||null});
  if(!["APPROVED","FAILED","PROCESSING"].includes(payout.status))return Response.json({error:payout.status==="REQUESTED"?"PAYOUT_REQUIRES_APPROVAL":"PAYOUT_NOT_SENDABLE",currentStatus:payout.status},{status:409});

  const{data:prepared,error:prepareError}=await ctx.supabaseAdmin.schema("private").rpc("prepare_efi_payout_send_atomic",{p_payout_id:payout.id,p_actor_id:userId});
  if(prepareError){const msg=String(prepareError.message??"");if(msg.includes("ANOTHER_EFI_PAYOUT_PROCESSING"))return Response.json({error:"EFI_PAYOUT_ANOTHER_TRANSFER_PROCESSING"},{status:409});if(msg.includes("INSUFFICIENT"))return Response.json({error:"INSUFFICIENT_AVAILABLE_BALANCE"},{status:409});return Response.json({error:"PAYOUT_STATUS_CHANGED"},{status:409});}
  const prep=Array.isArray(prepared)?prepared[0]:prepared;activeId=String(prep?.id_envio??"");if(!activeId)return Response.json({error:"EFI_PAYOUT_TRANSFER_NOT_STARTED"},{status:500});
  if(prep?.reused){const check=await reconcile(client,access,activeId);if(check.ok)return Response.json({ok:true,reused:true,payout:check.settled,providerStatus:String(check.data?.status??"")});if(check.status!==404)return Response.json({error:"EFI_PAYOUT_STATUS_FAILED",providerStatus:check.status},{status:502});}

  await sync(activeId,"CREATED",null,{environment:config.environment},null);
  const bodyPix={valor:Number(payout.amount).toFixed(2),pagador:{chave:required("EFI_PIX_KEY"),infoPagador:`CLICK-FOOD repasse ${String(payout.id).slice(0,8)}`},favorecido:{chave:String(payout.destination_value).trim()}};
  let result=await api(client,access,`/v3/gn/pix/${encodeURIComponent(activeId)}`,{method:"PUT",body:JSON.stringify(bodyPix)});
  if(result.status===409){const query=await reconcile(client,access,activeId);if(query.ok)return Response.json({ok:true,reused:true,payout:query.settled,providerStatus:String(query.data?.status??"")});result=query;}
  if(result.ok){const status=String(result.data?.status??"EM_PROCESSAMENTO").toUpperCase();const settled=await sync(activeId,status,String(result.data?.e2eId??result.data?.endToEndId??"")||null,result.data,status==="NAO_REALIZADO"?providerError(result.data):null);return Response.json({ok:true,payout:settled,providerStatus:status},{status:status==="REALIZADO"?200:202});}
  const err=providerError(result.data);
  if([400,404,422].includes(result.status)){const settled=await sync(activeId,"NAO_REALIZADO",null,result.data,err);return Response.json({error:"EFI_PAYOUT_REJECTED",providerStatus:result.status,payout:settled},{status:409});}
  const uncertain=await sync(activeId,"UNKNOWN",null,result.data,err);return Response.json({ok:false,error:"EFI_PAYOUT_CONFIRMATION_PENDING",uncertain:true,payout:uncertain,providerStatus:result.status},{status:202});
 }catch(e:any){const msg=String(e?.message??"EFI_PAYOUT_FAILED");if(activeId&&!msg.startsWith("EFI_OAUTH_")){try{await sync(activeId,"UNKNOWN",null,null,msg.slice(0,500));}catch{}}
  return Response.json({error:msg.startsWith("EFI_OAUTH_")?"EFI_AUTH_FAILED":"EFI_PAYOUT_FAILED"},{status:502});
 }finally{client?.close();}
})};
