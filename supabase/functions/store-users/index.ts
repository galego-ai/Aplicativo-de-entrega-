import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body=
 | {action:"LIST";storeId:string}
 | {action:"ADD";storeId:string;email:string;role:"MANAGER"|"CASHIER"|"KITCHEN"|"EXPEDITION"}
 | {action:"SET_ROLE";storeId:string;membershipId:string;role:"OWNER"|"MANAGER"|"CASHIER"|"KITCHEN"|"EXPEDITION"}
 | {action:"SET_ACTIVE";storeId:string;membershipId:string;active:boolean};

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
 let body:Body;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
 if(!body.storeId)return Response.json({error:"STORE_REQUIRED"},{status:400});
 const userId=ctx.userClaims!.id;const platformRole=String(ctx.userClaims!.appMetadata?.clickfood_role??"");const isAdmin=["SUPER_ADMIN","ADMIN"].includes(platformRole);
 let callerRole="";if(!isAdmin){const{data:m}=await ctx.supabaseAdmin.from("store_memberships").select("role").eq("store_id",body.storeId).eq("user_id",userId).eq("active",true).maybeSingle();callerRole=String(m?.role??"");if(!["OWNER","MANAGER"].includes(callerRole))return Response.json({error:"STORE_MANAGE_REQUIRED"},{status:403});}
 if(body.action==="LIST"){
  const{data:members,error}=await ctx.supabaseAdmin.from("store_memberships").select("id,user_id,role,active,created_at").eq("store_id",body.storeId).order("created_at");if(error)return Response.json({error:"MEMBERS_LOOKUP_FAILED"},{status:500});
  const ids=(members??[]).map(x=>x.user_id);const{data:profiles}=ids.length?await ctx.supabaseAdmin.from("profiles").select("id,full_name,phone,status").in("id",ids):{data:[]};
  const profileMap=new Map((profiles??[]).map((p:any)=>[p.id,p]));const{data:authData}=await ctx.supabaseAdmin.auth.admin.listUsers({page:1,perPage:1000});const emailMap=new Map((authData?.users??[]).map((u:any)=>[u.id,u.email]));
  return Response.json({members:(members??[]).map(m=>({...m,full_name:(profileMap.get(m.user_id) as any)?.full_name??"Usuário",phone:(profileMap.get(m.user_id) as any)?.phone??null,email:emailMap.get(m.user_id)??null}))});
 }
 if(body.action==="ADD"){
  if(!body.email?.trim()||!["MANAGER","CASHIER","KITCHEN","EXPEDITION"].includes(body.role))return Response.json({error:"INVALID_MEMBER"},{status:400});
  const normalized=body.email.trim().toLowerCase();const{data:list}=await ctx.supabaseAdmin.auth.admin.listUsers({page:1,perPage:1000});let target=(list?.users??[]).find((u:any)=>String(u.email??"").toLowerCase()===normalized);
  let invited=false;if(!target){const{data:invite,error:inviteError}=await ctx.supabaseAdmin.auth.admin.inviteUserByEmail(normalized,{data:{full_name:"Equipe CLICK-FOOD"}});if(inviteError||!invite.user)return Response.json({error:"INVITE_FAILED"},{status:500});target=invite.user;invited=true;}
  const{data,error}=await ctx.supabaseAdmin.from("store_memberships").upsert({store_id:body.storeId,user_id:target.id,role:body.role,active:true},{onConflict:"store_id,user_id"}).select("id,user_id,role,active").single();if(error)return Response.json({error:"MEMBERSHIP_SAVE_FAILED"},{status:500});
  await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:userId,action:"STORE_USER_ADDED",entity_type:"store_membership",entity_id:data.id,after_data:{store_id:body.storeId,role:body.role,email:normalized}});return Response.json({membership:data,invited});
 }
 if(body.action==="SET_ROLE"){
  if(!body.membershipId)return Response.json({error:"MEMBERSHIP_REQUIRED"},{status:400});const{data:current}=await ctx.supabaseAdmin.from("store_memberships").select("id,user_id,role,active").eq("id",body.membershipId).eq("store_id",body.storeId).maybeSingle();if(!current)return Response.json({error:"MEMBER_NOT_FOUND"},{status:404});
  if(current.role==="OWNER"&&body.role!=="OWNER"){const{count}=await ctx.supabaseAdmin.from("store_memberships").select("id",{count:"exact",head:true}).eq("store_id",body.storeId).eq("role","OWNER").eq("active",true);if((count??0)<=1)return Response.json({error:"LAST_OWNER"},{status:409});}
  const{data,error}=await ctx.supabaseAdmin.from("store_memberships").update({role:body.role}).eq("id",body.membershipId).select("id,user_id,role,active").single();if(error)return Response.json({error:"ROLE_UPDATE_FAILED"},{status:500});return Response.json({membership:data});
 }
 if(body.action==="SET_ACTIVE"){
  const{data:current}=await ctx.supabaseAdmin.from("store_memberships").select("id,user_id,role,active").eq("id",body.membershipId).eq("store_id",body.storeId).maybeSingle();if(!current)return Response.json({error:"MEMBER_NOT_FOUND"},{status:404});if(current.role==="OWNER"&&!body.active){const{count}=await ctx.supabaseAdmin.from("store_memberships").select("id",{count:"exact",head:true}).eq("store_id",body.storeId).eq("role","OWNER").eq("active",true);if((count??0)<=1)return Response.json({error:"LAST_OWNER"},{status:409});}
  const{data,error}=await ctx.supabaseAdmin.from("store_memberships").update({active:body.active}).eq("id",body.membershipId).select("id,user_id,role,active").single();if(error)return Response.json({error:"MEMBER_UPDATE_FAILED"},{status:500});return Response.json({membership:data});
 }
 return Response.json({error:"UNKNOWN_ACTION"},{status:400});
})};