"use client";

import { usePathname } from "next/navigation";

export default function StoreMapBackButton(){
  const pathname=usePathname();
  if(!pathname?.startsWith("/mapa"))return null;

  return <a
    href="/"
    aria-label="Voltar aos menus do painel lojista"
    style={{
      position:"fixed",
      top:18,
      left:18,
      zIndex:100000,
      display:"inline-flex",
      alignItems:"center",
      gap:8,
      padding:"12px 16px",
      borderRadius:12,
      background:"#111",
      color:"#fff",
      textDecoration:"none",
      fontWeight:900,
      fontSize:13,
      boxShadow:"0 8px 26px rgba(0,0,0,.28)",
      border:"2px solid #f4c400"
    }}
  >← Voltar aos menus</a>;
}
