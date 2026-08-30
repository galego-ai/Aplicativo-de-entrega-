import React, { type ReactNode, useEffect, useState } from "react";
import { Modal, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import DriverSupport from "./DriverSupport";
import { supabase } from "./supabase";

export default function DriverSupportHost({children}:{children:ReactNode}){
 const[visible,setVisible]=useState(false);const[signedIn,setSignedIn]=useState(false);
 useEffect(()=>{supabase.auth.getSession().then(({data})=>setSignedIn(!!data.session));const{data}=supabase.auth.onAuthStateChange((_event,session)=>setSignedIn(!!session));return()=>data.subscription.unsubscribe();},[]);
 return <View style={styles.root}>{children}{signedIn&&<Pressable accessibilityRole="button" accessibilityLabel="Abrir suporte" style={styles.fab} onPress={()=>setVisible(true)}><Text style={styles.fabText}>?</Text></Pressable>}<Modal visible={visible} animationType="slide" onRequestClose={()=>setVisible(false)}><SafeAreaView style={styles.modal}><View style={styles.top}><Text style={styles.brand}><Text style={styles.yellow}>CLICK</Text>-FOOD • AJUDA</Text><Pressable style={styles.close} onPress={()=>setVisible(false)}><Text style={styles.closeText}>FECHAR</Text></Pressable></View><View style={{flex:1}}><DriverSupport/></View></SafeAreaView></Modal></View>;
}

const styles=StyleSheet.create({root:{flex:1},fab:{position:"absolute",right:14,bottom:82,width:48,height:48,borderRadius:24,backgroundColor:"#f4c400",alignItems:"center",justifyContent:"center",borderWidth:2,borderColor:"#111",elevation:8},fabText:{fontSize:22,fontWeight:"900",color:"#111"},modal:{flex:1,backgroundColor:"#f6f6f6"},top:{height:58,backgroundColor:"#fff",borderBottomWidth:1,borderBottomColor:"#e5e5e5",paddingHorizontal:16,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},brand:{fontSize:15,fontWeight:"900"},yellow:{color:"#d4a900"},close:{backgroundColor:"#111",paddingVertical:8,paddingHorizontal:11,borderRadius:9},closeText:{color:"#fff",fontSize:10,fontWeight:"900"}});
