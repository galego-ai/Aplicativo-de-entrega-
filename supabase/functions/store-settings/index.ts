import { withSupabase } from "npm:@supabase/server@1.4.1";

type Body={
 storeId:string;
 name?:string;
 slogan?:string;
 description?:string;
 phone?:string;
 email?:string;
 whatsapp?:string;
 instagram?:string;
 addressLine?:string;
 neighborhood?:string;
 postalCode?:string;
 addressComplement?:string;
 primaryColor?:string;
 secondaryColor?:string;
 minimumOrder?:number;
 averagePreparationTime?:number;
 latitude?:number;
 longitude?:number;
 logoPath?:string|null;
 coverPath?:string|null;
};

const hex=/^#[0-9A-Fa-f]{6}$/;
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean=(value:string|undefined,max:number)=>value===undefined?undefined:value.trim().slice(0,max)||null;

export default{fetch:withSupabase({auth:"user"},async(req,ctx)=>{
 if(req.method!=="POST")return Response.json({error:"METHOD_NOT_ALLOWED"},{status:405});
 let body:Body;try{body=await req.json()}catch{return Response.json({error:"INVALID_JSON"},{status:400})}
 if(!body.storeId)return Response.json({error:"STORE_ID_REQUIRED"},{status:400});
 const userId=ctx.userClaims!.id,platformRole=String(ctx.userClaims!.appMetadata?.clickfood_role??""),isAdmin=["SUPER_ADMIN","ADMIN"].includes(platformRole);
 if(!isAdmin){
  const{data:membership,error}=await ctx.supabaseAdmin.from("store_memberships").select("role").eq("store_id",body.storeId).eq("user_id",userId).eq("active",true).maybeSingle();
  if(error)return Response.json({error:"MEMBERSHIP_LOOKUP_FAILED"},{status:500});
  if(!membership||!["OWNER","MANAGER"].includes(membership.role))return Response.json({error:"STORE_ACCESS_DENIED"},{status:403});
 }
 const patch:Record<string,unknown>={updated_at:new Date().toISOString()};
 if(body.name!==undefined){const value=body.name.trim().slice(0,120);if(value.length<2)return Response.json({error:"INVALID_STORE_NAME"},{status:400});patch.name=value;}
 if(body.slogan!==undefined)patch.slogan=clean(body.slogan,140);
 if(body.description!==undefined)patch.description=clean(body.description,1200);
 if(body.phone!==undefined)patch.phone=clean(body.phone,30);
 if(body.email!==undefined){const value=body.email.trim().slice(0,160);if(value&& !emailPattern.test(value))return Response.json({error:"INVALID_EMAIL"},{status:400});patch.email=value||null;}
 if(body.whatsapp!==undefined)patch.whatsapp=clean(body.whatsapp,30);
 if(body.instagram!==undefined)patch.instagram=clean(body.instagram,80);
 if(body.addressLine!==undefined)patch.address_line=clean(body.addressLine,180);
 if(body.neighborhood!==undefined)patch.neighborhood=clean(body.neighborhood,100);
 if(body.postalCode!==undefined)patch.postal_code=clean(body.postalCode,20);
 if(body.addressComplement!==undefined)patch.address_complement=clean(body.addressComplement,120);
 if(body.primaryColor!==undefined){if(!hex.test(body.primaryColor))return Response.json({error:"INVALID_PRIMARY_COLOR"},{status:400});patch.primary_color=body.primaryColor.toUpperCase();}
 if(body.secondaryColor!==undefined){if(!hex.test(body.secondaryColor))return Response.json({error:"INVALID_SECONDARY_COLOR"},{status:400});patch.secondary_color=body.secondaryColor.toUpperCase();}
 if(body.minimumOrder!==undefined){if(!Number.isFinite(body.minimumOrder)||body.minimumOrder<0||body.minimumOrder>100000)return Response.json({error:"INVALID_MINIMUM_ORDER"},{status:400});patch.minimum_order=Math.round(body.minimumOrder*100)/100;}
 if(body.averagePreparationTime!==undefined){if(!Number.isInteger(body.averagePreparationTime)||body.averagePreparationTime<1||body.averagePreparationTime>300)return Response.json({error:"INVALID_PREPARATION_TIME"},{status:400});patch.average_preparation_time=body.averagePreparationTime;}
 if(body.latitude!==undefined||body.longitude!==undefined){if(!Number.isFinite(body.latitude)||!Number.isFinite(body.longitude)||Math.abs(body.latitude!)>90||Math.abs(body.longitude!)>180)return Response.json({error:"INVALID_COORDINATES"},{status:400});patch.latitude=body.latitude;patch.longitude=body.longitude;}
 for(const [field,path] of [["logo_url",body.logoPath],["cover_url",body.coverPath]] as const){
  if(path!==undefined){
   if(path===null||path===""){patch[field]=null;continue;}
   if(!path.startsWith(`${body.storeId}/`))return Response.json({error:"INVALID_MEDIA_PATH"},{status:400});
   const{data}=ctx.supabaseAdmin.storage.from("store-media").getPublicUrl(path);patch[field]=data.publicUrl;
  }
 }
 const{data:store,error}=await ctx.supabaseAdmin.from("stores").update(patch).eq("id",body.storeId).select("id,name,slogan,description,phone,email,whatsapp,instagram,logo_url,cover_url,primary_color,secondary_color,address_line,neighborhood,postal_code,address_complement,minimum_order,average_preparation_time,latitude,longitude,status").single();
 if(error)return Response.json({error:"STORE_UPDATE_FAILED"},{status:500});
 await ctx.supabaseAdmin.from("audit_logs").insert({actor_id:userId,action:"STORE_SETTINGS_UPDATED",entity_type:"store",entity_id:body.storeId,after_data:{fields:Object.keys(patch).filter(k=>k!=="updated_at")}});
 return Response.json({store});
})};
