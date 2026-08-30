import React, { useEffect, useState } from "react";
import { Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { supabase } from "./supabase";

type LegalDocument={id:string;document_type:string;version:string;title:string;content:string;accepted:boolean};

export default function LegalConsentGate(){
  const[visible,setVisible]=useState(false);const[documents,setDocuments]=useState<LegalDocument[]>([]);const[busy,setBusy]=useState(false);const[message,setMessage]=useState("");
  useEffect(()=>{void load();},[]);
  async function load(){
    const{data,error}=await supabase.functions.invoke("legal-consent",{body:{action:"STATUS",audience:"DRIVER",app:"DRIVER"}});
    if(error||data?.error){setMessage("Não foi possível verificar os Termos e a Política de Privacidade. Tente novamente.");setVisible(true);return;}
    const required=(data?.required??[]) as LegalDocument[];setDocuments(required);setVisible(required.some(doc=>!doc.accepted));setMessage("");
  }
  async function accept(){
    const ids=documents.filter(doc=>!doc.accepted).map(doc=>doc.id);if(!ids.length){setVisible(false);return;}
    setBusy(true);setMessage("");const{data,error}=await supabase.functions.invoke("legal-consent",{body:{action:"ACCEPT",audience:"DRIVER",app:"DRIVER",documentIds:ids}});setBusy(false);
    if(error||data?.error||!data?.compliant){setMessage("Não foi possível registrar seu aceite. Tente novamente.");return;}setVisible(false);
  }
  return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={()=>{}}>
    <SafeAreaView style={styles.safe}><View style={styles.header}><Text style={styles.brand}><Text style={styles.yellow}>CLICK</Text>-FOOD</Text><Text style={styles.kicker}>ENTREGADOR</Text><Text style={styles.title}>Termos e Privacidade</Text><Text style={styles.subtitle}>Leia e aceite os documentos vigentes antes de continuar no aplicativo.</Text></View>
      <ScrollView style={styles.docs} contentContainerStyle={styles.docsContent}>{documents.filter(doc=>!doc.accepted).map(doc=><View key={doc.id} style={styles.card}><Text style={styles.docTitle}>{doc.title}</Text><Text style={styles.version}>Versão {doc.version}</Text><Text style={styles.content}>{doc.content}</Text></View>)}{!!message&&<Text style={styles.error}>{message}</Text>}</ScrollView>
      <View style={styles.footer}>{!!message&&<Pressable style={styles.secondary} onPress={load}><Text style={styles.secondaryText}>TENTAR NOVAMENTE</Text></Pressable>}<Pressable style={[styles.accept,busy&&styles.disabled]} disabled={busy||documents.filter(doc=>!doc.accepted).length===0} onPress={accept}><Text style={styles.acceptText}>{busy?"REGISTRANDO...":"LI E CONCORDO"}</Text></Pressable><Text style={styles.hint}>O sistema registra a versão aceita e a data do consentimento.</Text></View>
    </SafeAreaView>
  </Modal>;
}

const styles=StyleSheet.create({safe:{flex:1,backgroundColor:"#f7f7f7"},header:{padding:22,paddingBottom:10},brand:{fontSize:22,fontWeight:"900"},yellow:{color:"#f4c400"},kicker:{fontSize:10,fontWeight:"900",color:"#8b7000",letterSpacing:1.3,marginTop:5},title:{fontSize:28,fontWeight:"900",marginTop:18},subtitle:{color:"#666",marginTop:7,lineHeight:19},docs:{flex:1},docsContent:{padding:18,paddingBottom:30},card:{backgroundColor:"#fff",borderRadius:16,padding:16,marginBottom:12,borderWidth:1,borderColor:"#e7e7e7"},docTitle:{fontSize:18,fontWeight:"900"},version:{fontSize:11,color:"#8b7000",fontWeight:"800",marginTop:4,marginBottom:12},content:{fontSize:13,lineHeight:20,color:"#333"},footer:{padding:18,borderTopWidth:1,borderTopColor:"#e5e5e5",backgroundColor:"#fff"},accept:{backgroundColor:"#f4c400",padding:16,borderRadius:13,alignItems:"center"},acceptText:{fontWeight:"900",color:"#111"},secondary:{borderWidth:1,borderColor:"#bbb",padding:12,borderRadius:12,alignItems:"center",marginBottom:9},secondaryText:{fontWeight:"900"},hint:{fontSize:10,color:"#777",textAlign:"center",marginTop:9},error:{backgroundColor:"#fde5e1",color:"#8b2722",padding:12,borderRadius:10},disabled:{opacity:.5}});
