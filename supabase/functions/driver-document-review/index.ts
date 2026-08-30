import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body={documentId:string;action:"APPROVE"|"REJECT";reason?:string;expiresAt?:string|null};
const avatarMimes=new Set(["image/jpeg","image/png","image/webp"]);

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
  if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
  const role=String(ctx.userClaims!.appMetadata?.clickfood_role??"");
  if(!["SUPER_ADMIN","ADMIN"].includes(role))return Response.json({error:"ADMIN_REQUIRED"},{status:403});
  let body:Body;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
  if(!body.documentId||!["APPROVE","REJECT"].includes(body.action))return Response.json({error:"INVALID_ACTION"},{status:400});
  if(body.action==="REJECT"&&!body.reason?.trim())return Response.json({error:"REJECTION_REASON_REQUIRED"},{status:400});
  const actor=ctx.userClaims!.id;
  const{data:doc,error:lookupError}=await ctx.supabaseAdmin.from("driver_documents").select("id,driver_id,document_type,file_path,status").eq("id",body.documentId).maybeSingle();
  if(lookupError)return Response.json({error:"DOCUMENT_LOOKUP_FAILED"},{status:500});
  if(!doc)return Response.json({error:"DOCUMENT_NOT_FOUND"},{status:404});
  if(doc.status!=="PENDING")return Response.json({error:"DOCUMENT_ALREADY_REVIEWED"},{status:409});
  const{data:driver}=await ctx.supabaseAdmin.from("drivers").select("id,user_id,status").eq("id",doc.driver_id).maybeSingle();
  if(!driver)return Response.json({error:"DRIVER_NOT_FOUND"},{status:404});

  let avatarPath:string|null=null;
  let avatarUrl:string|null=null;
  if(body.action==="APPROVE"&&doc.document_type==="PROFILE_PHOTO"){
    const{data:file,error:downloadError}=await ctx.supabaseAdmin.storage.from("driver-documents").download(doc.file_path);
    if(downloadError||!file)return Response.json({error:"PROFILE_PHOTO_DOWNLOAD_FAILED"},{status:500});
    const mime=String(file.type||"").toLowerCase();
    if(!avatarMimes.has(mime))return Response.json({error:"PROFILE_PHOTO_IMAGE_REQUIRED"},{status:422});
    avatarPath=`${driver.user_id}/${doc.id}`;
    const{error:avatarUploadError}=await ctx.supabaseAdmin.storage.from("driver-avatars").upload(avatarPath,file,{contentType:mime,cacheControl:"3600",upsert:true});
    if(avatarUploadError)return Response.json({error:"PROFILE_AVATAR_PUBLISH_FAILED"},{status:500});
    avatarUrl=ctx.supabaseAdmin.storage.from("driver-avatars").getPublicUrl(avatarPath).data.publicUrl;
  }

  const next=body.action==="APPROVE"?"APPROVED":"REJECTED";
  const patch:any={status:next,reviewed_by:actor,reviewed_at:new Date().toISOString(),rejection_reason:body.action==="REJECT"?body.reason!.trim().slice(0,500):null};
  if(body.action==="APPROVE"&&body.expiresAt!==undefined)patch.expires_at=body.expiresAt||null;
  const{data:updated,error:updateError}=await ctx.supabaseAdmin.from("driver_documents").update(patch).eq("id",doc.id).eq("status","PENDING").select("*").single();
  if(updateError){if(avatarPath)await ctx.supabaseAdmin.storage.from("driver-avatars").remove([avatarPath]);return Response.json({error:"DOCUMENT_REVIEW_FAILED"},{status:500});}

  if(avatarUrl){
    const{error:profileError}=await ctx.supabaseAdmin.from("profiles").update({avatar_url:avatarUrl,updated_at:new Date().toISOString()}).eq("id",driver.user_id);
    if(profileError){
      if(avatarPath)await ctx.supabaseAdmin.storage.from("driver-avatars").remove([avatarPath]);
      await ctx.supabaseAdmin.from("driver_documents").update({status:"PENDING",reviewed_by:null,reviewed_at:null,rejection_reason:null}).eq("id",doc.id).eq("status","APPROVED");
      return Response.json({error:"PROFILE_AVATAR_LINK_FAILED"},{status:500});
    }
  }

  await ctx.supabaseAdmin.from("notifications").insert({user_id:driver.user_id,notification_type:body.action==="APPROVE"?"DRIVER_DOCUMENT_APPROVED":"DRIVER_DOCUMENT_REJECTED",title:body.action==="APPROVE"?"Documento aprovado":"Documento precisa ser reenviado",body:body.action==="APPROVE"?`${doc.document_type} aprovado pela equipe CLICK-FOOD.`:`${doc.document_type} recusado: ${body.reason!.trim().slice(0,240)}`,data:{driverId:driver.id,documentId:doc.id,documentType:doc.document_type,avatarPublished:Boolean(avatarUrl)}});
  await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:actor,action:body.action==="APPROVE"?"DRIVER_DOCUMENT_APPROVED":"DRIVER_DOCUMENT_REJECTED",entity_type:"driver_document",entity_id:doc.id,after_data:{driver_id:doc.driver_id,document_type:doc.document_type,status:next,reason:patch.rejection_reason,avatar_published:Boolean(avatarUrl)}});
  return Response.json({document:updated,avatarPublished:Boolean(avatarUrl),avatarUrl});
})};
