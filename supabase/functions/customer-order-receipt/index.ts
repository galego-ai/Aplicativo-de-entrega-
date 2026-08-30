import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body={orderId:string};

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
 let body:Body;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
 const orderId=String(body?.orderId??"");if(!orderId)return Response.json({error:"ORDER_REQUIRED"},{status:400});
 const userId=ctx.userClaims!.id;
 const{data:order,error:orderError}=await ctx.supabaseAdmin.from("orders").select("id,order_number,store_id,customer_id,address_id,source,delivery_type,status,payment_status,subtotal,delivery_fee,discount,total,customer_notes,created_at,accepted_at,ready_at,delivered_at,cancelled_at").eq("id",orderId).maybeSingle();
 if(orderError)return Response.json({error:"ORDER_LOOKUP_FAILED"},{status:500});
 if(!order||order.customer_id!==userId)return Response.json({error:"ORDER_NOT_FOUND"},{status:404});

 const[{data:store},{data:address},{data:items},{data:payments},{data:delivery},{data:history}]=await Promise.all([
  ctx.supabaseAdmin.from("stores").select("name,phone,logo_url").eq("id",order.store_id).maybeSingle(),
  order.address_id?ctx.supabaseAdmin.from("customer_addresses").select("label,street,number,complement,district,postal_code,reference").eq("id",order.address_id).eq("user_id",userId).maybeSingle():Promise.resolve({data:null}),
  ctx.supabaseAdmin.from("order_items").select("id,product_name_snapshot,quantity,unit_price,total_price,notes").eq("order_id",order.id).order("id"),
  ctx.supabaseAdmin.from("payments").select("id,method,provider,status,amount,paid_at,created_at").eq("order_id",order.id).order("created_at",{ascending:true}),
  ctx.supabaseAdmin.from("deliveries").select("id,driver_id,status,delivery_fee,pickup_at,delivered_at").eq("order_id",order.id).maybeSingle(),
  ctx.supabaseAdmin.from("order_status_history").select("status,reason,created_at").eq("order_id",order.id).order("created_at",{ascending:true}),
 ]);

 const itemRows=(items??[]) as any[];const itemIds=itemRows.map(item=>String(item.id));
 const{data:options}=itemIds.length?await ctx.supabaseAdmin.from("order_item_options").select("order_item_id,option_name_snapshot,price,quantity").in("order_item_id",itemIds):{data:[]};
 const optionMap=new Map<string,any[]>();
 for(const option of options??[]){const key=String((option as any).order_item_id);const list=optionMap.get(key)??[];list.push({name:(option as any).option_name_snapshot,price:Number((option as any).price),quantity:Number((option as any).quantity)});optionMap.set(key,list);}

 let driver:any=null;
 if(delivery?.driver_id){
  const{data:driverRow}=await ctx.supabaseAdmin.from("drivers").select("user_id,rating").eq("id",delivery.driver_id).maybeSingle();
  if(driverRow?.user_id){const{data:profile}=await ctx.supabaseAdmin.from("profiles").select("full_name,avatar_url").eq("id",driverRow.user_id).maybeSingle();driver={name:profile?.full_name??"Entregador CLICK-FOOD",avatarUrl:profile?.avatar_url??null,rating:Number(driverRow.rating??5)};}
 }

 const paymentRows=(payments??[]).map((payment:any)=>({id:String(payment.id),method:String(payment.method),provider:payment.provider?String(payment.provider):null,status:String(payment.status),amount:Number(payment.amount),paidAt:payment.paid_at??null,createdAt:payment.created_at}));
 const paymentIds=paymentRows.map(payment=>payment.id);
 const{data:refunds}=paymentIds.length?await ctx.supabaseAdmin.from("refunds").select("payment_id,amount,reason,status,created_at,completed_at").in("payment_id",paymentIds).order("created_at",{ascending:true}):{data:[]};

 return Response.json({
  order:{id:order.id,orderNumber:Number(order.order_number),source:order.source,deliveryType:order.delivery_type,status:order.status,paymentStatus:order.payment_status,subtotal:Number(order.subtotal),deliveryFee:Number(order.delivery_fee),discount:Number(order.discount),total:Number(order.total),notes:order.customer_notes??null,createdAt:order.created_at,acceptedAt:order.accepted_at??null,readyAt:order.ready_at??null,deliveredAt:order.delivered_at??null,cancelledAt:order.cancelled_at??null},
  store:store?{name:store.name,phone:store.phone??null,logoUrl:store.logo_url??null}:null,
  address:address??null,
  items:itemRows.map(item=>({id:String(item.id),name:item.product_name_snapshot,quantity:Number(item.quantity),unitPrice:Number(item.unit_price),totalPrice:Number(item.total_price),notes:item.notes??null,options:optionMap.get(String(item.id))??[]})),
  payments:paymentRows.map(({id,...payment})=>payment),
  refunds:(refunds??[]).map((refund:any)=>({amount:Number(refund.amount),reason:refund.reason??null,status:refund.status,createdAt:refund.created_at,completedAt:refund.completed_at??null})),
  delivery:delivery?{status:delivery.status,fee:Number(delivery.delivery_fee),pickupAt:delivery.pickup_at??null,deliveredAt:delivery.delivered_at??null,driver}:null,
  history:(history??[]).map((row:any)=>({status:row.status,reason:row.reason??null,createdAt:row.created_at})),
 });
})};
