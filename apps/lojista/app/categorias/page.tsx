"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type StoreAccess={id:string;name:string;role:string};
type Category={id:string;name:string;description:string|null;image_url:string|null;sort_order:number;active:boolean};
type ProductRef={category_id:string|null;active:boolean;available_delivery:boolean};

const allowedTypes=new Set(["image/jpeg","image/png","image/webp"]);
const maxImageBytes=8*1024*1024;

export default function CategoriasPage(){
 const[loading,setLoading]=useState(true);
 const[store,setStore]=useState<StoreAccess|null>(null);
 const[categories,setCategories]=useState<Category[]>([]);
 const[products,setProducts]=useState<ProductRef[]>([]);
 const[notice,setNotice]=useState("");
 const[saving,setSaving]=useState(false);
 const[name,setName]=useState("");
 const[description,setDescription]=useState("");
 const[imageFile,setImageFile]=useState<File|null>(null);
 const[preview,setPreview]=useState("");
 const[editing,setEditing]=useState<Category|null>(null);
 const[editName,setEditName]=useState("");
 const[editDescription,setEditDescription]=useState("");

 const canManage=store?.role==="OWNER"||store?.role==="MANAGER";
 const activeCount=categories.filter(c=>c.active).length;
 const uncategorized=products.filter(p=>!p.category_id).length;
 const productCounts=useMemo(()=>{const map=new Map<string,{all:number;delivery:number}>();for(const p of products){if(!p.category_id)continue;const current=map.get(p.category_id)??{all:0,delivery:0};current.all+=1;if(p.active&&p.available_delivery)current.delivery+=1;map.set(p.category_id,current);}return map;},[products]);

 async function load(){
  setLoading(true);
  const{data:sessionData}=await supabase.auth.getSession();
  const userId=sessionData.session?.user.id;
  if(!userId){setStore(null);setNotice("Entre no Painel Lojista antes de gerenciar categorias.");setLoading(false);return;}
  const{data:membership,error:membershipError}=await supabase.from("store_memberships").select("store_id,role,stores!inner(name)").eq("user_id",userId).eq("active",true).limit(1);
  if(membershipError||!membership?.length){setStore(null);setNotice("Sua conta ainda não está vinculada a uma loja.");setLoading(false);return;}
  const row:any=membership[0];const relation=Array.isArray(row.stores)?row.stores[0]:row.stores;
  const access={id:String(row.store_id),name:String(relation?.name??"Minha loja"),role:String(row.role)};setStore(access);
  const[categoriesResult,productsResult]=await Promise.all([
   supabase.from("categories").select("id,name,description,image_url,sort_order,active").eq("store_id",access.id).order("sort_order").order("name"),
   supabase.from("products").select("category_id,active,available_delivery").eq("store_id",access.id)
  ]);
  if(categoriesResult.error||productsResult.error){setNotice("Não foi possível carregar as categorias agora.");setLoading(false);return;}
  setCategories((categoriesResult.data??[]).map((c:any)=>({...c,sort_order:Number(c.sort_order??0)})) as Category[]);
  setProducts((productsResult.data??[]) as ProductRef[]);
  setLoading(false);
 }

 useEffect(()=>{void load();},[]);
 useEffect(()=>()=>{if(preview.startsWith("blob:"))URL.revokeObjectURL(preview);},[preview]);

 function selectImage(e:ChangeEvent<HTMLInputElement>){const file=e.target.files?.[0]??null;if(!file){setImageFile(null);setPreview("");return;}if(!allowedTypes.has(file.type)){setNotice("Use uma imagem JPG, PNG ou WEBP.");e.target.value="";return;}if(file.size>maxImageBytes){setNotice("A imagem deve ter no máximo 8 MB.");e.target.value="";return;}if(preview.startsWith("blob:"))URL.revokeObjectURL(preview);setImageFile(file);setPreview(URL.createObjectURL(file));setNotice("");}
 async function uploadImage(file:File){if(!store)throw new Error("STORE_REQUIRED");const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";const path=`${store.id}/categories/${crypto.randomUUID()}.${ext}`;const{error}=await supabase.storage.from("store-media").upload(path,file,{contentType:file.type,cacheControl:"3600",upsert:false});if(error)throw error;return{path,url:supabase.storage.from("store-media").getPublicUrl(path).data.publicUrl};}

 async function createCategory(e:FormEvent){
  e.preventDefault();if(!store||!canManage||!name.trim())return;setSaving(true);setNotice("");let uploadedPath="";
  try{let imageUrl:string|null=null;if(imageFile){const uploaded=await uploadImage(imageFile);uploadedPath=uploaded.path;imageUrl=uploaded.url;}const nextSort=categories.length?Math.max(...categories.map(c=>c.sort_order))+10:10;const{error}=await supabase.from("categories").insert({store_id:store.id,name:name.trim(),description:description.trim()||null,image_url:imageUrl,sort_order:nextSort,active:true});if(error){if(uploadedPath)await supabase.storage.from("store-media").remove([uploadedPath]);throw error;}setName("");setDescription("");setImageFile(null);if(preview.startsWith("blob:"))URL.revokeObjectURL(preview);setPreview("");setNotice("Categoria criada e publicada no cardápio.");await load();}catch{setNotice("Não foi possível criar a categoria. Verifique se o nome já existe.");}finally{setSaving(false);}
 }

 function startEdit(category:Category){setEditing(category);setEditName(category.name);setEditDescription(category.description??"");setNotice("");}
 async function saveEdit(e:FormEvent){e.preventDefault();if(!store||!editing||!canManage||!editName.trim())return;setSaving(true);const{error}=await supabase.from("categories").update({name:editName.trim(),description:editDescription.trim()||null}).eq("id",editing.id).eq("store_id",store.id);setSaving(false);if(error){setNotice("Não foi possível salvar a categoria.");return;}setEditing(null);setNotice("Categoria atualizada.");await load();}
 async function toggleCategory(category:Category){if(!store||!canManage)return;const count=productCounts.get(category.id)?.delivery??0;if(category.active&&count>0&&!window.confirm(`Pausar ${category.name}? ${count} produto(s) ativo(s) deixarão de aparecer no Delivery até a categoria ser reativada.`))return;const{error}=await supabase.from("categories").update({active:!category.active}).eq("id",category.id).eq("store_id",store.id);if(error){setNotice("Não foi possível alterar a categoria.");return;}setNotice(category.active?"Categoria pausada. Seus produtos foram ocultados do Delivery sem serem excluídos.":"Categoria reativada e liberada novamente para o Delivery.");await load();}
 async function replaceImage(category:Category,file:File|null){if(!store||!canManage||!file)return;if(!allowedTypes.has(file.type)||file.size>maxImageBytes){setNotice("Use JPG, PNG ou WEBP de até 8 MB.");return;}setSaving(true);try{const uploaded=await uploadImage(file);const{error}=await supabase.from("categories").update({image_url:uploaded.url}).eq("id",category.id).eq("store_id",store.id);if(error){await supabase.storage.from("store-media").remove([uploaded.path]);throw error;}setNotice("Imagem da categoria atualizada.");await load();}catch{setNotice("Não foi possível atualizar a imagem da categoria.");}finally{setSaving(false);}}
 async function move(categoryId:string,direction:-1|1){if(!store||!canManage)return;const index=categories.findIndex(c=>c.id===categoryId);const target=index+direction;if(index<0||target<0||target>=categories.length)return;const next=[...categories];const[item]=next.splice(index,1);next.splice(target,0,item);setCategories(next);const results=await Promise.all(next.map((category,i)=>supabase.from("categories").update({sort_order:(i+1)*10}).eq("id",category.id).eq("store_id",store.id)));if(results.some(result=>result.error)){setNotice("Não foi possível salvar a nova ordem.");await load();return;}setNotice("Ordem das categorias atualizada.");}

 if(loading)return <main className="categoryPage"><div className="categoryShell"><p>Carregando categorias...</p></div></main>;
 if(!store)return <main className="categoryPage"><div className="categoryShell"><h1>Categorias</h1><p>{notice}</p><a className="categoryButton ghost" href="/">Voltar ao painel</a></div></main>;

 return <main className="categoryPage"><div className="categoryShell">
  <header className="categoryHero"><div><span>ORGANIZAÇÃO DO CARDÁPIO</span><h1>Categorias</h1><p>{store.name} • organize o cardápio sem perder produtos ou histórico.</p></div><div className="categoryActions"><a className="categoryButton ghost" href="/produtos">Produtos</a><a className="categoryButton ghost" href="/catalogo-avancado">Adicionais</a><a className="categoryButton ghost" href="/">← Painel</a></div></header>
  {notice&&<div className="categoryNotice">{notice}</div>}
  <section className="categoryStats"><article><span>Total</span><strong>{categories.length}</strong><small>categorias cadastradas</small></article><article><span>Publicadas</span><strong>{activeCount}</strong><small>visíveis no Delivery</small></article><article><span>Sem categoria</span><strong>{uncategorized}</strong><small>produtos para organizar</small></article></section>

  {editing&&<section className="categoryPanel editPanel"><div className="categoryPanelTitle"><div><span>EDITANDO</span><h2>{editing.name}</h2></div><button className="categoryButton ghost" onClick={()=>setEditing(null)}>Fechar</button></div><form className="categoryEditForm" onSubmit={saveEdit}><label>Nome<input value={editName} onChange={e=>setEditName(e.target.value)} required/></label><label>Descrição<textarea value={editDescription} onChange={e=>setEditDescription(e.target.value)} placeholder="Ex.: lanches artesanais preparados na hora"/></label><button className="categoryButton primary" disabled={saving}>SALVAR ALTERAÇÕES</button></form></section>}

  <div className="categoryGrid">
   <form className="categoryPanel createPanel" onSubmit={createCategory}><div className="categoryPanelTitle"><div><span>NOVA CATEGORIA</span><h2>Criar seção do cardápio</h2></div></div><div className="categoryImagePicker">{preview?<img src={preview} alt="Prévia da categoria"/>:<div><b>🖼️</b><strong>Imagem opcional</strong><small>Ajuda a deixar o cardápio mais visual</small></div>}<label>Escolher imagem<input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectImage}/></label></div><label>Nome<input value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Hambúrgueres" required/></label><label>Descrição<textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Descrição curta da categoria"/></label><button className="categoryButton primary" disabled={saving||!canManage}>{saving?"SALVANDO...":"CRIAR CATEGORIA"}</button>{!canManage&&<small className="categoryHelp">Somente proprietário ou gerente pode alterar o catálogo.</small>}</form>

   <section className="categoryPanel listPanel"><div className="categoryPanelTitle"><div><span>ORDEM NO DELIVERY</span><h2>Categorias cadastradas</h2></div><b>{categories.length}</b></div><p className="categoryHelp">A ordem abaixo será usada no cardápio. Pausar uma categoria oculta seus produtos do Delivery, mas não apaga nada e não interfere no histórico.</p><div className="categoryList">{categories.map((category,index)=>{const count=productCounts.get(category.id)??{all:0,delivery:0};return <article key={category.id} className={`categoryRow ${category.active?"":"paused"}`}><div className="categoryThumb">{category.image_url?<img src={category.image_url} alt={category.name}/>:<span>🍽️</span>}</div><div className="categoryInfo"><div className="categoryNameLine"><h3>{category.name}</h3><span className={category.active?"activeBadge":"pausedBadge"}>{category.active?"PUBLICADA":"PAUSADA"}</span></div><p>{category.description||"Sem descrição"}</p><small>{count.all} produto(s) • {count.delivery} ativo(s) no Delivery</small></div><div className="categoryRowActions"><div className="orderButtons"><button disabled={index===0||!canManage} onClick={()=>void move(category.id,-1)} aria-label="Mover categoria para cima">↑</button><button disabled={index===categories.length-1||!canManage} onClick={()=>void move(category.id,1)} aria-label="Mover categoria para baixo">↓</button></div><button onClick={()=>startEdit(category)} disabled={!canManage}>Editar</button><label>Imagem<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void replaceImage(category,e.target.files?.[0]??null)}/></label><button className={category.active?"dangerAction":"activateAction"} onClick={()=>void toggleCategory(category)} disabled={!canManage}>{category.active?"Pausar":"Ativar"}</button></div></article>})}{!categories.length&&<div className="categoryEmpty"><b>Nenhuma categoria criada.</b><p>Crie a primeira categoria para organizar o cardápio do restaurante.</p></div>}</div></section>
  </div>
 </div></main>;
}
