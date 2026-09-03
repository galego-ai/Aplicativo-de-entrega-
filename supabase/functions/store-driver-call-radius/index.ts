import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body={storeId:string;driverCallRadiusKm?:number};

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
 let body:Body;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
 if(!body.storeId)return Response.json({error:"STORE_ID_REQUIRED"},{status:400});
 const role=String(ctx.userClaims!.appMetadata?.clickfood_role??"");
 let allowed=["SUPER_ADMIN","ADMIN"].includes(role);
 if(!allowed){const{data}=await ctx.supabaseAdmin.from("store_memberships").select("id").eq("store_id",body.storeId).eq("user_id",ctx.userClaims!.id).eq("active",true).in("role",["OWNER","MANAGER"]).maybeSingle();allowed=!!data;}
 if(!allowed)return Response.json({error:"STORE_MANAGER_REQUIRED"},{status:403});
 const[{data:store},{data:current}]=await Promise.all([
  ctx.supabaseAdmin.from("stores").select("city_id").eq("id",body.storeId).maybeSingle(),
  ctx.supabaseAdmin.from("store_delivery_settings").select("driver_call_radius_km").eq("store_id",body.storeId).maybeSingle(),
 ]);
 if(!store)return Response.json({error:"STORE_NOT_FOUND"},{status:404});
 const{data:dispatch}=await ctx.supabaseAdmin.from("delivery_dispatch_settings").select("max_radius_km").eq("city_id",store.city_id).maybeSingle();
 const matrixMaxRadius=Number(dispatch?.max_radius_km??20);
 const currentRadius=Number(current?.driver_call_radius_km??Math.min(5,matrixMaxRadius));
 if(body.driverCallRadiusKm==null)return Response.json({settings:{driver_call_radius_km:currentRadius,matrix_max_radius_km:matrixMaxRadius}});
 if(!Number.isFinite(body.driverCallRadiusKm)||body.driverCallRadiusKm<=0||body.driverCallRadiusKm>200)return Response.json({error:"INVALID_DRIVER_CALL_RADIUS"},{status:400});
 if(body.driverCallRadiusKm>matrixMaxRadius)return Response.json({error:"RADIUS_EXCEEDS_MATRIX_LIMIT",matrixMaxRadius},{status:400});
 const before={driver_call_radius_km:currentRadius};
 const existing=await ctx.supabaseAdmin.from("store_delivery_settings").select("store_id").eq("store_id",body.storeId).maybeSingle();
 let data:any,error:any;
 if(!existing.data){const created=await ctx.supabaseAdmin.from("store_delivery_settings").insert({store_id:body.storeId,driver_call_radius_km:body.driverCallRadiusKm,updated_at:new Date().toISOString()}).select("store_id,driver_call_radius_km").single();data=created.data;error=created.error;}else{const updated=await ctx.supabaseAdmin.from("store_delivery_settings").update({driver_call_radius_km:body.driverCallRadiusKm,updated_at:new Date().toISOString()}).eq("store_id",body.storeId).select("store_id,driver_call_radius_km").single();data=updated.data;error=updated.error;}
 if(error)return Response.json({error:"SAVE_FAILED"},{status:500});
 await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:ctx.userClaims!.id,action:"STORE_DRIVER_CALL_RADIUS_UPDATED",entity_type:"store",entity_id:body.storeId,before_data:before,after_data:data});
 return Response.json({settings:{...data,matrix_max_radius_km:matrixMaxRadius}});
})};
