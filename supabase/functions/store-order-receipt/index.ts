import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body={orderId:string};

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
 let body:Body;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
 if(!body.orderId)return Response.json({error:"ORDER_REQUIRED"},{status:400});
 const{data:order,error:orderError}=await ctx.supabaseAdmin.from("orders").select("id,order_number,store_id,customer_id,address_id,source,delivery_type,status,payment_status,subtotal,delivery_fee,discount,total,customer_notes,created_at,accepted_at,ready_at,delivered_at,cancelled_at").eq("id",body.orderId).maybeSingle();
 if(orderError)return Response.json({error:"ORDER_LOOKUP_FAILED"},{status:500});
 if(!order)return Response.json({error:"ORDER_NOT_FOUND"},{status:404});
 const role=String(ctx.userClaims!.appMetadata?.clickfood_role??"");
 let authorized=["SUPER_ADMIN","ADMIN","SUPPORT"].includes(role);
 if(!authorized){const{data:membership}=await ctx.supabaseAdmin.from("store_memberships").select("role").eq("store_id",order.store_id).eq("user_id",ctx.userClaims!.id).eq("active",true).maybeSingle();authorized=!!membership;}
 if(!authorized)return Response.json({error:"STORE_ACCESS_DENIED"},{status:403});

 const[{data:store},{data:customer},{data:address},{data:items},{data:payment},{data:delivery}]=await Promise.all([
  ctx.supabaseAdmin.from("stores").select("name,document,phone,logo_url").eq("id",order.store_id).maybeSingle(),
  order.customer_id?ctx.supabaseAdmin.from("profiles").select("full_name").eq("id",order.customer_id).maybeSingle():Promise.resolve({data:null}),
  order.address_id?ctx.supabaseAdmin.from("customer_addresses").select("street,number,complement,district,postal_code,reference").eq("id",order.address_id).maybeSingle():Promise.resolve({data:null}),
  ctx.supabaseAdmin.from("order_items").select("id,product_name_snapshot,quantity,unit_price,total_price,notes").eq("order_id",order.id).order("id"),
  ctx.supabaseAdmin.from("payments").select("method,provider,status,amount,provider_transaction_id,paid_at").eq("order_id",order.id).order("created_at",{ascending:false}).limit(1).maybeSingle(),
  ctx.supabaseAdmin.from("deliveries").select("id,driver_id,status,delivery_fee,driver_earning,pickup_at,delivered_at").eq("order_id",order.id).maybeSingle(),
 ]);

 const itemRows=(items??[]) as any[];const itemIds=itemRows.map(i=>i.id);
 const{data:options}=itemIds.length?await ctx.supabaseAdmin.from("order_item_options").select("order_item_id,option_name_snapshot,price,quantity").in("order_item_id",itemIds):{data:[]};
 const optionMap=new Map<string,any[]>();for(const option of options??[]){const list=optionMap.get(option.order_item_id)??[];list.push({name:option.option_name_snapshot,price:Number(option.price),quantity:Number(option.quantity)});optionMap.set(option.order_item_id,list);}
 let driverInfo:any=null;
 if(delivery?.driver_id){const{data:driver}=await ctx.supabaseAdmin.from("drivers").select("user_id").eq("id",delivery.driver_id).maybeSingle();if(driver?.user_id){const{data:profile}=await ctx.supabaseAdmin.from("profiles").select("full_name,avatar_url").eq("id",driver.user_id).maybeSingle();driverInfo=profile?{name:profile.full_name??"Entregador CLICK-FOOD",avatarUrl:profile.avatar_url??null}:null;}}

 return Response.json({
  order:{...order,subtotal:Number(order.subtotal),delivery_fee:Number(order.delivery_fee),discount:Number(order.discount),total:Number(order.total)},
  store:store?{name:store.name,document:store.document??null,phone:store.phone??null,logoUrl:store.logo_url??null}:null,
  customer:{name:customer?.full_name??"Cliente CLICK-FOOD"},
  address:address??null,
  items:itemRows.map(item=>({id:item.id,name:item.product_name_snapshot,quantity:Number(item.quantity),unitPrice:Number(item.unit_price),totalPrice:Number(item.total_price),notes:item.notes??null,options:optionMap.get(item.id)??[]})),
  payment:payment?{method:payment.method,provider:payment.provider??null,status:payment.status,amount:Number(payment.amount),transactionId:payment.provider_transaction_id??null,paidAt:payment.paid_at??null}:null,
  delivery:delivery?{id:delivery.id,status:delivery.status,fee:Number(delivery.delivery_fee),driverEarning:Number(delivery.driver_earning),pickupAt:delivery.pickup_at??null,deliveredAt:delivery.delivered_at??null,driver:driverInfo}:null,
 });
})};
