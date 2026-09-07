import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body={storeId?:string};
type MatrixAllowed={cash:boolean;pix:boolean;creditCardOnline:boolean;cardOnDelivery:boolean;debitCardOnDelivery:boolean};
type StoreEnabled=MatrixAllowed;
const empty:MatrixAllowed={cash:false,pix:false,creditCardOnline:false,cardOnDelivery:false,debitCardOnDelivery:false};

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
  if(req.method!=="POST"&&req.method!=="GET")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
  let body:Body={};
  if(req.method==="POST"){try{body=await req.json()}catch{body={};}}

  const{data,error}=await ctx.supabaseAdmin.from("payment_provider_configs").select("provider,supported_methods,environment,enabled,credentials_configured").eq("enabled",true).eq("credentials_configured",true);
  if(error)return Response.json({error:"PAYMENT_CONFIG_LOOKUP_FAILED"},{status:500});
  const providers=data??[];
  const productionProviders=providers.filter((row:any)=>["EFI","EFI_BANK"].includes(String(row.provider))&&String(row.environment)==="PRODUCTION");
  const globalPixEnabled=productionProviders.some((row:any)=>(row.supported_methods??[]).map(String).includes("PIX"))&&Deno.env.get("EFI_PIX_SANDBOX")==="false";
  const accountId=Deno.env.get("EFI_ACCOUNT_ID")?.trim()??"";
  const globalCardEnabled=productionProviders.some((row:any)=>(row.supported_methods??[]).map(String).includes("CREDIT_CARD"))&&!!accountId;

  let matrixAllowed:MatrixAllowed|null=null;
  let storeEnabled:StoreEnabled|null=null;
  if(body.storeId){
    const[{data:permission,error:permissionError},{data:settings,error:settingsError}]=await Promise.all([
      ctx.supabaseAdmin.from("store_payment_permissions").select("cash_allowed,pix_allowed,credit_card_online_allowed,card_on_delivery_allowed,debit_card_on_delivery_allowed").eq("store_id",body.storeId).maybeSingle(),
      ctx.supabaseAdmin.from("store_payment_methods").select("cash_enabled,pix_enabled,credit_card_online_enabled,card_on_delivery_enabled,debit_card_on_delivery_enabled").eq("store_id",body.storeId).maybeSingle(),
    ]);
    if(permissionError)return Response.json({error:"MATRIX_PAYMENT_PERMISSION_LOOKUP_FAILED"},{status:500});
    if(settingsError)return Response.json({error:"STORE_PAYMENT_CONFIG_LOOKUP_FAILED"},{status:500});
    matrixAllowed=permission?{
      cash:Boolean(permission.cash_allowed),pix:Boolean(permission.pix_allowed),creditCardOnline:Boolean(permission.credit_card_online_allowed),cardOnDelivery:Boolean(permission.card_on_delivery_allowed),debitCardOnDelivery:Boolean(permission.debit_card_on_delivery_allowed),
    }:{...empty};
    storeEnabled=settings?{
      cash:Boolean(settings.cash_enabled),pix:Boolean(settings.pix_enabled),creditCardOnline:Boolean(settings.credit_card_online_enabled),cardOnDelivery:Boolean(settings.card_on_delivery_enabled),debitCardOnDelivery:Boolean(settings.debit_card_on_delivery_enabled),
    }:{...empty};
  }

  const effective={
    cash:body.storeId?Boolean(matrixAllowed?.cash&&storeEnabled?.cash):true,
    pix:body.storeId?Boolean(matrixAllowed?.pix&&storeEnabled?.pix&&globalPixEnabled):globalPixEnabled,
    creditCardOnline:body.storeId?Boolean(matrixAllowed?.creditCardOnline&&storeEnabled?.creditCardOnline&&globalCardEnabled):globalCardEnabled,
    cardOnDelivery:body.storeId?Boolean(matrixAllowed?.cardOnDelivery&&storeEnabled?.cardOnDelivery):false,
    debitCardOnDelivery:body.storeId?Boolean(matrixAllowed?.debitCardOnDelivery&&storeEnabled?.debitCardOnDelivery):false,
  };
  const methods:string[]=[];
  if(effective.cash)methods.push("CASH");
  if(effective.pix)methods.push("PIX");
  if(effective.creditCardOnline)methods.push("CREDIT_CARD");
  if(effective.cardOnDelivery)methods.push("CARD_ON_DELIVERY");
  if(effective.debitCardOnDelivery)methods.push("DEBIT_CARD_ON_DELIVERY");

  return Response.json({
    storeId:body.storeId??null,
    methods,
    governance:body.storeId?{matrixAllowed,storeEnabled,effective}:null,
    providers:providers.map((row:any)=>({provider:row.provider,methods:row.supported_methods,environment:row.environment})),
    cardTokenization:methods.includes("CREDIT_CARD")&&globalCardEnabled?{provider:"EFI",accountId,environment:"production",brands:["visa","mastercard","amex","elo"]}:null,
    pixProductionReady:globalPixEnabled,
    cardProductionReady:globalCardEnabled,
  });
})};
