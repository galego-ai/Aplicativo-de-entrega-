import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body={storeId?:string};

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
  if(req.method!=="POST"&&req.method!=="GET")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
  let body:Body={};
  if(req.method==="POST"){try{body=await req.json()}catch{body={};}}

  const{data,error}=await ctx.supabaseAdmin.from("payment_provider_configs").select("provider,supported_methods,environment,enabled,credentials_configured").eq("enabled",true).eq("credentials_configured",true);
  if(error)return Response.json({error:"PAYMENT_CONFIG_LOOKUP_FAILED"},{status:500});
  const providers=data??[];
  const efiPix=providers.find((row:any)=>String(row.provider)==="EFI");
  const efiCard=providers.find((row:any)=>String(row.provider)==="EFI_BANK"&&String(row.environment)==="PRODUCTION")??providers.find((row:any)=>String(row.provider)==="EFI"&&String(row.environment)==="PRODUCTION");
  const pixMethods=(efiPix?.supported_methods??[]).map((method:any)=>String(method));
  const cardMethods=(efiCard?.supported_methods??[]).map((method:any)=>String(method));
  const accountId=Deno.env.get("EFI_ACCOUNT_ID")?.trim()??"";
  const globalPixEnabled=!!efiPix&&String(efiPix.environment)==="PRODUCTION"&&pixMethods.includes("PIX")&&Deno.env.get("EFI_PIX_SANDBOX")==="false";
  const globalCardEnabled=!!efiCard&&cardMethods.includes("CREDIT_CARD")&&!!accountId;

  let storeConfig:any=null;
  if(body.storeId){
    const{data:row,error:storeError}=await ctx.supabaseAdmin.from("store_payment_methods")
      .select("cash_enabled,pix_enabled,credit_card_online_enabled,card_on_delivery_enabled,debit_card_on_delivery_enabled")
      .eq("store_id",body.storeId).maybeSingle();
    if(storeError)return Response.json({error:"STORE_PAYMENT_CONFIG_LOOKUP_FAILED"},{status:500});
    storeConfig=row??{cash_enabled:true,pix_enabled:false,credit_card_online_enabled:false,card_on_delivery_enabled:false,debit_card_on_delivery_enabled:false};
  }

  const methods:string[]=[];
  if(storeConfig){
    if(storeConfig.cash_enabled)methods.push("CASH");
    if(storeConfig.pix_enabled&&globalPixEnabled)methods.push("PIX");
    if(storeConfig.credit_card_online_enabled&&globalCardEnabled)methods.push("CREDIT_CARD");
    if(storeConfig.card_on_delivery_enabled)methods.push("CARD_ON_DELIVERY");
    if(storeConfig.debit_card_on_delivery_enabled)methods.push("DEBIT_CARD_ON_DELIVERY");
  }else{
    methods.push("CASH");
    if(globalPixEnabled)methods.push("PIX");
    if(globalCardEnabled)methods.push("CREDIT_CARD");
  }

  return Response.json({
    storeId:body.storeId??null,
    methods,
    providers:providers.map((row:any)=>({provider:row.provider,methods:row.supported_methods,environment:row.environment})),
    cardTokenization:methods.includes("CREDIT_CARD")&&globalCardEnabled?{
      provider:"EFI",
      accountId,
      environment:"production",
      brands:["visa","mastercard","amex","elo"],
    }:null,
    pixProductionReady:globalPixEnabled,
    cardProductionReady:globalCardEnabled,
  });
})};
