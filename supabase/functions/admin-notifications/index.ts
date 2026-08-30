import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body={action:"SEND";audience:"CUSTOMERS"|"DRIVERS"|"STORE_USERS"|"STORE"|"USER";title:string;body:string;storeId?:string;userId?:string;data?:Record<string,unknown>};
const chunks=<T,>(rows:T[],size=500)=>Array.from({length:Math.ceil(rows.length/size)},(_,i)=>rows.slice(i*size,(i+1)*size));

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
 const role=String(ctx.userClaims!.appMetadata?.clickfood_role??"");
 if(!["SUPER_ADMIN","ADMIN"].includes(role))return Response.json({error:"ADMIN_REQUIRED"},{status:403});
 let body:Body;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
 if(body.action!=="SEND")return Response.json({error:"UNKNOWN_ACTION"},{status:400});
 const title=body.title?.trim(),message=body.body?.trim();
 if(!title||title.length>120||!message||message.length>500)return Response.json({error:"INVALID_MESSAGE"},{status:400});
 if(body.audience==="STORE"&&!body.storeId)return Response.json({error:"STORE_REQUIRED"},{status:400});
 if(body.audience==="USER"&&!body.userId)return Response.json({error:"USER_REQUIRED"},{status:400});
 const recipients=new Set<string>();
 if(body.audience==="DRIVERS"){
  const{data,error}=await ctx.supabaseAdmin.from("drivers").select("user_id").eq("status","ACTIVE");if(error)return Response.json({error:"RECIPIENT_LOOKUP_FAILED"},{status:500});for(const row of data??[])recipients.add(row.user_id);
 }else if(body.audience==="STORE_USERS"||body.audience==="STORE"){
  let q=ctx.supabaseAdmin.from("store_memberships").select("user_id").eq("active",true);if(body.audience==="STORE")q=q.eq("store_id",body.storeId!);const{data,error}=await q;if(error)return Response.json({error:"RECIPIENT_LOOKUP_FAILED"},{status:500});for(const row of data??[])recipients.add(row.user_id);
 }else if(body.audience==="CUSTOMERS"){
  const{data,error}=await ctx.supabaseAdmin.from("orders").select("customer_id").not("customer_id","is",null).limit(10000);if(error)return Response.json({error:"RECIPIENT_LOOKUP_FAILED"},{status:500});for(const row of data??[])if(row.customer_id)recipients.add(row.customer_id);
 }else if(body.audience==="USER")recipients.add(body.userId!);
 const ids=[...recipients].slice(0,10000);const createdAt=new Date().toISOString();
 for(const part of chunks(ids)){const{error}=await ctx.supabaseAdmin.from("notifications").insert(part.map(user_id=>({user_id,notification_type:"ADMIN_BROADCAST",title,body:message,data:{...(body.data??{}),source:"MATRIX"},created_at:createdAt})));if(error)return Response.json({error:"NOTIFICATION_INSERT_FAILED",detail:error.message},{status:500});}
 const actor=ctx.userClaims!.id;const{data:broadcast,error:broadcastError}=await ctx.supabaseAdmin.from("notification_broadcasts").insert({created_by:actor,audience:body.audience,store_id:body.storeId||null,user_id:body.userId||null,title,body:message,data:body.data??{},recipient_count:ids.length,status:"SENT"}).select("*").single();
 if(broadcastError)return Response.json({error:"BROADCAST_AUDIT_FAILED"},{status:500});
 await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:actor,action:"ADMIN_NOTIFICATION_SENT",entity_type:"notification_broadcast",entity_id:broadcast.id,after_data:{audience:body.audience,store_id:body.storeId||null,recipient_count:ids.length,title}});
 return Response.json({broadcast,recipientCount:ids.length},{status:201});
})};