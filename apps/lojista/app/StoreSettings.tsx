"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Props={storeId:string;role:string;onChanged?:()=>void};
type Profile={name:string;slogan:string;description:string;phone:string;email:string;whatsapp:string;instagram:string;logoUrl:string;coverUrl:string;primaryColor:string;secondaryColor:string;addressLine:string;neighborhood:string;postalCode:string;addressComplement:string;minimumOrder:string;preparationTime:string;latitude:string;longitude:string;status:string};
type Delivery={pricing_model:string;fixed_fee:number;base_fee:number;per_km_fee:number;minimum_fee:number;max_radius_km:number|null;pickup_enabled:boolean;clickfood_delivery_enabled:boolean;own_delivery_enabled:boolean};
type Hours={weekday:number;opens_at:string;closes_at:string;closed:boolean};

type BrandFile={file:File|null;preview:string};

const days=["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
const allowedTypes=new Set(["image/jpeg","image/png","image/webp"]);
const maxImageBytes=8*1024*1024;
const blankProfile:Profile={name:"",slogan:"",description:"",phone:"",email:"",whatsapp:"",instagram:"",logoUrl:"",coverUrl:"",primaryColor:"#F4C400",secondaryColor:"#111111",addressLine:"",neighborhood:"",postalCode:"",addressComplement:"",minimumOrder:"0",preparationTime:"30",latitude:"",longitude:"",status:"PENDING"};
const blankDelivery:Delivery={pricing_model:"FIXED",fixed_fee:5,base_fee:4,per_km_fee:1.5,minimum_fee:5,max_radius_km:10,pickup_enabled:true,clickfood_delivery_enabled:true,own_delivery_enabled:false};
const brl=(value:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value||0);
const hex=/^#[0-9A-Fa-f]{6}$/;

export default function StoreSettings({storeId,role,onChanged}:Props){
 const[loading,setLoading]=useState(true);const[saving,setSaving]=useState(false);const[locating,setLocating]=useState(false);const[message,setMessage]=useState("");
 const[profile,setProfile]=useState<Profile>(blankProfile);const[delivery,setDelivery]=useState<Delivery>(blankDelivery);const[hours,setHours]=useState<Hours[]>(days.map((_,weekday)=>({weekday,opens_at:"08:00",closes_at:"22:00",closed:false})));
 const[logo,setLogo]=useState<BrandFile>({file:null,preview:""});const[cover,setCover]=useState<BrandFile>({file:null,preview:""});
 const canManage=["OWNER","MANAGER"].includes(role);
 const storefrontStatus=useMemo(()=>profile.status==="ACTIVE"?"Loja ativa":`Loja ${profile.status.toLowerCase()}`,[profile.status]);
 const deliveryLabels=useMemo(()=>[delivery.clickfood_delivery_enabled?"Entrega CLICK-FOOD":"",delivery.own_delivery_enabled?"Entrega própria":"",delivery.pickup_enabled?"Retirada":""].filter(Boolean),[delivery]);

 async function load(){
  setLoading(true);setMessage("");
  const[sR,dR,hR]=await Promise.all([
   supabase.from("stores").select("name,slogan,description,phone,email,whatsapp,instagram,logo_url,cover_url,primary_color,secondary_color,address_line,neighborhood,postal_code,address_complement,minimum_order,average_preparation_time,latitude,longitude,status").eq("id",storeId).maybeSingle(),
   supabase.from("store_delivery_settings").select("pricing_model,fixed_fee,base_fee,per_km_fee,minimum_fee,max_radius_km,pickup_enabled,clickfood_delivery_enabled,own_delivery_enabled").eq("store_id",storeId).maybeSingle(),
   supabase.from("store_business_hours").select("weekday,opens_at,closes_at,closed").eq("store_id",storeId).order("weekday")
  ]);
  if(sR.error){setMessage("Não foi possível carregar os dados da loja.");setLoading(false);return;}
  if(sR.data){const s:any=sR.data;setProfile({name:s.name??"",slogan:s.slogan??"",description:s.description??"",phone:s.phone??"",email:s.email??"",whatsapp:s.whatsapp??"",instagram:s.instagram??"",logoUrl:s.logo_url??"",coverUrl:s.cover_url??"",primaryColor:s.primary_color??"#F4C400",secondaryColor:s.secondary_color??"#111111",addressLine:s.address_line??"",neighborhood:s.neighborhood??"",postalCode:s.postal_code??"",addressComplement:s.address_complement??"",minimumOrder:String(Number(s.minimum_order??0)),preparationTime:String(Number(s.average_preparation_time??30)),latitude:s.latitude==null?"":String(Number(s.latitude)),longitude:s.longitude==null?"":String(Number(s.longitude)),status:s.status??"PENDING"});}
  if(dR.data){const d:any=dR.data;setDelivery({...d,fixed_fee:Number(d.fixed_fee),base_fee:Number(d.base_fee),per_km_fee:Number(d.per_km_fee),minimum_fee:Number(d.minimum_fee),max_radius_km:d.max_radius_km==null?null:Number(d.max_radius_km)} as Delivery);}
  if(hR.data?.length){const byDay=new Map(hR.data.map((x:any)=>[Number(x.weekday),x]));setHours(days.map((_,weekday)=>{const h:any=byDay.get(weekday);return h?{weekday,opens_at:String(h.opens_at??"08:00").slice(0,5),closes_at:String(h.closes_at??"22:00").slice(0,5),closed:Boolean(h.closed)}:{weekday,opens_at:"08:00",closes_at:"22:00",closed:false};}));}
  setLoading(false);
 }
 useEffect(()=>{void load();},[storeId]);
 useEffect(()=>()=>{for(const value of [logo.preview,cover.preview])if(value.startsWith("blob:"))URL.revokeObjectURL(value);},[logo.preview,cover.preview]);

 function chooseBrandImage(kind:"logo"|"cover",e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0]??null;if(!file)return;
  if(!allowedTypes.has(file.type)){setMessage("Use imagem JPG, PNG ou WEBP.");e.target.value="";return;}
  if(file.size>maxImageBytes){setMessage("A imagem deve ter no máximo 8 MB.");e.target.value="";return;}
  const setter=kind==="logo"?setLogo:setCover;const current=kind==="logo"?logo:cover;if(current.preview.startsWith("blob:"))URL.revokeObjectURL(current.preview);setter({file,preview:URL.createObjectURL(file)});setMessage("");
 }
 async function uploadBrand(file:File,kind:"logo"|"cover"){
  const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";const path=`${storeId}/branding/${kind}-${crypto.randomUUID()}.${ext}`;
  const{error}=await supabase.storage.from("store-media").upload(path,file,{contentType:file.type,cacheControl:"3600",upsert:false});if(error)throw error;return path;
 }

 async function saveProfile(coords?:{latitude:number;longitude:number}){
  if(!canManage)return setMessage("Somente proprietário ou gerente pode alterar a loja.");
  const minimumOrder=Number(profile.minimumOrder.replace(",",".")),prep=Number(profile.preparationTime);const latitude=coords?.latitude??(profile.latitude.trim()?Number(profile.latitude.replace(",",".")):undefined),longitude=coords?.longitude??(profile.longitude.trim()?Number(profile.longitude.replace(",",".")):undefined);
  if(profile.name.trim().length<2)return setMessage("Informe o nome público da loja.");
  if(!hex.test(profile.primaryColor)||!hex.test(profile.secondaryColor))return setMessage("As cores devem estar no formato hexadecimal, por exemplo #F4C400.");
  if(!Number.isFinite(minimumOrder)||minimumOrder<0||!Number.isInteger(prep)||prep<1)return setMessage("Revise pedido mínimo e tempo de preparo.");
  if((latitude===undefined)!==(longitude===undefined))return setMessage("Preencha latitude e longitude juntas.");
  setSaving(true);setMessage("");const uploaded:string[]=[];
  try{
   let logoPath:undefined|string,coverPath:undefined|string;if(logo.file){logoPath=await uploadBrand(logo.file,"logo");uploaded.push(logoPath);}if(cover.file){coverPath=await uploadBrand(cover.file,"cover");uploaded.push(coverPath);}
   const{data,error}=await supabase.functions.invoke("store-settings",{body:{storeId,name:profile.name,slogan:profile.slogan,description:profile.description,phone:profile.phone,email:profile.email,whatsapp:profile.whatsapp,instagram:profile.instagram,addressLine:profile.addressLine,neighborhood:profile.neighborhood,postalCode:profile.postalCode,addressComplement:profile.addressComplement,primaryColor:profile.primaryColor,secondaryColor:profile.secondaryColor,minimumOrder,averagePreparationTime:prep,...(latitude!==undefined&&longitude!==undefined?{latitude,longitude}:{}),...(logoPath?{logoPath}:{}),...(coverPath?{coverPath}:{})}});
   if(error||data?.error)throw new Error(String(data?.error??"SAVE_FAILED"));const s:any=data.store;setProfile(p=>({...p,name:s.name??p.name,slogan:s.slogan??"",description:s.description??"",phone:s.phone??"",email:s.email??"",whatsapp:s.whatsapp??"",instagram:s.instagram??"",logoUrl:s.logo_url??p.logoUrl,coverUrl:s.cover_url??p.coverUrl,primaryColor:s.primary_color??p.primaryColor,secondaryColor:s.secondary_color??p.secondaryColor,addressLine:s.address_line??"",neighborhood:s.neighborhood??"",postalCode:s.postal_code??"",addressComplement:s.address_complement??"",minimumOrder:String(Number(s.minimum_order??0)),preparationTime:String(Number(s.average_preparation_time??30)),latitude:s.latitude==null?"":String(Number(s.latitude)),longitude:s.longitude==null?"":String(Number(s.longitude)),status:s.status??p.status}));setLogo({file:null,preview:""});setCover({file:null,preview:""});setMessage("Configurações da loja salvas e publicadas.");onChanged?.();
  }catch(err){if(uploaded.length)await supabase.storage.from("store-media").remove(uploaded);const code=err instanceof Error?err.message:"";const labels:Record<string,string>={INVALID_EMAIL:"Informe um e-mail válido.",INVALID_PRIMARY_COLOR:"Revise a cor principal.",INVALID_SECONDARY_COLOR:"Revise a cor secundária.",STORE_ACCESS_DENIED:"Você não tem permissão para alterar esta loja."};setMessage(labels[code]??"Não foi possível salvar as configurações da loja.");}finally{setSaving(false);}
 }
 function captureLocation(){if(!navigator.geolocation)return setMessage("Este navegador não oferece geolocalização.");setLocating(true);navigator.geolocation.getCurrentPosition(async pos=>{setProfile(p=>({...p,latitude:String(pos.coords.latitude),longitude:String(pos.coords.longitude)}));await saveProfile({latitude:pos.coords.latitude,longitude:pos.coords.longitude});setLocating(false)},()=>{setMessage("Permita a localização do navegador ou informe as coordenadas manualmente.");setLocating(false)},{enableHighAccuracy:true,timeout:15000,maximumAge:30000});}

 async function saveDelivery(){
  if(!canManage)return setMessage("Somente proprietário ou gerente pode alterar a entrega.");
  const{data,error}=await supabase.functions.invoke("store-delivery-settings-action",{body:{storeId,pricingModel:delivery.pricing_model,fixedFee:Number(delivery.fixed_fee),baseFee:Number(delivery.base_fee),perKmFee:Number(delivery.per_km_fee),minimumFee:Number(delivery.minimum_fee),maxRadiusKm:delivery.max_radius_km==null?null:Number(delivery.max_radius_km),pickupEnabled:delivery.pickup_enabled,clickfoodDeliveryEnabled:delivery.clickfood_delivery_enabled,ownDeliveryEnabled:delivery.own_delivery_enabled}});if(error||data?.error){setMessage("Não foi possível salvar as regras de entrega. Revise valores e raio.");return;}setMessage("Regras de atendimento e entrega salvas.");await load();onChanged?.();
 }
 async function saveHours(){
  if(!canManage)return setMessage("Somente proprietário ou gerente pode alterar os horários.");const payload=hours.map(h=>({weekday:h.weekday,opens_at:h.closed?null:h.opens_at,closes_at:h.closed?null:h.closes_at,closed:h.closed}));const{data,error}=await supabase.functions.invoke("store-hours-action",{body:{storeId,hours:payload}});if(error||data?.error){setMessage("Não foi possível salvar os horários. Revise abertura e fechamento dos sete dias.");return;}setMessage("Horários de funcionamento atualizados.");await load();onChanged?.();
 }

 if(loading)return <section className="storeSettingsLoading">Carregando configurações da loja...</section>;
 return <section className="storeSettings">
  <div className="settingsIntro"><div><span>CONFIGURAÇÃO PROFISSIONAL</span><h2>Identidade e operação da loja</h2><p>Esta área controla como sua loja aparece para o cliente e como ela opera no CLICK-FOOD. Produtos e categorias ficam exclusivamente no menu Produtos.</p></div><div className="settingsBadges"><b>{storefrontStatus}</b><span>{role}</span></div></div>
  {message&&<div className="settingsNotice">{message}</div>}
  {!canManage&&<div className="settingsNotice warning">Seu acesso é de consulta. Apenas Proprietário ou Gerente pode salvar alterações.</div>}

  <article className="storefrontPreview" style={{"--brand":profile.primaryColor,"--brand-dark":profile.secondaryColor} as React.CSSProperties}>
   <div className="previewCover" style={{backgroundImage:`linear-gradient(180deg,transparent,rgba(0,0,0,.62)),url(${cover.preview||profile.coverUrl||""})`}}><div className="previewLogo">{logo.preview||profile.logoUrl?<img src={logo.preview||profile.logoUrl} alt="Logo da loja"/>:<span>{profile.name.slice(0,2).toUpperCase()||"CF"}</span>}</div></div>
   <div className="previewBody"><div><small>PRÉVIA PARA O CLIENTE</small><h3>{profile.name||"Nome da loja"}</h3><strong>{profile.slogan||"Seu slogan aparecerá aqui"}</strong><p>{profile.description||"Adicione uma descrição clara sobre sua cozinha, especialidades e diferenciais."}</p></div><div className="previewFacts"><span>⏱ {profile.preparationTime||"30"} min</span><span>Pedido mín. {brl(Number(profile.minimumOrder.replace(",","."))||0)}</span>{deliveryLabels.map(label=><span key={label}>{label}</span>)}</div></div>
  </article>

  <div className="settingsGrid">
   <article className="settingsCard brandCard"><div className="settingsTitle"><div><small>IDENTIDADE VISUAL</small><h3>Marca da loja</h3></div><span>Cliente</span></div>
    <label>Nome público da loja<input value={profile.name} maxLength={120} onChange={e=>setProfile({...profile,name:e.target.value})}/></label>
    <label>Slogan<input value={profile.slogan} maxLength={140} placeholder="Ex.: Sabor de verdade, todo dia" onChange={e=>setProfile({...profile,slogan:e.target.value})}/></label>
    <label>Descrição<textarea value={profile.description} maxLength={1200} placeholder="Conte ao cliente o que torna sua loja especial." onChange={e=>setProfile({...profile,description:e.target.value})}/></label>
    <div className="brandUploads"><label className="brandUpload"><b>Logo</b><span>Quadrada, ideal 800×800</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>chooseBrandImage("logo",e)}/></label><label className="brandUpload"><b>Capa</b><span>Horizontal, ideal 1600×700</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>chooseBrandImage("cover",e)}/></label></div>
    <div className="colorRow"><label>Cor principal<div className="colorField"><input type="color" value={hex.test(profile.primaryColor)?profile.primaryColor:"#F4C400"} onChange={e=>setProfile({...profile,primaryColor:e.target.value.toUpperCase()})}/><input value={profile.primaryColor} maxLength={7} onChange={e=>setProfile({...profile,primaryColor:e.target.value.toUpperCase()})}/></div></label><label>Cor de contraste<div className="colorField"><input type="color" value={hex.test(profile.secondaryColor)?profile.secondaryColor:"#111111"} onChange={e=>setProfile({...profile,secondaryColor:e.target.value.toUpperCase()})}/><input value={profile.secondaryColor} maxLength={7} onChange={e=>setProfile({...profile,secondaryColor:e.target.value.toUpperCase()})}/></div></label></div>
   </article>

   <article className="settingsCard"><div className="settingsTitle"><div><small>CONTATO</small><h3>Canais da loja</h3></div></div><div className="twoFields"><label>Telefone<input value={profile.phone} onChange={e=>setProfile({...profile,phone:e.target.value})}/></label><label>WhatsApp<input value={profile.whatsapp} placeholder="(62) 99999-9999" onChange={e=>setProfile({...profile,whatsapp:e.target.value})}/></label></div><label>E-mail comercial<input type="email" value={profile.email} onChange={e=>setProfile({...profile,email:e.target.value})}/></label><label>Instagram<input value={profile.instagram} placeholder="@minhaloja" onChange={e=>setProfile({...profile,instagram:e.target.value})}/></label>
    <div className="settingsTitle sub"><div><small>ENDEREÇO</small><h3>Localização comercial</h3></div></div><label>Rua / avenida e número<input value={profile.addressLine} placeholder="Av. Brasil, 100" onChange={e=>setProfile({...profile,addressLine:e.target.value})}/></label><div className="twoFields"><label>Bairro<input value={profile.neighborhood} onChange={e=>setProfile({...profile,neighborhood:e.target.value})}/></label><label>CEP<input value={profile.postalCode} placeholder="00000-000" onChange={e=>setProfile({...profile,postalCode:e.target.value})}/></label></div><label>Complemento<input value={profile.addressComplement} placeholder="Loja 2, piso térreo..." onChange={e=>setProfile({...profile,addressComplement:e.target.value})}/></label><div className="twoFields"><label>Latitude<input value={profile.latitude} placeholder="-14.52" onChange={e=>setProfile({...profile,latitude:e.target.value})}/></label><label>Longitude<input value={profile.longitude} placeholder="-49.14" onChange={e=>setProfile({...profile,longitude:e.target.value})}/></label></div><button className="settingsSecondary" onClick={captureLocation} disabled={locating||!canManage}>{locating?"CAPTURANDO GPS...":"USAR LOCALIZAÇÃO DESTA LOJA"}</button>
   </article>

   <article className="settingsCard"><div className="settingsTitle"><div><small>OPERAÇÃO</small><h3>Regras comerciais</h3></div></div><div className="twoFields"><label>Pedido mínimo (R$)<input inputMode="decimal" value={profile.minimumOrder} onChange={e=>setProfile({...profile,minimumOrder:e.target.value})}/></label><label>Preparo médio (min)<input inputMode="numeric" value={profile.preparationTime} onChange={e=>setProfile({...profile,preparationTime:e.target.value})}/></label></div><p className="settingsHint">Esses valores aparecem para o cliente e entram no cálculo da experiência de compra.</p><button className="settingsPrimary" onClick={()=>void saveProfile()} disabled={saving||!canManage}>{saving?"SALVANDO...":"SALVAR IDENTIDADE E DADOS"}</button></article>

   <article className="settingsCard"><div className="settingsTitle"><div><small>ATENDIMENTO</small><h3>Delivery e retirada</h3></div></div><div className="serviceChecks"><label><input type="checkbox" checked={delivery.pickup_enabled} onChange={e=>setDelivery({...delivery,pickup_enabled:e.target.checked})}/> Retirada na loja</label><label><input type="checkbox" checked={delivery.clickfood_delivery_enabled} onChange={e=>setDelivery({...delivery,clickfood_delivery_enabled:e.target.checked})}/> Entregadores CLICK-FOOD</label><label><input type="checkbox" checked={delivery.own_delivery_enabled} onChange={e=>setDelivery({...delivery,own_delivery_enabled:e.target.checked})}/> Entrega própria</label></div><label>Modelo de frete<select value={delivery.pricing_model} onChange={e=>setDelivery({...delivery,pricing_model:e.target.value})}><option value="FIXED">Taxa fixa</option><option value="DISTANCE">Por distância</option></select></label><div className="twoFields"><label>Taxa fixa<input inputMode="decimal" value={delivery.fixed_fee} onChange={e=>setDelivery({...delivery,fixed_fee:Number(e.target.value)})}/></label><label>Raio máximo (km)<input inputMode="decimal" value={delivery.max_radius_km??""} onChange={e=>setDelivery({...delivery,max_radius_km:e.target.value===""?null:Number(e.target.value)})}/></label></div>{delivery.pricing_model==="DISTANCE"&&<div className="threeFields"><label>Base<input inputMode="decimal" value={delivery.base_fee} onChange={e=>setDelivery({...delivery,base_fee:Number(e.target.value)})}/></label><label>Por km<input inputMode="decimal" value={delivery.per_km_fee} onChange={e=>setDelivery({...delivery,per_km_fee:Number(e.target.value)})}/></label><label>Mínima<input inputMode="decimal" value={delivery.minimum_fee} onChange={e=>setDelivery({...delivery,minimum_fee:Number(e.target.value)})}/></label></div>}<button className="settingsPrimary" onClick={saveDelivery} disabled={!canManage}>SALVAR ATENDIMENTO</button></article>

   <article className="settingsCard hoursSettings"><div className="settingsTitle"><div><small>FUNCIONAMENTO</small><h3>Horários da semana</h3></div><span>7 dias</span></div><div className="hoursList">{hours.map((h,index)=><div className="hourRow" key={h.weekday}><b>{days[h.weekday]}</b><label className="closedCheck"><input type="checkbox" checked={h.closed} onChange={e=>setHours(hours.map((x,i)=>i===index?{...x,closed:e.target.checked}:x))}/> Fechado</label><input type="time" disabled={h.closed} value={h.opens_at} onChange={e=>setHours(hours.map((x,i)=>i===index?{...x,opens_at:e.target.value}:x))}/><span>até</span><input type="time" disabled={h.closed} value={h.closes_at} onChange={e=>setHours(hours.map((x,i)=>i===index?{...x,closes_at:e.target.value}:x))}/></div>)}</div><button className="settingsPrimary" onClick={saveHours} disabled={!canManage}>SALVAR HORÁRIOS</button></article>
  </div>
 </section>;
}
