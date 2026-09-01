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

    const[
      metricsResult,couponsResult,productsResult,ordersResult,inventoryResult,financeResult,
      deliveriesResult,bonusWalletResult,bonusTxResult,loyaltyResult
    ]=await Promise.all([
      ctx.supabaseAdmin.rpc("store_dashboard_metrics",{p_store_id:storeId}),
      ctx.supabaseAdmin.from("coupons").select("id,code,discount_type,discount_value,minimum_order,max_uses,ends_at,active").eq("store_id",storeId).order("created_at",{ascending:false}),
      ctx.supabaseAdmin.from("products").select("id,name,description,image_url,price,promotional_price,active,category_id,available_delivery,available_pos,control_inventory").eq("store_id",storeId).order("name"),
      ctx.supabaseAdmin.from("orders").select("id,order_number,customer_id,total,status,payment_status,delivery_type,source,created_at").eq("store_id",storeId).order("created_at",{ascending:false}).limit(100),
      ctx.supabaseAdmin.from("inventory_items").select("id,product_id,quantity,minimum_quantity,products(name)").eq("store_id",storeId),
      ctx.supabaseAdmin.from("financial_transactions").select("id,transaction_type,direction,amount,status,created_at").eq("store_id",storeId).order("created_at",{ascending:false}).limit(100),
      ctx.supabaseAdmin.from("deliveries").select("id,status,delivery_fee,driver_earning,created_at,orders!inner(order_number,total,store_id)").eq("orders.store_id",storeId).order("created_at",{ascending:false}).limit(50),
      ctx.supabaseAdmin.from("store_bonus_wallets").select("id,balance").eq("store_id",storeId).maybeSingle(),
      ctx.supabaseAdmin.from("store_bonus_transactions").select("id,transaction_type,points,description,created_at,store_bonus_wallets!inner(store_id)").eq("store_bonus_wallets.store_id",storeId).order("created_at",{ascending:false}).limit(50),
      ctx.supabaseAdmin.from("loyalty_programs").select("id,points_per_currency,active").eq("store_id",storeId).maybeSingle(),
    ]);

    const coreResults=[metricsResult,couponsResult,productsResult,ordersResult,inventoryResult,financeResult,deliveriesResult,bonusWalletResult,bonusTxResult,loyaltyResult];
    if(coreResults.some(result=>result.error))return Response.json({error:"STORE_DASHBOARD_READ_FAILED"},{status:500});

    const orderRows=ordersResult.data??[];
    const orderIds=orderRows.map((order:any)=>String(order.id));
    let refundsByOrder:Record<string,any>={};
    if(orderIds.length){
      const{data:payments,error:paymentsError}=await ctx.supabaseAdmin.from("payments").select("id,order_id").in("order_id",orderIds).in("method",["PIX","CREDIT_CARD"]);
      if(paymentsError)return Response.json({error:"STORE_REFUNDS_READ_FAILED"},{status:500});
      if(payments?.length){
        const paymentIds=payments.map((payment:any)=>payment.id);
        const paymentToOrder=new Map(payments.map((payment:any)=>[String(payment.id),String(payment.order_id)]));
        const{data:refunds,error:refundsError}=await ctx.supabaseAdmin.from("refunds").select("payment_id,status,amount,created_at,completed_at").in("payment_id",paymentIds).order("created_at",{ascending:false});
        if(refundsError)return Response.json({error:"STORE_REFUNDS_READ_FAILED"},{status:500});
        for(const refund of refunds??[]){
          const orderId=paymentToOrder.get(String((refund as any).payment_id));
          if(orderId&&!refundsByOrder[orderId])refundsByOrder[orderId]=refund;
        }
      }
    }

    let loyaltyRewards:any[]=[];
    if(loyaltyResult.data?.id){
      const{data,error}=await ctx.supabaseAdmin.from("loyalty_rewards").select("id,name,points_cost,reward_type,reward_value,active").eq("program_id",loyaltyResult.data.id).order("points_cost");
      if(error)return Response.json({error:"STORE_LOYALTY_READ_FAILED"},{status:500});
      loyaltyRewards=data??[];
    }

    return Response.json({
      metrics:metricsResult.data??{},
      coupons:couponsResult.data??[],
      products:productsResult.data??[],
      orders:orderRows,
      refundsByOrder,
      inventory:inventoryResult.data??[],
      finance:financeResult.data??[],
      deliveries:deliveriesResult.data??[],
      bonusWallet:bonusWalletResult.data??null,
      bonusTransactions:bonusTxResult.data??[],
      loyaltyProgram:loyaltyResult.data??null,
      loyaltyRewards,
    });
  })
};