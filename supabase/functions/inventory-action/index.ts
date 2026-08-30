import { withSupabase } from "npm:@supabase/server@1.4.1";

type Action="ENABLE"|"DISABLE"|"PURCHASE"|"LOSS"|"ADJUSTMENT"|"SET_MINIMUM";
type Body={storeId:string;productId:string;action:Action;quantity?:number;minimumQuantity?:number;reason?:string};

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
  if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
  let body:Body;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
  if(!body.storeId||!body.productId||!["ENABLE","DISABLE","PURCHASE","LOSS","ADJUSTMENT","SET_MINIMUM"].includes(body.action))return Response.json({error:"INVALID_INVENTORY_ACTION"},{status:400});
  const actor=ctx.userClaims!.id;
  const platformRole=String(ctx.userClaims!.appMetadata?.clickfood_role??"");
  const isAdmin=["SUPER_ADMIN","ADMIN"].includes(platformRole);
  if(!isAdmin){
    const{data:membership,error}=await ctx.supabaseAdmin.from("store_memberships").select("role").eq("store_id",body.storeId).eq("user_id",actor).eq("active",true).maybeSingle();
    if(error)return Response.json({error:"MEMBERSHIP_LOOKUP_FAILED"},{status:500});
    if(!membership||!["OWNER","MANAGER"].includes(membership.role))return Response.json({error:"STORE_ACCESS_DENIED"},{status:403});
  }
  const quantity=body.quantity===undefined?null:Number(body.quantity),minimum=body.minimumQuantity===undefined?null:Number(body.minimumQuantity);
  if(quantity!==null&&!Number.isFinite(quantity))return Response.json({error:"INVALID_QUANTITY"},{status:400});
  if(minimum!==null&&!Number.isFinite(minimum))return Response.json({error:"INVALID_MINIMUM_QUANTITY"},{status:400});
  const{data,error}=await ctx.supabaseAdmin.rpc("inventory_manage_atomic",{p_store_id:body.storeId,p_product_id:body.productId,p_actor_id:actor,p_action:body.action,p_quantity:quantity,p_minimum_quantity:minimum,p_reason:body.reason?.trim().slice(0,500)||null});
  if(error){const message=error.message??"";for(const code of ["PRODUCT_NOT_FOUND","INVALID_QUANTITY","INVALID_MINIMUM_QUANTITY","INVENTORY_CONTROL_DISABLED","MINIMUM_QUANTITY_REQUIRED","QUANTITY_REQUIRED","INSUFFICIENT_STOCK"])if(message.includes(code))return Response.json({error:code},{status:409});return Response.json({error:"INVENTORY_UPDATE_FAILED"},{status:500});}
  await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:actor,action:`INVENTORY_${body.action}`,entity_type:"product",entity_id:body.productId,after_data:{store_id:body.storeId,quantity,minimum_quantity:minimum,reason:body.reason?.trim().slice(0,500)||null}});
  return Response.json({inventory:data});
})};