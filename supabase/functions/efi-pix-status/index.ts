import { withSupabase } from "npm:@supabase/server@1.4.1";
const required=(name:string)=>{const v=Deno.env.get(name);if(!v)throw new Error(`MISSING_SECRET_${name}`);return v;};
const baseUrl=()=>Deno.env.get("EFI_PIX_SANDBOX")==="false"?"https://pix.api.efipay.com.br":"https://pix-h.api.efipay.com.br";
function decodeB64(name:string){const value=Deno.env.get(name);if(!value)return null;try{const binary=atob(value.trim());const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));return new TextDecoder().decode(bytes);}catch{throw new Error(`INVALID_SECRET_${name}`)}}
function tlsSecret(pemName:string,b64Name:string){return decodeB64(b64Name)??required(pemName);}
function httpClient(){return Deno.createHttpClient({cert:tlsSecret("EFI_PIX_CERT_PEM","EFI_PIX_CERT_B64"),key:tlsSecret("EFI_PIX_KEY_PEM","EFI_PIX_KEY_B64")});}
async function token(client:Deno.HttpClient){const id=required("EFI_PIX_CLIENT_ID"),secret=required("EFI_PIX_CLIENT_SECRET");const res=await fetch(`${baseUrl()}/oauth/token`,{method:"POST",headers:{Authorization:`Basic ${btoa(`${id}:${secret}`)}`,"Content-Type":"application/json"},body:JSON.stringify({grant_type:"client_credentials"}),client} as any);const data=await res.json();if(!res.ok||!data.access_token)throw new Error(`EFI_OAUTH_${res.status}`);return String(data.access_token);}
export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});let body:any;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
 const orderId=String(body?.orderId??"");if(!orderId)return Response.json({error:"ORDER_REQUIRED"},{status:400});
 const{data:order}=await ctx.supabaseAdmin.from("orders").select("id,customer_id,payment_status").eq("id",orderId).maybeSingle();const role=String(ctx.userClaims!.appMetadata?.clickfood_role??"");
 if(!order||(!["SUPER_ADMIN","ADMIN"].includes(role)&&order.customer_id!==ctx.userClaims!.id))return Response.json({error:"ORDER_NOT_FOUND"},{status:404});
 const{data:charge}=await ctx.supabaseAdmin.from("efi_pix_charges").select("txid,status,brcode,expires_at").eq("order_id",orderId).maybeSingle();if(!charge)return Response.json({error:"EFI_PIX_CHARGE_NOT_FOUND"},{status:404});
 if(order.payment_status==="PAID"||charge.status==="PAID")return Response.json({paid:true,charge});
 let client:Deno.HttpClient|undefined;try{client=httpClient();const access=await token(client);const res=await fetch(`${baseUrl()}/v2/cob/${encodeURIComponent(charge.txid)}`,{headers:{Authorization:`Bearer ${access}`},client} as any);const data=await res.json();if(!res.ok)return Response.json({error:"EFI_STATUS_FAILED"},{status:502});
  if(String(data?.status)==="CONCLUIDA"&&Array.isArray(data?.pix)&&data.pix.length){const pix=data.pix[0];const value=Number(String(pix?.valor??"0").replace(",","."));const paidAt=pix?.horario?new Date(pix.horario).toISOString():new Date().toISOString();const{error}=await ctx.supabaseAdmin.rpc("complete_efi_pix_payment_atomic",{p_txid:charge.txid,p_end_to_end_id:String(pix?.endToEndId??"")||null,p_paid_amount:value,p_paid_at:paidAt,p_payload:pix});if(error)return Response.json({error:String(error.message).includes("AMOUNT_MISMATCH")?"EFI_PIX_AMOUNT_MISMATCH":"PAYMENT_CONFIRMATION_FAILED"},{status:409});return Response.json({paid:true,status:"CONCLUIDA"});}
  return Response.json({paid:false,status:String(data?.status??charge.status),charge});
 }catch{return Response.json({error:"EFI_STATUS_FAILED"},{status:502})}finally{client?.close();}
})};