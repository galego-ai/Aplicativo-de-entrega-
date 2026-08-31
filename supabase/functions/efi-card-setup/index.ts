import { withSupabase } from "npm:@supabase/server@1.4.1";

const env=(name:string)=>Deno.env.get(name)?.trim()||"";
const base=()=>env("EFI_PIX_SANDBOX")==="false"
  ?"https://cobrancas.api.efipay.com.br"
  :"https://cobrancas-h.api.efipay.com.br";

function credentials(){
  const chargesId=env("EFI_CHARGES_CLIENT_ID");
  const chargesSecret=env("EFI_CHARGES_CLIENT_SECRET");
  return {
    id:chargesId||env("EFI_PIX_CLIENT_ID"),
    secret:chargesSecret||env("EFI_PIX_CLIENT_SECRET"),
    source:chargesId&&chargesSecret?"CHARGES":"PIX_FALLBACK",
  };
}

async function authorize(){
  const credentialsValue=credentials();
  if(!credentialsValue.id||!credentialsValue.secret){
    return {ok:false as const,error:"EFI_CHARGES_CREDENTIALS_REQUIRED",credentialSource:credentialsValue.source};
  }
  try{
    const response=await fetch(`${base()}/v1/authorize`,{
      method:"POST",
      headers:{
        Authorization:`Basic ${btoa(`${credentialsValue.id}:${credentialsValue.secret}`)}`,
        "Content-Type":"application/json",
      },
      body:JSON.stringify({grant_type:"client_credentials"}),
    });
    let data:any={};
    try{data=await response.json();}catch{}
    if(!response.ok||!data?.access_token){
      return {
        ok:false as const,
        error:response.status===401?"EFI_CHARGES_OAUTH_401":`EFI_CHARGES_OAUTH_${response.status}`,
        providerStatus:response.status,
        credentialSource:credentialsValue.source,
      };
    }
    return {ok:true as const,accessToken:String(data.access_token),credentialSource:credentialsValue.source};
  }catch{
    return {ok:false as const,error:"EFI_CHARGES_NETWORK_FAILED",credentialSource:credentialsValue.source};
  }
}

export default {
  fetch:withSupabase({auth:"user"},async(req,ctx)=>{
    if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
    const role=String(ctx.userClaims!.appMetadata?.clickfood_role??"");
    if(!["SUPER_ADMIN","ADMIN"].includes(role))return Response.json({error:"ADMIN_REQUIRED"},{status:403});

    const accountId=env("EFI_ACCOUNT_ID");
    if(!accountId){
      return Response.json({ok:false,error:"EFI_ACCOUNT_ID_REQUIRED",stage:"ACCOUNT_ID"});
    }

    const authorization=await authorize();
    if(!authorization.ok){
      return Response.json({ok:false,...authorization,stage:"OAUTH"});
    }

    let installments:Response;
    try{
      installments=await fetch(`${base()}/v1/installments?brand=visa&total=1000`,{
        headers:{Authorization:`Bearer ${authorization.accessToken}`},
      });
    }catch{
      return Response.json({ok:false,error:"EFI_CHARGES_API_NETWORK_FAILED",stage:"INSTALLMENTS",credentialSource:authorization.credentialSource});
    }

    if(!installments.ok){
      return Response.json({
        ok:false,
        error:installments.status===403?"EFI_CHARGES_API_SCOPE_REQUIRED":"EFI_CHARGES_API_VALIDATION_FAILED",
        providerStatus:installments.status,
        stage:"INSTALLMENTS",
        credentialSource:authorization.credentialSource,
      });
    }

    const{data:config,error:configError}=await ctx.supabaseAdmin
      .from("payment_provider_configs")
      .select("id,supported_methods")
      .eq("provider","EFI")
      .maybeSingle();
    if(configError||!config)return Response.json({ok:false,error:"EFI_PROVIDER_CONFIG_MISSING",stage:"DATABASE"});

    const methods=[...new Set([...(config.supported_methods??[]),"PIX","CREDIT_CARD"])];
    const update=await ctx.supabaseAdmin.from("payment_provider_configs").update({
      enabled:true,
      credentials_configured:true,
      supported_methods:methods,
      notes:"Efí PIX + cartão validados; dados sensíveis somente em Secrets",
      updated_at:new Date().toISOString(),
    }).eq("id",config.id);
    if(update.error)return Response.json({ok:false,error:"EFI_PROVIDER_UPDATE_FAILED",stage:"DATABASE"});

    await ctx.supabaseAdmin.from("audit_logs").insert({
      actor_id:ctx.userClaims!.id,
      action:"EFI_CARD_ENABLED",
      entity_type:"payment_provider",
      entity_id:config.id,
      after_data:{
        environment:env("EFI_PIX_SANDBOX")==="false"?"PRODUCTION":"SANDBOX",
        methods,
        credentialSource:authorization.credentialSource,
      },
    });

    return Response.json({
      ok:true,
      environment:env("EFI_PIX_SANDBOX")==="false"?"PRODUCTION":"SANDBOX",
      creditCardEnabled:true,
      credentialSource:authorization.credentialSource,
      tokenization:{accountConfigured:true},
    });
  }),
};
