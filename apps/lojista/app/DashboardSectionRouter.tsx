"use client";

import { useEffect } from "react";

const destinations:Record<string,string>={"Produtos":"/produtos","Configurações":"/configuracao","PDV":"/pdv"};

export default function DashboardSectionRouter(){
 useEffect(()=>{
  function route(event:MouseEvent){
   const target=event.target as HTMLElement|null;const button=target?.closest(".side nav button") as HTMLButtonElement|null;if(!button)return;
   const destination=destinations[(button.textContent??"").trim()];if(!destination)return;
   event.preventDefault();event.stopPropagation();window.location.assign(destination);
  }
  document.addEventListener("click",route,true);return()=>document.removeEventListener("click",route,true);
 },[]);
 return null;
}
