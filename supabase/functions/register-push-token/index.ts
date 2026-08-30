import { withSupabase } from "npm:@supabase/server@1.4.1";

type RegisterBody={action?:"REGISTER";token:string;app:"CUSTOMER"|"DRIVER"|"STORE"|"ADMIN";platform:"ANDROID"|"IOS"|"WEB"|"UNKNOWN";deviceId?:string;appIdentifier?:string};
type DisableBody={action:"DISABLE";token:string};
type Body=RegisterBody|DisableBody;

const tokenPattern=/^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/;

export default {fetch:withSupabase({auth:"user"},async(req,ctx)=>{
  if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
  let body:Body;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
  const userId=ctx.userClaims!.id;
  const token=String(body.token??"").trim();
  if(!tokenPattern.test(token))return Response.json({error:"INVALID_EXPO_PUSH_TOKEN"},{status:400});

  if(body.action==="DISABLE"){
    const{error}=await ctx.supabaseAdmin.from("device_push_tokens").update({enabled:false,updated_at:new Date().toISOString()}).eq("token",token).eq("user_id",userId);
    if(error)return Response.json({error:"TOKEN_DISABLE_FAILED"},{status:500});
    return Response.json({ok:true});
  }

  const app=(body as RegisterBody).app;
  const platform=(body as RegisterBody).platform;
  if(!["CUSTOMER","DRIVER","STORE","ADMIN"].includes(app)||!["ANDROID","IOS","WEB","UNKNOWN"].includes(platform))return Response.json({error:"INVALID_DEVICE_METADATA"},{status:400});
  const now=new Date().toISOString();
  const{data,error}=await ctx.supabaseAdmin.from("device_push_tokens").upsert({
    user_id:userId,
    app,
    platform,
    provider:"EXPO",
    token,
    device_id:(body as RegisterBody).deviceId?.slice(0,160)||null,
    app_identifier:(body as RegisterBody).appIdentifier?.slice(0,160)||null,
    enabled:true,
    last_seen_at:now,
    updated_at:now,
  },{onConflict:"token"}).select("id,app,platform,enabled,last_seen_at").single();
  if(error)return Response.json({error:"TOKEN_REGISTER_FAILED",detail:error.message},{status:500});
  return Response.json({token:data});
})};