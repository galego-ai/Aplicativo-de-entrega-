import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body={action?:"PRECHECK"|"DELETE";confirmation?:string};
const adminRoles=new Set(["SUPER_ADMIN","ADMIN","SUPPORT"]);
function errorCode(message:string){
 const codes=["BUSINESS_ACCOUNT_TRANSFER_REQUIRED","ACTIVE_ORDER_EXISTS","ACTIVE_DELIVERY_EXISTS","ACTIVE_PAYOUT_EXISTS","USER_REQUIRED"];
 return codes.find(code=>message.includes(code))??"ACCOUNT_DELETE_CHECK_FAILED";
}

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
 let body:Body={};try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
 const action=body.action??"PRECHECK";
 if(!["PRECHECK","DELETE"].includes(action))return Response.json({error:"INVALID_ACTION"},{status:400});
 const userId=ctx.userClaims!.id;
 const role=String(ctx.userClaims!.appMetadata?.clickfood_role??"");
 if(adminRoles.has(role))return Response.json({error:"ADMIN_ACCOUNT_DELETE_REQUIRES_SUPPORT"},{status:409});

 const pre=await ctx.supabaseAdmin.rpc("anonymize_self_account_atomic",{p_user_id:userId,p_apply:false});
 if(pre.error)return Response.json({error:errorCode(String(pre.error.message??""))},{status:409});
 if(action==="PRECHECK")return Response.json({ok:true,canDelete:true,hasDriver:Boolean(pre.data?.driverId)});
 if(body.confirmation!=="EXCLUIR")return Response.json({error:"DELETE_CONFIRMATION_REQUIRED"},{status:400});

 const driverId=pre.data?.driverId?String(pre.data.driverId):null;
 if(driverId){
  const{data:docs,error:docsError}=await ctx.supabaseAdmin.from("driver_documents").select("id,document_type,file_path").eq("driver_id",driverId);
  if(docsError)return Response.json({error:"DRIVER_DOCUMENT_LOOKUP_FAILED"},{status:500});
  const privatePaths=[...new Set((docs??[]).map((d:any)=>String(d.file_path)).filter(Boolean))];
  if(privatePaths.length){const removal=await ctx.supabaseAdmin.storage.from("driver-documents").remove(privatePaths);if(removal.error)return Response.json({error:"DRIVER_DOCUMENT_DELETE_FAILED"},{status:500});}
  const avatarPaths=[...new Set((docs??[]).filter((d:any)=>String(d.document_type)==="PROFILE_PHOTO").map((d:any)=>`${userId}/${d.id}`))];
  if(avatarPaths.length){const avatarRemoval=await ctx.supabaseAdmin.storage.from("driver-avatars").remove(avatarPaths);if(avatarRemoval.error)return Response.json({error:"DRIVER_AVATAR_DELETE_FAILED"},{status:500});}
 }

 const anonymized=await ctx.supabaseAdmin.rpc("anonymize_self_account_atomic",{p_user_id:userId,p_apply:true});
 if(anonymized.error)return Response.json({error:errorCode(String(anonymized.error.message??""))},{status:409});

 const{error:deleteError}=await ctx.supabaseAdmin.auth.admin.deleteUser(userId,true);
 if(deleteError){
  await ctx.supabaseAdmin.auth.admin.updateUserById(userId,{ban_duration:"876000h",user_metadata:{account_deleted:true,full_name:null,phone:null}} as any);
  return Response.json({ok:true,anonymized:true,authDeletionPending:true,error:"AUTH_SOFT_DELETE_FAILED"},{status:202});
 }
 return Response.json({ok:true,deleted:true,anonymized:true});
})};
