import { withSupabase } from "npm:@supabase/server@1.4.1";

const required=(name:string)=>{const v=Deno.env.get(name);if(!v)throw new Error(`MISSING_SECRET_${name}`);return v;};
const baseUrl=()=>Deno.env.get("EFI_PIX_SANDBOX")==="false"?"https://pix.api.efipay.com.br":"https://pix-h.api.efipay.com.br";
function decodeB64(name:string){const value=Deno.env.get(name);if(!value)return null;try{const binary=atob(value.trim());return new TextDecoder().decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));}catch{throw new Error(`INVALID_SECRET_${name}`)}}
function tlsSecret(pemName:string,b64Name:string){return decodeB64(b64Name)??required(pemName);}
function httpClient(){return Deno.createHttpClient({cert:tlsSecret("EFI_PIX_CERT_PEM","EFI_PIX_CERT_B64"),key:tlsSecret("EFI_PIX_KEY_PEM","EFI_PIX_KEY_B64")});}
async function token(client:Deno.HttpClient){
 const id=required("EFI_PIX_CLIENT_ID"),secret=required("EFI_PIX_CLIENT_SECRET");
 const res=await fetch(`${baseUrl()}/oauth/token`,{method:"POST",headers:{Authorization:`Basic ${btoa(`${id}:${secret}`)}`,"Content-Type":"application/json"},body:JSON.stringify({grant_type:"client_credentials"}),client} as any);
 let data:any={};try{data=await res.json()}catch{}
 if(!res.ok||!data.access_token)throw new Error(`EFI_OAUTH_${res.status}`);
 return data;
}
async function api(client:Deno.HttpClient,access:string,path:string){
 const res=await fetch(`${baseUrl()}${path}`,{headers:{Authorization:`Bearer ${access}`},client} as any);
 const text=await res.text();let data:any={};try{data=text?JSON.parse(text):{}}catch{data={raw:text}}
 return{ok:res.ok,status:res.status,data};
}

type Body={action?:"STATUS"|"VALIDATE"|"DISABLE"|"SET_AUTO";automatic?:boolean};

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
 let body:Body={};try{body=await req.json()}catch{}
 const userId=ctx.userClaims!.id;const role=String(ctx.userClaims!.appMetadata?.clickfood_role??"");
 if(!["SUPER_ADMIN","ADMIN"].includes(role))return Response.json({error:"ADMIN_REQUIRED"},{status:403});
 const action=body.action??"STATUS";
 const getConfig=async()=>{const{data}=await ctx.supabaseAdmin.from("payout_provider_configs").select("provider,display_name,environment,enabled,credentials_configured,automatic_processing,validated_at,updated_at").eq("provider","EFI_PIX_SEND").maybeSingle();return data;};
 if(action==="STATUS")return Response.json({config:await getConfig()});
 if(action==="DISABLE"){
  await ctx.supabaseAdmin.from("payout_provider_configs").update({enabled:false,automatic_processing:false,updated_by:userId,updated_at:new Date().toISOString()}).eq("provider","EFI_PIX_SEND");
  return Response.json({config:await getConfig()});
 }
 if(action==="SET_AUTO"){
  const config=await getConfig();if(!config?.enabled||!config?.credentials_configured)return Response.json({error:"EFI_PAYOUT_NOT_VALIDATED"},{status:409});
  await ctx.supabaseAdmin.from("payout_provider_configs").update({automatic_processing:!!body.automatic,updated_by:userId,updated_at:new Date().toISOString()}).eq("provider","EFI_PIX_SEND");
  return Response.json({config:await getConfig()});
 }
 if(action!=="VALIDATE")return Response.json({error:"UNKNOWN_ACTION"},{status:400});
 let client:Deno.HttpClient|undefined;
 try{
  client=httpClient();const auth=await token(client);const scopes=new Set(String(auth.scope??"").split(/\s+/).filter(Boolean));
  const needed=["pix.send","gn.pix.send.read","webhook.read"];const missing=needed.filter(scope=>!scopes.has(scope));
  if(missing.length)return Response.json({error:"EFI_PAYOUT_SCOPES_MISSING",missingScopes:missing},{status:409});
  const pixKey=required("EFI_PIX_KEY");const webhook=await api(client,String(auth.access_token),`/v2/webhook/${encodeURIComponent(pixKey)}`);
  if(!webhook.ok||!webhook.data?.webhookUrl)return Response.json({error:"EFI_PAYOUT_WEBHOOK_NOT_READY",providerStatus:webhook.status},{status:409});
  const environment=Deno.env.get("EFI_PIX_SANDBOX")==="false"?"PRODUCTION":"SANDBOX";
  await ctx.supabaseAdmin.from("payout_provider_configs").upsert({provider:"EFI_PIX_SEND",display_name:"Efí Bank • Envio Pix",environment,enabled:true,credentials_configured:true,validated_at:new Date().toISOString(),updated_by:userId,updated_at:new Date().toISOString()},{onConflict:"provider"});
  await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:userId,action:"EFI_PAYOUT_PROVIDER_VALIDATED",entity_type:"payment_provider",after_data:{provider:"EFI_PIX_SEND",environment,scopes:["pix.send","gn.pix.send.read"],webhookConfigured:true}});
  return Response.json({ok:true,config:await getConfig(),requiredScopesReady:true,webhookConfigured:true});
 }catch(e:any){const message=String(e?.message??"");return Response.json({error:message.startsWith("EFI_OAUTH_")?"EFI_AUTH_FAILED":"EFI_PAYOUT_VALIDATION_FAILED"},{status:502});}finally{client?.close();}
})};
