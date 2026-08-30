import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body={action?:"STATUS"|"ACCEPT";audience?:"CUSTOMER"|"DRIVER"|"STORE";documentIds?:string[];app?:"CUSTOMER"|"DRIVER"|"STORE"};
const allowedAudience=new Set(["CUSTOMER","DRIVER","STORE"]);

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
 let body:Body={};try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
 const action=body.action??"STATUS";const audience=String(body.audience??body.app??"");
 if(!allowedAudience.has(audience))return Response.json({error:"VALID_AUDIENCE_REQUIRED"},{status:400});
 const userId=ctx.userClaims!.id;
 const{data:documents,error:docsError}=await ctx.supabaseAdmin.from("legal_documents").select("id,document_type,audience,version,title,content,published_at").eq("active",true).in("audience",["ALL",audience]).order("document_type");
 if(docsError)return Response.json({error:"LEGAL_DOCUMENTS_LOAD_FAILED"},{status:500});
 const ids=(documents??[]).map((d:any)=>String(d.id));
 const{data:accepted,error:acceptedError}=ids.length?await ctx.supabaseAdmin.from("legal_acceptances").select("document_id,accepted_at").eq("user_id",userId).in("document_id",ids):{data:[],error:null};
 if(acceptedError)return Response.json({error:"LEGAL_ACCEPTANCES_LOAD_FAILED"},{status:500});
 const acceptedMap=new Map((accepted??[]).map((x:any)=>[String(x.document_id),x.accepted_at]));
 if(action==="STATUS")return Response.json({required:(documents??[]).map((d:any)=>({...d,accepted:Boolean(acceptedMap.get(String(d.id))),accepted_at:acceptedMap.get(String(d.id))??null})),pendingIds:ids.filter(id=>!acceptedMap.has(id)),compliant:ids.every(id=>acceptedMap.has(id))});
 if(action!=="ACCEPT")return Response.json({error:"INVALID_ACTION"},{status:400});
 const requested=[...new Set((body.documentIds??[]).map(String))];
 if(!requested.length)return Response.json({error:"DOCUMENT_IDS_REQUIRED"},{status:400});
 const valid=new Set(ids);if(requested.some(id=>!valid.has(id)))return Response.json({error:"DOCUMENT_NOT_CURRENT_OR_NOT_ALLOWED"},{status:409});
 const app=String(body.app??audience);if(!allowedAudience.has(app))return Response.json({error:"VALID_APP_REQUIRED"},{status:400});
 const userAgent=(req.headers.get("user-agent")??"").slice(0,500)||null;
 const rows=requested.map(documentId=>({user_id:userId,document_id:documentId,app,user_agent:userAgent,accepted_at:new Date().toISOString()}));
 const{error:insertError}=await ctx.supabaseAdmin.from("legal_acceptances").upsert(rows,{onConflict:"user_id,document_id"});
 if(insertError)return Response.json({error:"LEGAL_ACCEPTANCE_FAILED"},{status:500});
 await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:userId,action:"LEGAL_DOCUMENTS_ACCEPTED",entity_type:"account",entity_id:null,after_data:{audience,documentIds:requested}});
 return Response.json({ok:true,acceptedIds:requested,compliant:ids.every(id=>acceptedMap.has(id)||requested.includes(id))});
})};
