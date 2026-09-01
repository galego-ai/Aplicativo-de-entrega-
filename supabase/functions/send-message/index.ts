import { withSupabase } from "npm:@supabase/server@1.4.1";
type MessageRequest={conversationId:string;content:string};
const blockedPatterns=[
 {name:"EMAIL",pattern:/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i},
 {name:"URL",pattern:/\b(?:https?:\/\/|www\.)\S+/i},
 {name:"DOMAIN",pattern:/\b(?:wa\.me|t\.me|instagram\.com|facebook\.com|fb\.me|tiktok\.com|twitter\.com|x\.com|[a-z0-9][a-z0-9.-]*\.(?:com\.br|com|net|org|app|io|me))\b/i},
 {name:"PHONE",pattern:/(?:\+?55\s*)?(?:\(?\d{2}\)?[\s.-]*)?(?:9?\d{4})[\s.-]*\d{4}\b/},
 {name:"SOCIAL_HANDLE",pattern:/(?:^|\s)@[a-z0-9._]{3,}\b/i},
 {name:"CONTACT_APP",pattern:/\b(?:whats(?:app)?|telegram|instagram|insta|facebook|messenger|tiktok|twitter)\b/i},
 {name:"EXTERNAL_CONTACT_INVITE",pattern:/\b(?:me\s+chama|chama\s+(?:no|na)|fala\s+(?:no|na)|manda\s+(?:no|na)|pedido\s+(?:por|pelo|pela)|faz\s+o\s+pedido\s+(?:por|pelo|pela))\b/i},
];
export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});let body:MessageRequest;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}const userId=ctx.userClaims!.id,content=body.content?.trim();if(!body.conversationId||!content)return Response.json({error:"MESSAGE_REQUIRED"},{status:400});if(content.length>2000)return Response.json({error:"MESSAGE_TOO_LONG"},{status:400});
 const{data:participant,error:participantError}=await ctx.supabaseAdmin.from("conversation_participants").select("conversation_id").eq("conversation_id",body.conversationId).eq("user_id",userId).maybeSingle();if(participantError)return Response.json({error:"CONVERSATION_LOOKUP_FAILED"},{status:500});if(!participant)return Response.json({error:"NOT_A_CONVERSATION_PARTICIPANT"},{status:403});
 const blocked=blockedPatterns.find(({pattern})=>pattern.test(content));if(blocked){await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:userId,action:"CHAT_CONTACT_SHARING_BLOCKED",entity_type:"conversation",entity_id:body.conversationId,after_data:{detected:blocked.name}});return Response.json({error:"CONTACT_SHARING_BLOCKED",message:"Por segurança e para proteger seu pedido, mantenha toda a conversa e negociação dentro do CLICK-FOOD."},{status:422});}
 const{data:message,error:insertError}=await ctx.supabaseAdmin.from("messages").insert({conversation_id:body.conversationId,sender_id:userId,message_type:"TEXT",content,moderation_status:"ALLOWED"}).select("id,conversation_id,sender_id,message_type,content,created_at").single();if(insertError)return Response.json({error:"MESSAGE_SEND_FAILED"},{status:500});
 const[{data:participants},{data:conversation},{data:sender}]=await Promise.all([ctx.supabaseAdmin.from("conversation_participants").select("user_id").eq("conversation_id",body.conversationId).neq("user_id",userId),ctx.supabaseAdmin.from("conversations").select("order_id,conversation_type").eq("id",body.conversationId).maybeSingle(),ctx.supabaseAdmin.from("profiles").select("full_name").eq("id",userId).maybeSingle()]);
 const recipientIds=[...new Set((participants??[]).map(p=>p.user_id).filter(Boolean))];if(recipientIds.length){const title=sender?.full_name?.trim()?`Mensagem de ${sender.full_name.trim().slice(0,60)}`:"Nova mensagem no CLICK-FOOD";await ctx.supabaseAdmin.from("notifications").insert(recipientIds.map(user_id=>({user_id,notification_type:"CHAT_MESSAGE",title,body:content.slice(0,140),data:{conversationId:body.conversationId,orderId:conversation?.order_id??null,conversationType:conversation?.conversation_type??null,messageId:message.id}})));}
 return Response.json({message},{status:201});
})};