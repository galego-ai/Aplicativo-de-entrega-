import { withSupabase } from "npm:@supabase/server@1.4.1";

type PromotionType = "PERCENTAGE"|"FIXED"|"PRODUCT_PRICE"|"FREE_DELIVERY";
type CouponType = "PERCENTAGE"|"FIXED"|"FREE_DELIVERY";
type CouponRule = { type:"FIRST_ORDER"|"PRODUCT"|"CATEGORY"; productId?:string; categoryId?:string };
type PromotionInput = { id?:string; name?:string; description?:string; promotionType?:PromotionType; discountValue?:number; productId?:string|null; startsAt?:string|null; endsAt?:string|null };
type CouponInput = { id?:string; code?:string; discountType?:CouponType; discountValue?:number; minimumOrder?:number; maxUses?:number|null; maxUsesPerCustomer?:number|null; startsAt?:string|null; endsAt?:string|null; rules?:CouponRule[] };
type Body = { storeId?:string; action?:"GET"|"SAVE_PROMOTION"|"TOGGLE_PROMOTION"|"SAVE_COUPON"|"TOGGLE_COUPON"; promotion?:PromotionInput; coupon?:CouponInput; id?:string; active?:boolean };

const promotionTypes = new Set(["PERCENTAGE","FIXED","PRODUCT_PRICE","FREE_DELIVERY"]);
const couponTypes = new Set(["PERCENTAGE","FIXED","FREE_DELIVERY"]);
const writeActions = new Set(["SAVE_PROMOTION","TOGGLE_PROMOTION","SAVE_COUPON","TOGGLE_COUPON"]);
const money = (v:number) => Math.round((v + Number.EPSILON) * 100) / 100;

function optionalIso(value: unknown): string|null|undefined {
  if(value==null || String(value).trim()==="") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
function optionalPositiveInt(value: unknown): number|null|undefined {
  if(value==null || value==="") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : undefined;
}

export default { fetch: withSupabase({auth:"user"}, async(req,ctx)=>{
  if(req.method!=="POST") return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
  let body:Body;
  try{ body=await req.json(); }catch{ return Response.json({error:"INVALID_JSON"},{status:400}); }

  const storeId=String(body.storeId??"");
  const action=body.action??"GET";
  if(!storeId) return Response.json({error:"STORE_REQUIRED"},{status:400});

  const userId=ctx.userClaims!.id;
  const platformRole=String(ctx.userClaims!.appMetadata?.clickfood_role??"");
  const isAdmin=["SUPER_ADMIN","ADMIN"].includes(platformRole);
  let membershipRole="";
  if(!isAdmin){
    const{data:membership,error}=await ctx.supabaseAdmin.from("store_memberships").select("role").eq("store_id",storeId).eq("user_id",userId).eq("active",true).maybeSingle();
    if(error) return Response.json({error:"MEMBERSHIP_LOOKUP_FAILED"},{status:500});
    if(!membership) return Response.json({error:"STORE_ACCESS_DENIED"},{status:403});
    membershipRole=String(membership.role);
    if(writeActions.has(action) && !["OWNER","MANAGER"].includes(membershipRole)) return Response.json({error:"STORE_WRITE_DENIED"},{status:403});
  }

  if(action==="GET"){
    const [promotionsR,couponsR,productsR,categoriesR] = await Promise.all([
      ctx.supabaseAdmin.from("promotions").select("id,name,description,promotion_type,discount_value,product_id,starts_at,ends_at,active,created_at,updated_at").eq("store_id",storeId).order("created_at",{ascending:false}).limit(100),
      ctx.supabaseAdmin.from("coupons").select("id,code,discount_type,discount_value,minimum_order,max_uses,max_uses_per_customer,starts_at,ends_at,active,created_at").eq("store_id",storeId).order("created_at",{ascending:false}).limit(100),
      ctx.supabaseAdmin.from("products").select("id,name,active,available_delivery").eq("store_id",storeId).order("name").limit(500),
      ctx.supabaseAdmin.from("categories").select("id,name,active,sort_order").eq("store_id",storeId).order("sort_order").order("name").limit(200),
    ]);
    if(promotionsR.error||couponsR.error||productsR.error||categoriesR.error) return Response.json({error:"PROMOTION_DATA_LOOKUP_FAILED"},{status:500});
    const coupons=couponsR.data??[];
    const couponIds=coupons.map(c=>c.id);
    let rules:any[]=[]; let redemptionRows:any[]=[];
    if(couponIds.length){
      const [rulesR,redemptionsR]=await Promise.all([
        ctx.supabaseAdmin.from("coupon_rules").select("id,coupon_id,rule_type,rule_value").in("coupon_id",couponIds),
        ctx.supabaseAdmin.from("coupon_redemptions").select("coupon_id,discount_amount,created_at").in("coupon_id",couponIds).limit(5000),
      ]);
      if(rulesR.error||redemptionsR.error) return Response.json({error:"COUPON_METRICS_LOOKUP_FAILED"},{status:500});
      rules=rulesR.data??[]; redemptionRows=redemptionsR.data??[];
    }
    const usesByCoupon:Record<string,{uses:number;discount:number}>={};
    for(const row of redemptionRows){
      const key=String(row.coupon_id); const current=usesByCoupon[key]??{uses:0,discount:0};
      current.uses+=1; current.discount=money(current.discount+Number(row.discount_amount||0)); usesByCoupon[key]=current;
    }
    return Response.json({
      promotions:promotionsR.data??[],
      coupons:coupons.map(c=>({...c,rules:rules.filter(r=>r.coupon_id===c.id),uses:usesByCoupon[c.id]?.uses??0,total_discount:usesByCoupon[c.id]?.discount??0})),
      products:productsR.data??[],categories:categoriesR.data??[],
    });
  }

  if(action==="SAVE_PROMOTION"){
    const input=body.promotion??{};
    const id=String(input.id??""); const name=String(input.name??"").trim(); const description=String(input.description??"").trim();
    const promotionType=String(input.promotionType??"") as PromotionType; let discountValue=Number(input.discountValue??0); let productId=input.productId?String(input.productId):null;
    if(!name || name.length>120 || !promotionTypes.has(promotionType)) return Response.json({error:"INVALID_PROMOTION"},{status:400});
    if(promotionType==="FREE_DELIVERY"){ discountValue=0; productId=null; }
    else {
      if(!productId) return Response.json({error:"PROMOTION_PRODUCT_REQUIRED"},{status:400});
      if(!Number.isFinite(discountValue)||discountValue<=0) return Response.json({error:"INVALID_PROMOTION_VALUE"},{status:400});
      if(promotionType==="PERCENTAGE"&&discountValue>100) return Response.json({error:"INVALID_PROMOTION_VALUE"},{status:400});
      const{data:product,error}=await ctx.supabaseAdmin.from("products").select("id").eq("id",productId).eq("store_id",storeId).maybeSingle();
      if(error) return Response.json({error:"PRODUCT_LOOKUP_FAILED"},{status:500});
      if(!product) return Response.json({error:"PRODUCT_NOT_FOUND"},{status:404});
    }
    const startsAt=optionalIso(input.startsAt); const endsAt=optionalIso(input.endsAt);
    if(startsAt===undefined||endsAt===undefined) return Response.json({error:"INVALID_PROMOTION_DATES"},{status:400});
    if(startsAt&&endsAt&&new Date(endsAt).getTime()<=new Date(startsAt).getTime()) return Response.json({error:"INVALID_PROMOTION_DATES"},{status:400});
    const row={name,description:description||null,promotion_type:promotionType,discount_value:money(discountValue),product_id:productId,starts_at:startsAt,ends_at:endsAt,updated_at:new Date().toISOString()};
    let result:any;
    if(id) result=await ctx.supabaseAdmin.from("promotions").update(row).eq("id",id).eq("store_id",storeId).select("id,name,description,promotion_type,discount_value,product_id,starts_at,ends_at,active,created_at,updated_at").maybeSingle();
    else result=await ctx.supabaseAdmin.from("promotions").insert({store_id:storeId,...row,active:true}).select("id,name,description,promotion_type,discount_value,product_id,starts_at,ends_at,active,created_at,updated_at").single();
    if(result.error) return Response.json({error:"PROMOTION_SAVE_FAILED"},{status:500});
    if(!result.data) return Response.json({error:"PROMOTION_NOT_FOUND"},{status:404});
    await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:userId,action:id?"STORE_PROMOTION_UPDATED":"STORE_PROMOTION_CREATED",entity_type:"promotion",entity_id:result.data.id,after_data:{storeId,promotionType}});
    return Response.json({promotion:result.data});
  }

  if(action==="TOGGLE_PROMOTION"){
    const id=String(body.id??""); if(!id) return Response.json({error:"PROMOTION_REQUIRED"},{status:400});
    const{data,error}=await ctx.supabaseAdmin.from("promotions").update({active:body.active===true,updated_at:new Date().toISOString()}).eq("id",id).eq("store_id",storeId).select("id,active").maybeSingle();
    if(error) return Response.json({error:"PROMOTION_TOGGLE_FAILED"},{status:500});
    if(!data) return Response.json({error:"PROMOTION_NOT_FOUND"},{status:404});
    await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:userId,action:"STORE_PROMOTION_STATUS_CHANGED",entity_type:"promotion",entity_id:id,after_data:{storeId,active:data.active}});
    return Response.json({promotion:data});
  }

  if(action==="SAVE_COUPON"){
    const input=body.coupon??{}; const id=String(input.id??"");
    const code=String(input.code??"").trim().toUpperCase(); const discountType=String(input.discountType??"") as CouponType;
    let discountValue=Number(input.discountValue??0); const minimumOrder=Number(input.minimumOrder??0);
    const maxUses=optionalPositiveInt(input.maxUses); const maxUsesPerCustomer=optionalPositiveInt(input.maxUsesPerCustomer);
    if(!/^[A-Z0-9_-]{3,32}$/.test(code)||!couponTypes.has(discountType)||!Number.isFinite(minimumOrder)||minimumOrder<0||maxUses===undefined||maxUsesPerCustomer===undefined) return Response.json({error:"INVALID_COUPON"},{status:400});
    if(discountType==="FREE_DELIVERY") discountValue=0;
    else if(!Number.isFinite(discountValue)||discountValue<=0||(discountType==="PERCENTAGE"&&discountValue>100)) return Response.json({error:"INVALID_COUPON_VALUE"},{status:400});
    const startsAt=optionalIso(input.startsAt); const endsAt=optionalIso(input.endsAt);
    if(startsAt===undefined||endsAt===undefined||(startsAt&&endsAt&&new Date(endsAt).getTime()<=new Date(startsAt).getTime())) return Response.json({error:"INVALID_COUPON_DATES"},{status:400});

    const rulesInput=Array.isArray(input.rules)?input.rules:[]; const normalizedRules:Array<{coupon_id?:string;rule_type:string;rule_value:Record<string,string>}>=[];
    for(const rule of rulesInput){
      if(rule.type==="FIRST_ORDER") normalizedRules.push({rule_type:"FIRST_ORDER",rule_value:{}});
      else if(rule.type==="PRODUCT"){
        const productId=String(rule.productId??""); if(!productId) return Response.json({error:"COUPON_RULE_PRODUCT_REQUIRED"},{status:400});
        const{data:product}=await ctx.supabaseAdmin.from("products").select("id").eq("id",productId).eq("store_id",storeId).maybeSingle(); if(!product) return Response.json({error:"COUPON_RULE_PRODUCT_INVALID"},{status:400});
        normalizedRules.push({rule_type:"PRODUCT",rule_value:{product_id:productId}});
      } else if(rule.type==="CATEGORY"){
        const categoryId=String(rule.categoryId??""); if(!categoryId) return Response.json({error:"COUPON_RULE_CATEGORY_REQUIRED"},{status:400});
        const{data:category}=await ctx.supabaseAdmin.from("categories").select("id").eq("id",categoryId).eq("store_id",storeId).maybeSingle(); if(!category) return Response.json({error:"COUPON_RULE_CATEGORY_INVALID"},{status:400});
        normalizedRules.push({rule_type:"CATEGORY",rule_value:{category_id:categoryId}});
      } else return Response.json({error:"COUPON_RULE_NOT_SUPPORTED"},{status:400});
    }
    if(normalizedRules.length>1) return Response.json({error:"ONE_COUPON_RULE_ALLOWED"},{status:400});

    const row={code,discount_type:discountType,discount_value:money(discountValue),minimum_order:money(minimumOrder),max_uses:maxUses,max_uses_per_customer:maxUsesPerCustomer,starts_at:startsAt,ends_at:endsAt};
    let result:any;
    if(id) result=await ctx.supabaseAdmin.from("coupons").update(row).eq("id",id).eq("store_id",storeId).select("id,code,discount_type,discount_value,minimum_order,max_uses,max_uses_per_customer,starts_at,ends_at,active,created_at").maybeSingle();
    else result=await ctx.supabaseAdmin.from("coupons").insert({store_id:storeId,...row,active:true}).select("id,code,discount_type,discount_value,minimum_order,max_uses,max_uses_per_customer,starts_at,ends_at,active,created_at").single();
    if(result.error){
      const message=String(result.error.message??"");
      return Response.json({error:message.includes("coupons_store_id_code_key")?"COUPON_CODE_EXISTS":"COUPON_SAVE_FAILED"},{status:message.includes("coupons_store_id_code_key")?409:500});
    }
    if(!result.data) return Response.json({error:"COUPON_NOT_FOUND"},{status:404});
    const couponId=String(result.data.id);
    const del=await ctx.supabaseAdmin.from("coupon_rules").delete().eq("coupon_id",couponId); if(del.error) return Response.json({error:"COUPON_RULE_SAVE_FAILED"},{status:500});
    if(normalizedRules.length){ const ins=await ctx.supabaseAdmin.from("coupon_rules").insert(normalizedRules.map(r=>({coupon_id:couponId,rule_type:r.rule_type,rule_value:r.rule_value}))); if(ins.error) return Response.json({error:"COUPON_RULE_SAVE_FAILED"},{status:500}); }
    await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:userId,action:id?"STORE_COUPON_UPDATED":"STORE_COUPON_CREATED",entity_type:"coupon",entity_id:couponId,after_data:{storeId,code,discountType,rule:normalizedRules[0]?.rule_type??null}});
    return Response.json({coupon:result.data});
  }

  if(action==="TOGGLE_COUPON"){
    const id=String(body.id??""); if(!id) return Response.json({error:"COUPON_REQUIRED"},{status:400});
    const{data,error}=await ctx.supabaseAdmin.from("coupons").update({active:body.active===true}).eq("id",id).eq("store_id",storeId).select("id,active").maybeSingle();
    if(error) return Response.json({error:"COUPON_TOGGLE_FAILED"},{status:500});
    if(!data) return Response.json({error:"COUPON_NOT_FOUND"},{status:404});
    await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:userId,action:"STORE_COUPON_STATUS_CHANGED",entity_type:"coupon",entity_id:id,after_data:{storeId,active:data.active}});
    return Response.json({coupon:data});
  }

  return Response.json({error:"INVALID_ACTION"},{status:400});
})};
