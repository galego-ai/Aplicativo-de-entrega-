import { withSupabase } from "npm:@supabase/server@1.4.1";

const required=(name:string)=>{const v=Deno.env.get(name);if(!v)throw new Error(`MISSING_SECRET_${name}`);return v;};
const baseUrl=()=>Deno.env.get("EFI_PIX_SANDBOX")==="false"?"https://pix.api.efipay.com.br":"https://pix-h.api.efipay.com.br";

function decodeB64(name:string){
  const value=Deno.env.get(name);
  if(!value)return null;
  try{
    const binary=atob(value.trim());
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }catch{
    throw new Error(`INVALID_SECRET_${name}`);
  }
}

function tlsSecret(pemName:string,b64Name:string){return decodeB64(b64Name)??required(pemName);}

function tlsMaterial(){
  const cert=tlsSecret("EFI_PIX_CERT_PEM","EFI_PIX_CERT_B64");
  const key=tlsSecret("EFI_PIX_KEY_PEM","EFI_PIX_KEY_B64");
  if(!cert.includes("-----BEGIN CERTIFICATE-----")||!cert.includes("-----END CERTIFICATE-----"))throw new Error("EFI_MTLS_CERT_INVALID");
  if(!/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(key)||!key.includes("-----END"))throw new Error("EFI_MTLS_KEY_INVALID");
  return {cert,key};
}

function httpClient(){
  const {cert,key}=tlsMaterial();
  try{return Deno.createHttpClient({cert,key});}
  catch{throw new Error("EFI_MTLS_PAIR_INVALID");}
}

async function token(client:Deno.HttpClient){
  const id=required("EFI_PIX_CLIENT_ID"),secret=required("EFI_PIX_CLIENT_SECRET");
  let res:Response;
  try{
    res=await fetch(`${baseUrl()}/oauth/token`,{method:"POST",headers:{Authorization:`Basic ${btoa(`${id}:${secret}`)}`,"Content-Type":"application/json"},body:JSON.stringify({grant_type:"client_credentials"}),client} as any);
  }catch(e:any){
    const m=String(e?.message??"").toLowerCase();
    if(m.includes("certificate")||m.includes("tls")||m.includes("ssl")||m.includes("handshake"))throw new Error("EFI_MTLS_CONNECTION_FAILED");
    throw new Error("EFI_OAUTH_NETWORK_FAILED");
  }
  let data:any={};try{data=await res.json()}catch{}
  if(!res.ok||!data.access_token)throw new Error(`EFI_OAUTH_${res.status}`);
  return String(data.access_token);
}

function safeError(e:any){
  const msg=String(e?.message??"EFI_SETUP_FAILED");
  if(
    msg.startsWith("MISSING_SECRET_")||
    msg.startsWith("INVALID_SECRET_")||
    msg.startsWith("EFI_OAUTH_")||
    msg.startsWith("EFI_MTLS_")||
    msg.startsWith("EFI_WEBHOOK_")
  )return msg;
  return "EFI_SETUP_FAILED";
}

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
  if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
  const role=String(ctx.userClaims!.appMetadata?.clickfood_role??"");
  if(!["SUPER_ADMIN","ADMIN"].includes(role))return Response.json({error:"ADMIN_REQUIRED"},{status:403});

  try{
    const pixKey=required("EFI_PIX_KEY");
    const hmac=required("EFI_WEBHOOK_HMAC");
    const projectUrl=required("SUPABASE_URL");
    const webhookUrl=`${projectUrl}/functions/v1/efi-pix-webhook?hmac=${encodeURIComponent(hmac)}&ignorar=`;
    let client:Deno.HttpClient|undefined;
    try{
      client=httpClient();
      const access=await token(client);
      let res:Response;
      try{
        res=await fetch(`${baseUrl()}/v2/webhook/${encodeURIComponent(pixKey)}`,{method:"PUT",headers:{Authorization:`Bearer ${access}`,"Content-Type":"application/json","x-skip-mtls-checking":"true"},body:JSON.stringify({webhookUrl}),client} as any);
      }catch{throw new Error("EFI_WEBHOOK_NETWORK_FAILED");}
      if(!res.ok)return Response.json({ok:false,error:"EFI_WEBHOOK_SETUP_FAILED",providerStatus:res.status});

      const environment=Deno.env.get("EFI_PIX_SANDBOX")==="false"?"PRODUCTION":"SANDBOX";
      await ctx.supabaseAdmin.from("payment_provider_configs").update({environment,credentials_configured:true,enabled:true,notes:"Efí Bank PIX configurado com mTLS e webhook registrado."}).eq("provider","EFI");
      await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:ctx.userClaims!.id,action:"EFI_PIX_CONFIGURED",entity_type:"payment_provider_config",after_data:{provider:"EFI",environment,webhookRegistered:true}});
      return Response.json({ok:true,environment,webhookRegistered:true});
    }finally{client?.close();}
  }catch(e:any){
    return Response.json({ok:false,error:safeError(e)});
  }
})};
