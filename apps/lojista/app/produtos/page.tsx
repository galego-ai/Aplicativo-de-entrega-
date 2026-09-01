"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type StoreAccess={id:string;name:string;role:string};
type Category={id:string;name:string;active:boolean};
type Product={id:string;name:string;description:string|null;image_url:string|null;price:number;promotional_price:number|null;active:boolean;category_id:string|null};

const brl=(v:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v||0);
const allowedTypes=new Set(["image/jpeg","image/png","image/webp"]);
const maxImageBytes=8*1024*1024;

export default function ProdutosPage(){
 const[loading,setLoading]=useState(true);const[store,setStore]=useState<StoreAccess|null>(null);const[categories,setCategories]=useState<Category[]>([]);const[products,setProducts]=useState<Product[]>([]);const[notice,setNotice]=useState("");const[saving,setSaving]=useState(false);const[imageFile,setImageFile]=useState<File|null>(null);const[imagePreview,setImagePreview]=useState("");
 const[form,setForm]=useState({name:"",description:"",price:"",promotionalPrice:"",categoryId:""});
 const canManage=store?.role==="OWNER"||store?.role==="MANAGER";
 const activeCount=products.filter(p=>p.active).length;const withImage=products.filter(p=>Boolean(p.image_url)).length;
 const selectedCategory=useMemo(()=>new Map(categories.map(c=>[c.id,c.name])),[categories]);

 async function load(){
  setLoading(true);setNotice("");
  const{data:s}=await supabase.auth.getSession();
  if(!s.session){setStore(null);setNotice("Entre no Painel Lojista primeiro.");setLoading(false);return;}
  const{data:m,error:membershipError}=await supabase.from("store_memberships").select("store_id,role,stores!inner(name)").eq("user_id",s.session.user.id).eq("active",true).limit(1);
  if(membershipError||!m?.length){setStore(null);setNotice("Sua conta ainda não está vinculada a uma loja.");setLoading(false);return;}
  const row:any=m[0],rel=Array.isArray(row.stores)?row.stores[0]:row.stores;const access={id:String(row.store_id),name:String(rel?.name??"Minha loja"),role:String(row.role)};setStore(access);
  const[pR,cR]=await Promise.all([
   supabase.from("products").select("id,name,description,image_url,price,promotional_price,active,category_id").eq("store_id",access.id).order("created_at",{ascending:false}),
   supabase.from("categories").select("id,name,active").eq("store_id",access.id).order("sort_order").order("name")
  ]);
  if(pR.error||cR.error){setNotice("Não foi possível carregar o catálogo agora.");setLoading(false);return;}
  setProducts((pR.data??[]).map((p:any)=>({...p,price:Number(p.price),promotional_price:p.promotional_price==null?null:Number(p.promotional_price)})) as Product[]);setCategories((cR.data??[]) as Category[]);setLoading(false);
 }
 useEffect(()=>{void load();},[]);
 useEffect(()=>()=>{if(imagePreview.startsWith("blob:"))URL.revokeObjectURL(imagePreview)},[imagePreview]);

 function selectImage(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0]??null;
  if(!file){setImageFile(null);setImagePreview("");return;}
  if(!allowedTypes.has(file.type)){setNotice("Use uma imagem JPG, PNG ou WEBP.");e.target.value="";return;}
  if(file.size>maxImageBytes){setNotice("A imagem deve ter no máximo 8 MB.");e.target.value="";return;}
  if(imagePreview.startsWith("blob:"))URL.revokeObjectURL(imagePreview);setImageFile(file);setImagePreview(URL.createObjectURL(file));setNotice("");
 }

 async function uploadProductImage(file:File){
  if(!store)throw new Error("STORE_REQUIRED");
  const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";const path=`${store.id}/products/${crypto.randomUUID()}.${ext}`;
  const{error}=await supabase.storage.from("store-media").upload(path,file,{contentType:file.type,cacheControl:"3600",upsert:false});if(error)throw error;
  const url=supabase.storage.from("store-media").getPublicUrl(path).data.publicUrl;return{path,url};
 }

 async function createProduct(e:FormEvent){
  e.preventDefault();if(!store||!canManage)return;
  const price=Number(form.price.replace(",","."));const promotionalPrice=form.promotionalPrice.trim()?Number(form.promotionalPrice.replace(",",".")):null;
  if(!form.name.trim()||!Number.isFinite(price)||price<=0){setNotice("Informe o nome e um preço válido.");return;}
  if(promotionalPrice!=null&&(!Number.isFinite(promotionalPrice)||promotionalPrice<=0||promotionalPrice>=price)){setNotice("O preço promocional deve ser maior que zero e menor que o preço normal.");return;}
  setSaving(true);setNotice("");let uploadedPath="";
  try{
   let imageUrl:string|null=null;
   if(imageFile){const uploaded=await uploadProductImage(imageFile);uploadedPath=uploaded.path;imageUrl=uploaded.url;}
   const{error}=await supabase.from("products").insert({store_id:store.id,category_id:form.categoryId||null,name:form.name.trim(),description:form.description.trim()||null,image_url:imageUrl,price,promotional_price:promotionalPrice,active:true,available_delivery:true,available_pos:true,control_inventory:false});
   if(error){if(uploadedPath)await supabase.storage.from("store-media").remove([uploadedPath]);throw error;}
   setForm({name:"",description:"",price:"",promotionalPrice:"",categoryId:""});setImageFile(null);if(imagePreview.startsWith("blob:"))URL.revokeObjectURL(imagePreview);setImagePreview("");setNotice("Produto cadastrado com sucesso. A foto já ficará disponível no cardápio do cliente.");await load();
  }catch{setNotice("Não foi possível cadastrar o produto. Verifique os dados e tente novamente.");}finally{setSaving(false);}
 }

 async function toggleProduct(p:Product){if(!store||!canManage)return;const{error}=await supabase.from("products").update({active:!p.active,updated_at:new Date().toISOString()}).eq("id",p.id).eq("store_id",store.id);setNotice(error?"Não foi possível alterar o produto.":p.active?"Produto pausado.":"Produto ativado.");if(!error)await load();}

 async function replaceImage(p:Product,file:File|null){
  if(!store||!canManage||!file)return;if(!allowedTypes.has(file.type)||file.size>maxImageBytes){setNotice("Use JPG, PNG ou WEBP de até 8 MB.");return;}setNotice("Enviando nova foto...");
  try{const uploaded=await uploadProductImage(file);const{error}=await supabase.from("products").update({image_url:uploaded.url,updated_at:new Date().toISOString()}).eq("id",p.id).eq("store_id",store.id);if(error){await supabase.storage.from("store-media").remove([uploaded.path]);throw error;}setNotice("Foto do produto atualizada.");await load();}catch{setNotice("Não foi possível atualizar a foto do produto.");}
 }

 if(loading)return <main className="productAdminPage"><div className="productAdminShell">Carregando produtos...</div></main>;
 if(!store)return <main className="productAdminPage"><div className="productAdminShell"><h1>Produtos</h1><p>{notice}</p><a className="productBack" href="/">Voltar ao painel</a></div></main>;
 return <main className="productAdminPage"><div className="productAdminShell">
  <header className="productHero"><div><span className="productEyebrow">CATÁLOGO CLICK-FOOD</span><h1>Produtos</h1><p>{store.name} • cadastre fotos, preços e disponibilidade que aparecem para o cliente.</p></div><div className="productHeroActions"><a className="productBack" href="/">← Painel</a><button onClick={()=>void load()}>Atualizar</button></div></header>
  {notice&&<div className="productNotice">{notice}</div>}
  <section className="productStats"><article><span>Produtos</span><b>{products.length}</b></article><article><span>Ativos</span><b>{activeCount}</b></article><article><span>Com foto</span><b>{withImage}</b></article><article><span>Sem foto</span><b>{products.length-withImage}</b></article></section>
  <section className="productWorkspace">
   <form className="productFormCard" onSubmit={createProduct}><div className="productSectionTitle"><div><span>NOVO PRODUTO</span><h2>Cadastro completo</h2></div></div>
    <div className="productPhotoDrop">{imagePreview?<img src={imagePreview} alt="Prévia do produto"/>:<div><strong>📷</strong><b>Foto do produto</b><small>JPG, PNG ou WEBP • até 8 MB</small></div>}<label>Escolher imagem<input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectImage}/></label></div>
    <label>Nome do produto<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Ex.: X-Bacon" required/></label>
    <label>Descrição<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Ingredientes, tamanho e detalhes que ajudam o cliente a escolher."/></label>
    <div className="productFormRow"><label>Categoria<select value={form.categoryId} onChange={e=>setForm({...form,categoryId:e.target.value})}><option value="">Sem categoria</option>{categories.filter(c=>c.active).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Preço<input value={form.price} onChange={e=>setForm({...form,price:e.target.value})} inputMode="decimal" placeholder="0,00" required/></label></div>
    <label>Preço promocional <small>(opcional)</small><input value={form.promotionalPrice} onChange={e=>setForm({...form,promotionalPrice:e.target.value})} inputMode="decimal" placeholder="0,00"/></label>
    <button className="productPrimary" disabled={saving||!canManage}>{saving?"SALVANDO...":"CADASTRAR PRODUTO"}</button>{!canManage&&<p className="productHint">Somente proprietário ou gerente pode cadastrar produtos.</p>}
   </form>
   <section className="productCatalogCard"><div className="productSectionTitle"><div><span>CATÁLOGO</span><h2>Produtos cadastrados</h2></div><b>{products.length}</b></div>
    <div className="productCards">{products.map(p=><article className="productCard" key={p.id}><div className="productThumb">{p.image_url?<img src={p.image_url} alt={p.name}/>:<div><span>🍽️</span><small>Sem foto</small></div>}<span className={`productStatus ${p.active?"isActive":"isPaused"}`}>{p.active?"ATIVO":"PAUSADO"}</span></div><div className="productCardBody"><div><h3>{p.name}</h3><p>{p.description||"Sem descrição"}</p></div><div className="productPrice">{p.promotional_price!=null&&<small>{brl(p.price)}</small>}<strong>{brl(p.promotional_price??p.price)}</strong></div><div className="productMeta">{p.category_id?selectedCategory.get(p.category_id)??"Categoria":"Sem categoria"}</div><div className="productCardActions"><label>📷 {p.image_url?"Trocar foto":"Adicionar foto"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void replaceImage(p,e.target.files?.[0]??null)}/></label><button onClick={()=>void toggleProduct(p)} disabled={!canManage}>{p.active?"Pausar":"Ativar"}</button></div></div></article>)}{!products.length&&<div className="productEmpty">Nenhum produto cadastrado ainda.</div>}</div>
   </section>
  </section>
 </div></main>;
}
