import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body={orderId:string;reason:string;externalReversalConfirmed?:boolean};

function code(message?:string){
  for(const value of ["POS_ORDER_NOT_FOUND","NOT_POS_ORDER","POS_SALE_NOT_REFUNDABLE","REFUND_REASON_REQUIRED","CASH_SESSION_REQUIRED","CASH_REGISTER_STORE_MISMATCH","EXTERNAL_REVERSAL_CONFIRMATION_REQUIRED","INVENTORY_NOT_CONFIGURED"]){
    if(message?.includes(value))return value;
  }
  return "POS_REFUND_FAILED";
}

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
  if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
  let body:Body;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
  const orderId=String(body?.orderId??"");const reason=String(body?.reason??"").trim();
  if(!orderId||!reason)return Response.json({error:"ORDER_AND_REASON_REQUIRED"},{status:400});

  const userId=ctx.userClaims!.id;
  const platformRole=String(ctx.userClaims!.appMetadata?.clickfood_role??"");
  const isAdmin=["SUPER_ADMIN","ADMIN"].includes(platformRole);
  const{data:order,error:orderError}=await ctx.supabaseAdmin.from("orders").select("id,store_id,source,status,payment_status,total").eq("id",orderId).maybeSingle();
  if(orderError)return Response.json({error:"ORDER_LOOKUP_FAILED"},{status:500});
  if(!order||order.source!=="POS")return Response.json({error:"POS_ORDER_NOT_FOUND"},{status:404});

  if(!isAdmin){
    const{data:membership}=await ctx.supabaseAdmin.from("store_memberships").select("role").eq("store_id",order.store_id).eq("user_id",userId).eq("active",true).maybeSingle();
    if(!membership||!["OWNER","MANAGER"].includes(String(membership.role)))return Response.json({error:"POS_REFUND_DENIED"},{status:403});
  }

  const{data:registers}=await ctx.supabaseAdmin.from("cash_registers").select("id").eq("store_id",order.store_id).eq("active",true);
  const registerIds=(registers??[]).map((r:any)=>String(r.id));
  let cashSessionId:string|null=null;
  if(registerIds.length){
    const{data:session}=await ctx.supabaseAdmin.from("cash_sessions").select("id").in("cash_register_id",registerIds).eq("status","OPEN").order("opened_at",{ascending:false}).limit(1).maybeSingle();
    cashSessionId=session?.id??null;
  }

  const{data,error}=await ctx.supabaseAdmin.schema("private").rpc("refund_pos_sale_atomic",{
    p_order_id:order.id,
    p_actor_id:userId,
    p_reason:reason.slice(0,500),
    p_cash_session_id:cashSessionId,
    p_external_reversal_confirmed:Boolean(body.externalReversalConfirmed),
  });
  if(error){
    const errorCode=code(error.message);
    const status=errorCode==="POS_ORDER_NOT_FOUND"?404:errorCode==="POS_REFUND_DENIED"?403:["POS_SALE_NOT_REFUNDABLE","CASH_SESSION_REQUIRED","EXTERNAL_REVERSAL_CONFIRMATION_REQUIRED","INVENTORY_NOT_CONFIGURED"].includes(errorCode)?409:400;
    return Response.json({error:errorCode},{status});
  }
  return Response.json({ok:true,order:data});
})};
