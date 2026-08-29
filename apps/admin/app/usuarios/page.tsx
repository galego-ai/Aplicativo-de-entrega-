"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type User={id:string;email:string|null;full_name:string;phone:string|null;status:string;role:string;created_at:string;last_sign_in_at:string|null};
export default function Usuarios(){
 const[loading,setLoading]=useState(true);const[users,setUsers]=useState<User[]>([]);const[notice,setNotice]=useState("");
 async function load(){const{data,error}=await supabase.functions.invoke("admin-users",{body:{action:"LIST"}});if(error||data?.error)setNotice("Não foi possível carregar os usuários.");else setUsers(data.users??[]);setLoading(false);}
 useEffect(()=>{load();},[]);
 async function setRole(user:User,role:string){const{data,error}=await supabase.functions.invoke("admin-users",{body:{action:"SET_ROLE",userId:user.id,role}});setNotice(error||data?.error?(data?.error==="CANNOT_DEMOTE_SELF"?"Você não pode remover o próprio acesso de Super Admin.":"Não foi possível alterar a função."):"Função atualizada.");await load();}
 async function toggle(user:User){const status=user.status==="BLOCKED"?"ACTIVE":"BLOCKED";const{data,error}=await supabase.functions.invoke("admin-users",{body:{action:"SET_STATUS",userId:user.id,status}});setNotice(error||data?.error?(data?.error==="CANNOT_BLOCK_SELF"?"Você não pode bloquear a própria conta.":"Não foi possível alterar o usuário."):"Status atualizado.");await load();}
 if(loading)return <main className="authPage"><div className="authCard">Carregando usuários...</div></main>;
 return <main className="content standaloneAdmin"><header className="topbar"><div><p className="eyebrow">MATRIZ CLICK-FOOD</p><h1>Usuários e permissões</h1></div><a className="logout adminLink" href="/">← Voltar à Matriz</a></header>{notice&&<div className="notice">{notice}</div>}<section className="panel adminStandalonePanel"><div className="panelTitle"><h2>Contas da plataforma</h2><button className="primary" onClick={load}>Atualizar</button></div><div className="adminDataList">{users.map(user=><div className="adminDataRow platformUser" key={user.id}><div><b>{user.full_name}</b><small>{user.email??"sem e-mail"} • {user.status} • último acesso {user.last_sign_in_at?new Date(user.last_sign_in_at).toLocaleString("pt-BR"):"nunca"}</small></div><select value={user.role||"NONE"} onChange={e=>setRole(user,e.target.value)}><option value="NONE">Usuário comum</option><option value="SUPPORT">Suporte</option><option value="ADMIN">Admin</option><option value="SUPER_ADMIN">Super Admin</option></select><button className={user.status==="BLOCKED"?"":"danger"} onClick={()=>toggle(user)}>{user.status==="BLOCKED"?"Ativar":"Bloquear"}</button></div>)}</div></section></main>;
}
