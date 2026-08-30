import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body={action:"LIST"}|{action:"SET_ROLE";userId:string;role:"SUPER_ADMIN"|"ADMIN"|"SUPPORT"|"NONE"}|{action:"SET_STATUS";userId:string;status:"ACTIVE"|"BLOCKED"};
export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});const callerRole=String(ctx.userClaims!.appMetadata?.clickfood_role??"");if(!["SUPER_ADMIN","ADMIN"].includes(callerRole))return Response.json({error:"ADMIN_REQUIRED"},{status:403});let body:Body;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
 if(body.action==="LIST"){
  const{data:authData,error}=await ctx.supabaseAdmin.auth.admin.listUsers({page:1,perPage:1000});if(error)return Response.json({error:"USERS_LOOKUP_FAILED"},{status:500});const ids=(authData.users??[]).map((u:any)=>u.id);const{data:profiles}=ids.length?await ctx.supabaseAdmin.from("profiles").select("id,full_name,phone,status,created_at").in("id",ids):{data:[]};const map=new Map((profiles??[]).map((p:any)=>[p.id,p]));return Response.json({users:(authData.users??[]).map((u:any)=>({id:u.id,email:u.email,created_at:u.created_at,last_sign_in_at:u.last_sign_in_at,role:u.app_metadata?.clickfood_role??"NONE",full_name:(map.get(u.id) as any)?.full_name??"Usuário",phone:(map.get(u.id) as any)?.phone??null,status:(map.get(u.id) as any)?.status??"ACTIVE",banned_until:u.banned_until??null}))});
 }
 if(body.action==="SET_ROLE"){
  if(callerRole!=="SUPER_ADMIN")return Response.json({error:"SUPER_ADMIN_REQUIRED"},{status:403});if(!body.userId)return Response.json({error:"USER_REQUIRED"},{status:400});if(body.userId===ctx.userClaims!.id&&body.role!=="SUPER_ADMIN")return Response.json({error:"CANNOT_DEMOTE_SELF"},{status:409});
  const{data:existing,error:getError}=await ctx.supabaseAdmin.auth.admin.getUserById(body.userId);if(getError||!existing.user)return Response.json({error:"USER_NOT_FOUND"},{status:404});const current={...(existing.user.app_metadata??{})};if(body.role==="NONE")delete current.clickfood_role;else current.clickfood_role=body.role;
  const{data,error}=await ctx.supabaseAdmin.auth.admin.updateUserById(body.userId,{app_metadata:current});if(error)return Response.json({error:"ROLE_UPDATE_FAILED"},{status:500});await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:ctx.userClaims!.id,action:"PLATFORM_ROLE_CHANGED",entity_type:"profile",entity_id:body.userId,after_data:{clickfood_role:body.role}});return Response.json({user:{id:data.user.id,role:body.role}});
 }
 if(body.action==="SET_STATUS"){
  if(!body.userId)return Response.json({error:"USER_REQUIRED"},{status:400});if(body.userId===ctx.userClaims!.id&&body.status==="BLOCKED")return Response.json({error:"CANNOT_BLOCK_SELF"},{status:409});
  const authUpdate=await ctx.supabaseAdmin.auth.admin.updateUserById(body.userId,{ban_duration:body.status==="BLOCKED"?"876000h":"none"});if(authUpdate.error)return Response.json({error:"AUTH_STATUS_UPDATE_FAILED"},{status:500});
  const{data,error}=await ctx.supabaseAdmin.from("profiles").update({status:body.status,updated_at:new Date().toISOString()}).eq("id",body.userId).select("id,status").single();if(error)return Response.json({error:"STATUS_UPDATE_FAILED"},{status:500});await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:ctx.userClaims!.id,action:"USER_STATUS_CHANGED",entity_type:"profile",entity_id:body.userId,after_data:{status:body.status}});return Response.json({profile:data});
 }
 return Response.json({error:"UNKNOWN_ACTION"},{status:400});
})};