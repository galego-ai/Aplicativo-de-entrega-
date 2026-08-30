import { withSupabase } from "npm:@supabase/server@1.4.1";

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
  if(req.method!=="POST"&&req.method!=="GET")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});

  const{data}=await ctx.supabaseAdmin.from("payment_provider_configs").select("provider,supported_methods,environment").eq("enabled",true).eq("credentials_configured",true);
  const providers=data??[];
  const efi=providers.find((row:any)=>String(row.provider)==="EFI");
  const efiMethods=(efi?.supported_methods??[]).map((method:any)=>String(method));
  const accountId=Deno.env.get("EFI_ACCOUNT_ID")?.trim()??"";

  // O App Cliente possui execução online implementada somente para a Efí neste momento.
  // Outros gateways podem ser cadastrados na Matriz sem aparecer no checkout até terem
  // um executor próprio, evitando que PIX/cartão de outro provedor seja enviado à Efí.
  const methods:string[]=["CASH"];
  if(efi&&efiMethods.includes("PIX"))methods.push("PIX");
  const cardEnabled=!!efi&&efiMethods.includes("CREDIT_CARD")&&!!accountId;
  if(cardEnabled)methods.push("CREDIT_CARD");

  return Response.json({
    methods,
    providers:providers.map((row:any)=>({provider:row.provider,methods:row.supported_methods})),
    cardTokenization:cardEnabled?{
      provider:"EFI",
      accountId,
      environment:Deno.env.get("EFI_PIX_SANDBOX")==="false"?"production":"sandbox",
      brands:["visa","mastercard","amex","elo"],
    }:null,
  });
})};
