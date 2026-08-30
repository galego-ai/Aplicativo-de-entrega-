import { withSupabase } from "npm:@supabase/server@1.4.1";

const required=(name:string)=>{const v=Deno.env.get(name);if(!v)throw new Error(`MISSING_${name}`);return v;};
const baseUrl=()=>Deno.env.get("EFI_PIX_SANDBOX")==="false"?"https://pix.api.efipay.com.br":"https://pix-h.api.efipay.com.br";
function decodeB64(name:string){const value=Deno.env.get(name);if(!value)return null;const binary=atob(value.trim());return new TextDecoder().decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));}
function tlsSecret(pemName:string,b64Name:string){return decodeB64(b64Name)??required(pemName);}
function client(){return Deno.createHttpClient({cert:tlsSecret("EFI_PIX_CERT_PEM","EFI_PIX_CERT_B64"),key:tlsSecret("EFI_PIX_KEY_PEM","EFI_PIX_KEY_B64")});}
async function oauth(http:Deno.HttpClient){const id=required("EFI_PIX_CLIENT_ID"),secret=required("EFI_PIX_CLIENT_SECRET");const r=await fetch(`${baseUrl()}/oauth/token`,{method:"POST",headers:{Authorization:`Basic ${btoa(`${id}:${secret}`)}`,"Content-Type":"application/json"},body:JSON.stringify({grant_type:"client_credentials"}),client:http} as any);let d:any={};try{d=await r.json()}catch{}if(!r.ok||!d.access_token)throw new Error(`OAUTH_${r.status}`);return String(d.access_token);}
async function api(http:Deno.HttpClient,access:string,path:string,init:RequestInit={}){const r=await fetch(`${baseUrl()}${path}`,{...init,headers:{Authorization:`Bearer ${access}`,"Content-Type":"application/json",...(init.headers??{})},client:http} as any);const t=await r.text();let d:any={};try{d=t?JSON.parse(t):{}}catch{}return{ok:r.ok,status:r.status,data:d};}

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({ok:false,error:"METHOD_NOT_ALLOWED"},{status:405});
 const role=String(ctx.userClaims!.appMetadata?.clickfood_role??"");
 if(!["SUPER_ADMIN","ADMIN"].includes(role))return Response.json({ok:false,error:"ADMIN_REQUIRED"},{status:403});
 let http:Deno.HttpClient|undefined;
 try{
  http=client();const access=await oauth(http);const pixKey=required("EFI_PIX_KEY");
  const webhook=await api(http,access,`/v2/webhook/${encodeURIComponent(pixKey)}`,{method:"GET"});
  const webhookRegistered=webhook.ok&&typeof webhook.data?.webhookUrl==="string"&&webhook.data.webhookUrl.includes("/functions/v1/efi-pix-webhook");
  const txid=`CFVALID${Date.now()}${crypto.randomUUID().replaceAll("-","").slice(0,8)}`.slice(0,35);
  const create=await api(http,access,`/v2/cob/${txid}`,{method:"PUT",body:JSON.stringify({calendario:{expiracao:120},valor:{original:"1.00"},chave:pixKey,solicitacaoPagador:"CLICK-FOOD validacao externa homologacao"})});
  if(!create.ok)return Response.json({ok:false,stage:"CHARGE_CREATE",environment:Deno.env.get("EFI_PIX_SANDBOX")==="false"?"PRODUCTION":"SANDBOX",oauth:true,webhookRead:webhook.ok,webhookRegistered,providerStatus:create.status},{status:502});
  const read=await api(http,access,`/v2/cob/${txid}`,{method:"GET"});
  const locId=Number(create.data?.loc?.id??0);let qr={ok:false,status:0,data:{}} as any;if(locId)qr=await api(http,access,`/v2/loc/${locId}/qrcode`,{method:"GET"});
  const result={ok:webhook.ok&&webhookRegistered&&create.ok&&read.ok&&qr.ok,environment:Deno.env.get("EFI_PIX_SANDBOX")==="false"?"PRODUCTION":"SANDBOX",oauth:true,webhookRead:webhook.ok,webhookRegistered,chargeCreated:create.ok,chargeConsulted:read.ok,qrCodeGenerated:qr.ok,chargeStatus:String(read.data?.status??create.data?.status??""),txid,expiresInSeconds:120};
  await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:ctx.userClaims!.id,action:"EFI_EXTERNAL_VALIDATION",entity_type:"payment_provider_config",after_data:result});
  return Response.json(result);
 }catch(e:any){const msg=String(e?.message??"VALIDATION_FAILED");return Response.json({ok:false,error:msg.startsWith("OAUTH_")?msg:msg.startsWith("MISSING_")?msg:"VALIDATION_FAILED"},{status:502});}finally{http?.close();}
})};
