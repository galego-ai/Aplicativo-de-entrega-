import React,{ReactNode,useEffect,useState}from"react";
import{Linking}from"react-native";

export default function DriverHomeResetHost({children}:{children:ReactNode}){
 const[key,setKey]=useState(0);
 useEffect(()=>{const sub=Linking.addEventListener("url",({url})=>{if(url.startsWith("clickfood-entregador://home"))setKey(value=>value+1);});return()=>sub.remove();},[]);
 return <React.Fragment key={key}>{children}</React.Fragment>;
}
