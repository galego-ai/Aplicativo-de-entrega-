import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body =
  | { action:"INVENTORY_ADJUST"; storeId:string; productId:string; quantity:number; movementType?:"PURCHASE"|"ADJUSTMENT"|"LOSS"|"RETURN"; reason:string }
  | { action:"CREATE_COUPON"; storeId:string; code:string; discountType:"PERCENTAGE"|"FIXED"|"FREE_DELIVERY"; discountValue:number; minimumOrder?:number; maxUses?:number|null; endsAt?:string|null }
  | { action:"TOGGLE_COUPON"; storeId:string; couponId:string; active:boolean }
  | { action:"UPDATE_LOYALTY"; storeId:string; pointsPerCurrency:number; active:boolean }
  | { action:"CREATE_LOYALTY_REWARD"; storeId:string; name:string; pointsCost:number; rewardType:"DISCOUNT_FIXED"|"DISCOUNT_PERCENTAGE"|"FREE_DELIVERY"; rewardValue?:number|null }
  | { action:"TOGGLE_LOYALTY_REWARD"; storeId:string; rewardId:string; active:boolean };

export default {
  fetch: withSupabase({auth:"user"}, async (req, ctx) => {
    if(req.method!=="POST") return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
    let body:Body; try{body=await req.json();}catch{return Response.json({error:"INVALID_JSON"},{status:400});}
    const userId=ctx.userClaims!.id;
    const adminRole=String(ctx.userClaims!.appMetadata?.clickfood_role??"");
    const isAdmin=["SUPER_ADMIN","ADMIN"].includes(adminRole);
    if(!(body as any).storeId) return Response.json({error:"STORE_REQUIRED"},{status:400});
    if(!isAdmin){
      const {data:membership}=await ctx.supabaseAdmin.from("store_memberships").select("role").eq("store_id",(body as any).storeId).eq("user_id",userId).eq("active",true).maybeSingle();
      if(!membership||!["OWNER","MANAGER"].includes(membership.role)) return Response.json({error:"STORE_MANAGE_REQUIRED"},{status:403});
    }
    if(body.action==="INVENTORY_ADJUST"){
      const qty=Number(body.quantity); if(!body.productId||!Number.isFinite(qty)||qty<0||!body.reason?.trim()) return Response.json({error:"INVALID_INVENTORY"},{status:400});
      const {data:product}=await ctx.supabaseAdmin.from("products").select("id,store_id,control_inventory").eq("id",body.productId).eq("store_id",body.storeId).maybeSingle();
      if(!product) return Response.json({error:"PRODUCT_NOT_FOUND"},{status:404});
      const {data:current}=await ctx.supabaseAdmin.from("inventory_items").select("id,quantity,minimum_quantity").eq("store_id",body.storeId).eq("product_id",body.productId).maybeSingle();
      const previous=Number(current?.quantity??0); const next=Math.round(qty*1000)/1000;
      let item;
      if(current){ const updated=await ctx.supabaseAdmin.from("inventory_items").update({quantity:next,updated_at:new Date().toISOString()}).eq("id",current.id).select("id,quantity,minimum_quantity").single(); if(updated.error)return Response.json({error:"INVENTORY_UPDATE_FAILED"},{status:500}); item=updated.data; }
      else { const inserted=await ctx.supabaseAdmin.from("inventory_items").insert({store_id:body.storeId,product_id:body.productId,quantity:next,minimum_quantity:0}).select("id,quantity,minimum_quantity").single(); if(inserted.error)return Response.json({error:"INVENTORY_CREATE_FAILED"},{status:500}); item=inserted.data; }
      await ctx.supabaseAdmin.from("products").update({control_inventory:true,updated_at:new Date().toISOString()}).eq("id",body.productId);
      await ctx.supabaseAdmin.from("inventory_movements").insert({store_id:body.storeId,product_id:body.productId,movement_type:body.movementType??"ADJUSTMENT",quantity:Math.abs(next-previous),previous_quantity:previous,new_quantity:next,reason:body.reason.trim().slice(0,500),created_by:userId});
      return Response.json({item});
    }
    if(body.action==="CREATE_COUPON"){
      const code=body.code?.trim().toUpperCase(); const value=Number(body.discountValue); const min=Number(body.minimumOrder??0);
      if(!code||!body.discountType||!Number.isFinite(value)||value<0||!Number.isFinite(min)||min<0) return Response.json({error:"INVALID_COUPON"},{status:400});
      if(body.discountType==="PERCENTAGE"&&(value<=0||value>100)) return Response.json({error:"INVALID_PERCENTAGE"},{status:400});
      const {data,error}=await ctx.supabaseAdmin.from("coupons").insert({store_id:body.storeId,code,discount_type:body.discountType,discount_value:value,minimum_order:min,max_uses:body.maxUses??null,ends_at:body.endsAt??null,active:true}).select("id,code,discount_type,discount_value,minimum_order,max_uses,ends_at,active").single();
      if(error) return Response.json({error:error.code==="23505"?"COUPON_EXISTS":"COUPON_CREATE_FAILED"},{status:error.code==="23505"?409:500}); return Response.json({coupon:data},{status:201});
    }
    if(body.action==="TOGGLE_COUPON"){
      const {data,error}=await ctx.supabaseAdmin.from("coupons").update({active:body.active}).eq("id",body.couponId).eq("store_id",body.storeId).select("id,active").single(); if(error)return Response.json({error:"COUPON_UPDATE_FAILED"},{status:500}); return Response.json({coupon:data});
    }
    if(body.action==="UPDATE_LOYALTY"){
      const points=Number(body.pointsPerCurrency); if(!Number.isFinite(points)||points<0) return Response.json({error:"INVALID_POINTS"},{status:400});
      const {data,error}=await ctx.supabaseAdmin.from("loyalty_programs").upsert({store_id:body.storeId,points_per_currency:points,active:body.active,updated_at:new Date().toISOString()},{onConflict:"store_id"}).select("id,points_per_currency,active").single(); if(error)return Response.json({error:"LOYALTY_UPDATE_FAILED"},{status:500}); return Response.json({program:data});
    }
    if(body.action==="CREATE_LOYALTY_REWARD"){
      const points=Number(body.pointsCost), value=body.rewardValue==null?null:Number(body.rewardValue); if(!body.name?.trim()||!Number.isInteger(points)||points<=0) return Response.json({error:"INVALID_REWARD"},{status:400});
      const {data:program}=await ctx.supabaseAdmin.from("loyalty_programs").select("id").eq("store_id",body.storeId).maybeSingle(); if(!program)return Response.json({error:"LOYALTY_PROGRAM_REQUIRED"},{status:409});
      const {data,error}=await ctx.supabaseAdmin.from("loyalty_rewards").insert({program_id:program.id,name:body.name.trim(),points_cost:points,reward_type:body.rewardType,reward_value:value,active:true}).select("id,name,points_cost,reward_type,reward_value,active").single(); if(error)return Response.json({error:"REWARD_CREATE_FAILED"},{status:500}); return Response.json({reward:data},{status:201});
    }
    if(body.action==="TOGGLE_LOYALTY_REWARD"){
      const {data:program}=await ctx.supabaseAdmin.from("loyalty_programs").select("id").eq("store_id",body.storeId).maybeSingle(); if(!program)return Response.json({error:"LOYALTY_PROGRAM_REQUIRED"},{status:409});
      const {data,error}=await ctx.supabaseAdmin.from("loyalty_rewards").update({active:body.active}).eq("id",body.rewardId).eq("program_id",program.id).select("id,active").single(); if(error)return Response.json({error:"REWARD_UPDATE_FAILED"},{status:500}); return Response.json({reward:data});
    }
    return Response.json({error:"UNKNOWN_ACTION"},{status:400});
  })
};