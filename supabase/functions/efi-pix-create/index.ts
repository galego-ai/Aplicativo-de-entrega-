import { withSupabase } from "npm:@supabase/server@1.4.1";

const required=(name:string)=>{const v=Deno.env.get(name)?.trim();if(!v)throw new Error(`MISSING_SECRET_${name}`);return v;};
const baseUrl=()=>Deno.env.get("EFI_PIX_SANDBOX")==="false"?"https://pix.api.efipay.com.br":"https://pix-h.api.efipay.com.br";

function decodeB64(name:string){
  const value=Deno.env.get(name)?.trim();
  if(!value)return null;
  try{
    const binary=atob(value);
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }catch{throw new Error(`INVALID_SECRET_${name}`);}
}

function tlsSecret(pemName:string,b64Name:string){return decodeB64(b64Name)??required(pemName);}
function httpClient(){
  const cert=tlsSecret("EFI_PIX_CERT_PEM","EFI_PIX_CERT_B64");
  const key=tlsSecret("EFI_PIX_KEY_PEM","EFI_PIX_KEY_B64");
  if(!cert.includes("BEGIN CERTIFICATE")||!key.includes("PRIVATE KEY"))throw new Error("EFI_MTLS_INVALID");
  try{return Deno.createHttpClient({cert,key});}catch{throw new Error("EFI_MTLS_INVALID");}
}

async function token(client:Deno.HttpClient){
  const id=required("EFI_PIX_CLIENT_ID"),secret=required("EFI_PIX_CLIENT_SECRET");
  let res:Response;
  try{
    res=await fetch(`${baseUrl()}/oauth/token`,{method:"POST",headers:{Authorization:`Basic ${btoa(`${id}:${secret}`)}`,"Content-Type":"application/json"},body:JSON.stringify({grant_type:"client_credentials"}),client} as any);
  }catch{throw new Error("EFI_OAUTH_NETWORK_FAILED");}
  let data:any={};try{data=await res.json();}catch{}
  if(!res.ok||!data.access_token)throw new Error(`EFI_OAUTH_${res.status}`);
  return String(data.access_token);
}

async function api(client:Deno.HttpClient,access:string,path:string,init:RequestInit={}){
  let res:Response;
  try{
    res=await fetch(`${baseUrl()}${path}`,{...init,headers:{Authorization:`Bearer ${access}`,"Content-Type":"application/json",...(init.headers??{})},client} as any);
  }catch{throw new Error("EFI_API_NETWORK_FAILED");}
  const text=await res.text();let data:any={};try{data=text?JSON.parse(text):{}}catch{data={};}
  if(!res.ok){const e:any=new Error(`EFI_API_${res.status}`);e.payload=data;throw e;}
  return data;
}

function safeReason(error:any){
  const code=String(error?.message??"EFI_ERROR");
  if(code.startsWith("MISSING_SECRET_")||code.startsWith("INVALID_SECRET_"))return "EFI_CONFIGURATION_ERROR";
  if(code.startsWith("EFI_MTLS_"))return "EFI_CERTIFICATE_ERROR";
  if(code.startsWith("EFI_OAUTH_"))return "EFI_AUTHENTICATION_ERROR";
  if(code.startsWith("EFI_API_"))return "EFI_PROVIDER_ERROR";
  if(code==="EFI_LOCATION_MISSING"||code==="EFI_QRCODE_MISSING")return code;
  return "EFI_PIX_CREATE_FAILED";
}

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
  if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
  let body:any;try{body=await req.json();}catch{return Response.json({error:"INVALID_JSON"},{status:400});}
  const orderId=String(body?.orderId??"");if(!orderId)return Response.json({error:"ORDER_REQUIRED"},{status:400});

  const{data:config}=await ctx.supabaseAdmin.from("payment_provider_configs").select("enabled,credentials_configured,environment").eq("provider","EFI").maybeSingle();
  if(!config?.enabled||!config?.credentials_configured)return Response.json({error:"EFI_NOT_ENABLED"},{status:409});

  const{data:order}=await ctx.supabaseAdmin.from("orders").select("id,order_number,customer_id,total,status,payment_status").eq("id",orderId).maybeSingle();
  if(!order||order.customer_id!==ctx.userClaims!.id)return Response.json({error:"ORDER_NOT_FOUND"},{status:404});
  if(order.payment_status==="PAID")return Response.json({error:"ORDER_ALREADY_PAID"},{status:409});
  if(order.status!=="PENDING_PAYMENT")return Response.json({error:"ORDER_NOT_WAITING_PAYMENT"},{status:409});

  const{data:payment}=await ctx.supabaseAdmin.from("payments").select("id,amount,status,method").eq("order_id",orderId).eq("method","PIX").order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(!payment)return Response.json({error:"PIX_PAYMENT_NOT_FOUND"},{status:409});

  const{data:existing}=await ctx.supabaseAdmin.from("efi_pix_charges").select("txid,brcode,qr_image,visualization_url,status,expires_at").eq("payment_id",payment.id).maybeSingle();
  if(existing?.status==="ACTIVE"&&new Date(existing.expires_at).getTime()>Date.now()&&String(existing.brcode??"").trim())return Response.json({charge:existing,reused:true});

  const txid=String(payment.id).replaceAll("-","").slice(0,35);
  const expiration=900;
  const amount=Number(payment.amount).toFixed(2);
  let client:Deno.HttpClient|undefined;

  try{
    const pixKey=required("EFI_PIX_KEY");
    client=httpClient();
    const access=await token(client);
    const cob=await api(client,access,`/v2/cob/${encodeURIComponent(txid)}`,{method:"PUT",body:JSON.stringify({calendario:{expiracao:expiration},valor:{original:amount},chave:pixKey,solicitacaoPagador:`CLICK-FOOD pedido #${order.order_number}`})});
    const locId=Number(cob?.loc?.id??0);if(!locId)throw new Error("EFI_LOCATION_MISSING");

    const qr=await api(client,access,`/v2/loc/${locId}/qrcode`,{method:"GET"});
    const brcode=String(qr?.qrcode??"").trim();
    if(!brcode)throw new Error("EFI_QRCODE_MISSING");

    const expiresAt=new Date(Date.now()+expiration*1000).toISOString();
    const row={
      order_id:order.id,payment_id:payment.id,txid,location_id:locId,
      location_url:cob?.loc?.location??null,brcode,
      qr_image:typeof qr?.imagemQrcode==="string"?qr.imagemQrcode:null,
      visualization_url:typeof qr?.linkVisualizacao==="string"?qr.linkVisualizacao:null,
      status:"ACTIVE",amount:Number(payment.amount),expires_at:expiresAt,
      provider_payload:{cob:{status:cob?.status,calendario:cob?.calendario,loc:cob?.loc}},
    };

    const{data:charge,error}=await ctx.supabaseAdmin.from("efi_pix_charges").upsert(row,{onConflict:"payment_id"}).select("txid,brcode,qr_image,visualization_url,status,expires_at").single();
    if(error||!charge?.brcode)throw new Error("EFI_QRCODE_PERSIST_FAILED");

    await ctx.supabaseAdmin.from("payments").update({provider:"EFI",status:"PROCESSING",provider_transaction_id:txid}).eq("id",payment.id);
    await ctx.supabaseAdmin.from("payment_attempts").insert({payment_id:payment.id,request_reference:txid,status:"CREATED",provider_payload:{locationId:locId,environment:config.environment,hasBrcode:true}});
    return Response.json({charge,reused:false},{status:201});
  }catch(e:any){
    try{await ctx.supabaseAdmin.from("payment_attempts").insert({payment_id:payment.id,request_reference:txid,status:"FAILED",error_code:String(e?.message??"EFI_ERROR").slice(0,120),error_message:"Falha ao gerar cobrança PIX Efí",provider_payload:e?.payload??null});}catch{}
    return Response.json({error:"EFI_PIX_CREATE_FAILED",reason:safeReason(e)},{status:502});
  }finally{client?.close();}
})};
