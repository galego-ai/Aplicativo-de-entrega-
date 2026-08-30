import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body={cityId:string;timezone:string};

function validTimeZone(value:string){
  try{new Intl.DateTimeFormat("pt-BR",{timeZone:value}).format(new Date());return value.includes("/")&&value.length<=80;}catch{return false;}
}

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
  if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
  const role=String(ctx.userClaims!.appMetadata?.clickfood_role??"");
  if(!["SUPER_ADMIN","ADMIN"].includes(role))return Response.json({error:"ADMIN_REQUIRED"},{status:403});
  let body:Body;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
  const timezone=body.timezone?.trim();
  if(!body.cityId||!timezone||!validTimeZone(timezone))return Response.json({error:"INVALID_TIMEZONE"},{status:400});
  const{data:city,error}=await ctx.supabaseAdmin.from("cities").update({timezone}).eq("id",body.cityId).select("id,name,state,timezone").maybeSingle();
  if(error)return Response.json({error:"CITY_TIMEZONE_UPDATE_FAILED"},{status:500});
  if(!city)return Response.json({error:"CITY_NOT_FOUND"},{status:404});
  await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:ctx.userClaims!.id,action:"CITY_TIMEZONE_UPDATED",entity_type:"city",entity_id:city.id,after_data:{timezone}});
  return Response.json({city});
})};