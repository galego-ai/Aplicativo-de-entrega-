"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Props = { storeId: string; onChanged: () => void };
type Product = { id:string; name:string; price:number; active:boolean };
type DeliverySettings = { pricing_model:string; fixed_fee:number; base_fee:number; per_km_fee:number; minimum_fee:number; max_radius_km:number|null; pickup_enabled:boolean; clickfood_delivery_enabled:boolean; own_delivery_enabled:boolean };

const brl=(value:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value||0);

export default function StoreSetup({storeId,onChanged}:Props){
  const[products,setProducts]=useState<Product[]>([]); const[message,setMessage]=useState("");
  const[product,setProduct]=useState({name:"",description:"",price:""});
  const[delivery,setDelivery]=useState<DeliverySettings>({pricing_model:"FIXED",fixed_fee:5,base_fee:4,per_km_fee:1.5,minimum_fee:5,max_radius_km:10,pickup_enabled:true,clickfood_delivery_enabled:true,own_delivery_enabled:false});

  async function load(){
    const[productsResult,deliveryResult]=await Promise.all([
      supabase.from("products").select("id,name,price,active").eq("store_id",storeId).order("name"),
      supabase.from("store_delivery_settings").select("pricing_model,fixed_fee,base_fee,per_km_fee,minimum_fee,max_radius_km,pickup_enabled,clickfood_delivery_enabled,own_delivery_enabled").eq("store_id",storeId).maybeSingle(),
    ]);
    if(productsResult.data)setProducts(productsResult.data.map((item:any)=>({...item,price:Number(item.price)})));
    if(deliveryResult.data)setDelivery({...deliveryResult.data,fixed_fee:Number(deliveryResult.data.fixed_fee),base_fee:Number(deliveryResult.data.base_fee),per_km_fee:Number(deliveryResult.data.per_km_fee),minimum_fee:Number(deliveryResult.data.minimum_fee),max_radius_km:deliveryResult.data.max_radius_km==null?null:Number(deliveryResult.data.max_radius_km)} as DeliverySettings);
  }
  useEffect(()=>{load();},[storeId]);

  async function createProduct(event:FormEvent){
    event.preventDefault(); setMessage(""); const price=Number(product.price.replace(",","."));
    if(!product.name.trim()||!Number.isFinite(price)||price<=0){setMessage("Informe nome e preço válido.");return;}
    const{error}=await supabase.from("products").insert({store_id:storeId,name:product.name.trim(),description:product.description.trim()||null,price,active:true,available_delivery:true,available_pos:true,control_inventory:false});
    if(error){setMessage("Não foi possível cadastrar o produto.");return;}setProduct({name:"",description:"",price:""});setMessage("Produto cadastrado.");await load();onChanged();
  }

  async function toggleProduct(item:Product){const{error}=await supabase.from("products").update({active:!item.active,updated_at:new Date().toISOString()}).eq("id",item.id).eq("store_id",storeId);if(error){setMessage("Não foi possível alterar o produto.");return;}await load();onChanged();}

  async function saveDelivery(){
    setMessage(""); const{error}=await supabase.from("store_delivery_settings").update({pricing_model:delivery.pricing_model,fixed_fee:Number(delivery.fixed_fee),base_fee:Number(delivery.base_fee),per_km_fee:Number(delivery.per_km_fee),minimum_fee:Number(delivery.minimum_fee),max_radius_km:delivery.max_radius_km==null?null:Number(delivery.max_radius_km),pickup_enabled:delivery.pickup_enabled,clickfood_delivery_enabled:delivery.clickfood_delivery_enabled,own_delivery_enabled:delivery.own_delivery_enabled,updated_at:new Date().toISOString()}).eq("store_id",storeId);
    if(error){setMessage("Não foi possível salvar as regras de entrega.");return;}setMessage("Configuração de entrega salva.");
  }

  return <section className="setupGrid">
    <article className="setupCard"><div className="setupTitle"><div><small>CATÁLOGO</small><h2>Produtos</h2></div><span>{products.length} cadastrados</span></div><form onSubmit={createProduct}><input placeholder="Nome do produto" value={product.name} onChange={e=>setProduct({...product,name:e.target.value})}/><input placeholder="Descrição" value={product.description} onChange={e=>setProduct({...product,description:e.target.value})}/><input placeholder="Preço (ex.: 29,90)" inputMode="decimal" value={product.price} onChange={e=>setProduct({...product,price:e.target.value})}/><button className="setupPrimary">CADASTRAR PRODUTO</button></form><div className="setupList">{products.slice(0,8).map(item=><div key={item.id}><div><b>{item.name}</b><small>{brl(item.price)}</small></div><button onClick={()=>toggleProduct(item)}>{item.active?"Pausar":"Ativar"}</button></div>)}</div></article>
    <article className="setupCard"><div className="setupTitle"><div><small>ENTREGA</small><h2>Frete e atendimento</h2></div></div><label>Modelo<select value={delivery.pricing_model} onChange={e=>setDelivery({...delivery,pricing_model:e.target.value})}><option value="FREE">Grátis</option><option value="FIXED">Taxa fixa</option><option value="DISTANCE">Por distância</option></select></label>{delivery.pricing_model==="FIXED"&&<label>Taxa fixa<input inputMode="decimal" value={String(delivery.fixed_fee)} onChange={e=>setDelivery({...delivery,fixed_fee:Number(e.target.value.replace(",","."))||0})}/></label>}{delivery.pricing_model==="DISTANCE"&&<div className="setupRow"><label>Base<input inputMode="decimal" value={String(delivery.base_fee)} onChange={e=>setDelivery({...delivery,base_fee:Number(e.target.value.replace(",","."))||0})}/></label><label>Por km<input inputMode="decimal" value={String(delivery.per_km_fee)} onChange={e=>setDelivery({...delivery,per_km_fee:Number(e.target.value.replace(",","."))||0})}/></label></div>}<label>Raio máximo (km)<input inputMode="decimal" value={String(delivery.max_radius_km??"")} onChange={e=>setDelivery({...delivery,max_radius_km:e.target.value?Number(e.target.value.replace(",",".")):null})}/></label><div className="checkRows"><label><input type="checkbox" checked={delivery.clickfood_delivery_enabled} onChange={e=>setDelivery({...delivery,clickfood_delivery_enabled:e.target.checked})}/> Entregadores CLICK-FOOD</label><label><input type="checkbox" checked={delivery.own_delivery_enabled} onChange={e=>setDelivery({...delivery,own_delivery_enabled:e.target.checked})}/> Entrega própria</label><label><input type="checkbox" checked={delivery.pickup_enabled} onChange={e=>setDelivery({...delivery,pickup_enabled:e.target.checked})}/> Retirada na loja</label></div><button className="setupPrimary" onClick={saveDelivery}>SALVAR ENTREGA</button></article>
    {message&&<div className="setupMessage">{message}</div>}
  </section>;
}
