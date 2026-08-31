import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body={storeId:string};

export default{
  fetch:withSupabase({auth:"user"},async(req,ctx)=>{
    if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
    let body:Body;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
    const storeId=String(body?.storeId??"");
    if(!storeId)return Response.json({error:"STORE_REQUIRED"},{status:400});

    const userId=ctx.userClaims!.id;
    const role=String(ctx.userClaims!.appMetadata?.clickfood_role??"");
    const isAdmin=["SUPER_ADMIN","ADMIN","SUPPORT"].includes(role);
    if(!isAdmin){
      const{data:membership,error:membershipError}=await ctx.supabaseAdmin.from("store_memberships").select("store_id").eq("store_id",storeId).eq("user_id",userId).eq("active",true).maybeSingle();
      if(membershipError)return Response.json({error:"STORE_ACCESS_CHECK_FAILED"},{status:500});
      if(!membership)return Response.json({error:"STORE_ACCESS_DENIED"},{status:403});
    }

    const[metricsResult,couponsResult]=await Promise.all([
      ctx.supabaseAdmin.rpc("store_dashboard_metrics",{p_store_id:storeId}),
      ctx.supabaseAdmin.from("coupons").select("id,code,discount_type,discount_value,minimum_order,max_uses,ends_at,active").eq("store_id",storeId).order("created_at",{ascending:false}),
    ]);
    if(metricsResult.error)return Response.json({error:"METRICS_READ_FAILED"},{status:500});
    if(couponsResult.error)return Response.json({error:"COUPONS_READ_FAILED"},{status:500});

    return Response.json({metrics:metricsResult.data??{},coupons:couponsResult.data??[]});
  })
};
