import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body={storeId:string;action?:"STATUS"|"SET";paused?:boolean};

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
  if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
  let body:Body;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
  if(!body.storeId)return Response.json({error:"INVALID_STORE"},{status:400});

  const action=body.action??"STATUS";
  const actor=ctx.userClaims!.id;
  const platformRole=String(ctx.userClaims!.appMetadata?.clickfood_role??"");
  const isAdmin=["SUPER_ADMIN","ADMIN"].includes(platformRole);
  let membershipRole:string|null=null;

  if(!isAdmin){
    const{data:membership,error}=await ctx.supabaseAdmin.from("store_memberships").select("role").eq("store_id",body.storeId).eq("user_id",actor).eq("active",true).maybeSingle();
    if(error)return Response.json({error:"MEMBERSHIP_LOOKUP_FAILED"},{status:500});
    if(!membership)return Response.json({error:"STORE_ACCESS_DENIED"},{status:403});
    membershipRole=String(membership.role);
  }

  const canManage=isAdmin||["OWNER","MANAGER"].includes(membershipRole??"");

  if(action==="SET"){
    if(typeof body.paused!=="boolean")return Response.json({error:"INVALID_PAUSE_STATE"},{status:400});
    if(!canManage)return Response.json({error:"STORE_ACCESS_DENIED"},{status:403});
    const{data:store,error}=await ctx.supabaseAdmin.from("stores").update({orders_paused:body.paused}).eq("id",body.storeId).select("id,name,status,orders_paused").maybeSingle();
    if(error)return Response.json({error:"STORE_PAUSE_UPDATE_FAILED"},{status:500});
    if(!store)return Response.json({error:"STORE_NOT_FOUND"},{status:404});
    await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:actor,action:body.paused?"STORE_ORDERS_PAUSED":"STORE_ORDERS_RESUMED",entity_type:"store",entity_id:body.storeId,after_data:{orders_paused:body.paused}});
    const{data:effectiveOpen,error:openError}=await ctx.supabaseAdmin.rpc("store_is_open",{p_store_id:body.storeId});
    if(openError)return Response.json({error:"STORE_OPEN_STATUS_FAILED"},{status:500});
    return Response.json({store:{...store,effective_open:Boolean(effectiveOpen)},canManage});
  }

  if(action!=="STATUS")return Response.json({error:"INVALID_ACTION"},{status:400});
  const{data:store,error}=await ctx.supabaseAdmin.from("stores").select("id,name,status,orders_paused").eq("id",body.storeId).maybeSingle();
  if(error)return Response.json({error:"STORE_LOOKUP_FAILED"},{status:500});
  if(!store)return Response.json({error:"STORE_NOT_FOUND"},{status:404});
  const{data:effectiveOpen,error:openError}=await ctx.supabaseAdmin.rpc("store_is_open",{p_store_id:body.storeId});
  if(openError)return Response.json({error:"STORE_OPEN_STATUS_FAILED"},{status:500});
  return Response.json({store:{...store,effective_open:Boolean(effectiveOpen)},canManage});
})};
