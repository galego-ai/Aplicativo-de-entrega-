import { withSupabase } from "npm:@supabase/server@1.4.1";

type Hour={weekday:number;opens_at:string|null;closes_at:string|null;closed:boolean};
type Body={storeId:string;hours:Hour[]};

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
  if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
  let body:Body;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
  if(!body.storeId||!Array.isArray(body.hours))return Response.json({error:"INVALID_HOURS_REQUEST"},{status:400});
  const actor=ctx.userClaims!.id;
  const platformRole=String(ctx.userClaims!.appMetadata?.clickfood_role??"");
  const isAdmin=["SUPER_ADMIN","ADMIN"].includes(platformRole);
  if(!isAdmin){
    const{data:membership,error}=await ctx.supabaseAdmin.from("store_memberships").select("role").eq("store_id",body.storeId).eq("user_id",actor).eq("active",true).maybeSingle();
    if(error)return Response.json({error:"MEMBERSHIP_LOOKUP_FAILED"},{status:500});
    if(!membership||!["OWNER","MANAGER"].includes(membership.role))return Response.json({error:"STORE_ACCESS_DENIED"},{status:403});
  }
  const normalized=body.hours.map(h=>({weekday:Number(h.weekday),closed:Boolean(h.closed),opens_at:h.closed?null:String(h.opens_at??""),closes_at:h.closed?null:String(h.closes_at??"")}));
  const{data,error}=await ctx.supabaseAdmin.rpc("replace_store_hours_atomic",{p_store_id:body.storeId,p_actor_id:actor,p_hours:normalized});
  if(error){const message=error.message??"";for(const code of ["SEVEN_DAYS_REQUIRED","INVALID_HOURS_ROW","INVALID_OR_DUPLICATE_WEEKDAY","OPEN_AND_CLOSE_REQUIRED","INVALID_TIME_VALUE"])if(message.includes(code))return Response.json({error:code},{status:400});return Response.json({error:"STORE_HOURS_UPDATE_FAILED"},{status:500});}
  await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:actor,action:"STORE_HOURS_UPDATED",entity_type:"store",entity_id:body.storeId,after_data:{hours:normalized}});
  return Response.json({updated:Number(data??0)});
})};