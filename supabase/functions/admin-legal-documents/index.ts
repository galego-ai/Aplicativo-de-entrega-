import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body={action:"LIST"|"CREATE"|"UPDATE"|"PUBLISH"|"ARCHIVE";id?:string;documentType?:string;audience?:string;version?:string;title?:string;content?:string};
const types=new Set(["TERMS","PRIVACY","DRIVER_TERMS","STORE_TERMS"]);const audiences=new Set(["ALL","CUSTOMER","DRIVER","STORE"]);
export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
 const role=String(ctx.userClaims!.appMetadata?.clickfood_role??"");if(!["SUPER_ADMIN","ADMIN","SUPPORT"].includes(role))return Response.json({error:"ADMIN_REQUIRED"},{status:403});
 let body:Body;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
 const actor=ctx.userClaims!.id;
 if(body.action==="LIST"){const{data,error}=await ctx.supabaseAdmin.from("legal_documents").select("id,document_type,audience,version,title,content,active,published_at,created_at,updated_at").order("created_at",{ascending:false});return error?Response.json({error:"LEGAL_LIST_FAILED"},{status:500}):Response.json({documents:data??[]});}
 if(!["SUPER_ADMIN","ADMIN"].includes(role))return Response.json({error:"ADMIN_WRITE_REQUIRED"},{status:403});
 if(body.action==="CREATE"){
  const documentType=String(body.documentType??"");const audience=String(body.audience??"");const version=String(body.version??"").trim();const title=String(body.title??"").trim();const content=String(body.content??"").trim();
  if(!types.has(documentType)||!audiences.has(audience)||!version||!title||!content)return Response.json({error:"LEGAL_FIELDS_REQUIRED"},{status:400});
  const{data,error}=await ctx.supabaseAdmin.from("legal_documents").insert({document_type:documentType,audience,version,title,content,created_by:actor}).select("*").single();if(error)return Response.json({error:String(error.code)==="23505"?"LEGAL_VERSION_EXISTS":"LEGAL_CREATE_FAILED"},{status:String(error.code)==="23505"?409:500});
  await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:actor,action:"LEGAL_DOCUMENT_CREATED",entity_type:"legal_document",entity_id:data.id,after_data:{documentType,audience,version,title}});return Response.json({document:data},{status:201});
 }
 const id=String(body.id??"");if(!id)return Response.json({error:"DOCUMENT_ID_REQUIRED"},{status:400});
 const{data:current}=await ctx.supabaseAdmin.from("legal_documents").select("*").eq("id",id).maybeSingle();if(!current)return Response.json({error:"LEGAL_DOCUMENT_NOT_FOUND"},{status:404});
 if(body.action==="UPDATE"){
  if(current.active)return Response.json({error:"PUBLISHED_DOCUMENT_IMMUTABLE"},{status:409});const patch:any={updated_at:new Date().toISOString()};
  if(body.version!==undefined)patch.version=String(body.version).trim();if(body.title!==undefined)patch.title=String(body.title).trim();if(body.content!==undefined)patch.content=String(body.content).trim();if(body.documentType!==undefined){if(!types.has(String(body.documentType)))return Response.json({error:"INVALID_DOCUMENT_TYPE"},{status:400});patch.document_type=String(body.documentType);}if(body.audience!==undefined){if(!audiences.has(String(body.audience)))return Response.json({error:"INVALID_AUDIENCE"},{status:400});patch.audience=String(body.audience);}
  const{data,error}=await ctx.supabaseAdmin.from("legal_documents").update(patch).eq("id",id).eq("active",false).select("*").single();if(error)return Response.json({error:String(error.code)==="23505"?"LEGAL_VERSION_EXISTS":"LEGAL_UPDATE_FAILED"},{status:String(error.code)==="23505"?409:500});return Response.json({document:data});
 }
 if(body.action==="PUBLISH"){const{data,error}=await ctx.supabaseAdmin.rpc("publish_legal_document_atomic",{p_document_id:id,p_actor_id:actor});return error?Response.json({error:String(error.message).includes("CONTENT_REQUIRED")?"LEGAL_CONTENT_REQUIRED":"LEGAL_PUBLISH_FAILED"},{status:409}):Response.json({document:data});}
 if(body.action==="ARCHIVE"){const{data,error}=await ctx.supabaseAdmin.from("legal_documents").update({active:false,updated_at:new Date().toISOString()}).eq("id",id).select("*").single();if(error)return Response.json({error:"LEGAL_ARCHIVE_FAILED"},{status:500});await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:actor,action:"LEGAL_DOCUMENT_ARCHIVED",entity_type:"legal_document",entity_id:id,after_data:{version:current.version}});return Response.json({document:data});}
 return Response.json({error:"INVALID_ACTION"},{status:400});
})};
