import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";

export type PixCharge = {
  orderId: string;
  txid: string;
  brcode: string;
  expires_at: string;
  status: string;
};

type Props = {
  charge: PixCharge;
  onRefresh: () => Promise<unknown>;
  busy?: boolean;
};

export default function PixPaymentCard({ charge, onRefresh, busy=false }: Props){
  const[now,setNow]=useState(Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const remaining=useMemo(()=>Math.max(0,Math.ceil((new Date(charge.expires_at).getTime()-now)/1000)),[charge.expires_at,now]);
  const min=Math.floor(remaining/60);const sec=remaining%60;
  const expired=remaining<=0;
  async function copy(){await Clipboard.setStringAsync(charge.brcode);}
  return <View style={styles.card}>
    <Text style={styles.kicker}>PAGAMENTO PIX • EFÍ BANK</Text>
    <Text style={styles.title}>{expired?"PIX expirado":"Escaneie ou copie o código"}</Text>
    {!expired&&<View style={styles.qr}><QRCode value={charge.brcode} size={210}/></View>}
    <Text style={styles.timer}>{expired?"Gere um novo código para pagar.":`Expira em ${String(min).padStart(2,"0")}:${String(sec).padStart(2,"0")}`}</Text>
    {!expired&&<><Text style={styles.code} numberOfLines={3}>{charge.brcode}</Text><Pressable style={styles.primary} onPress={copy}><Text style={styles.primaryText}>COPIAR PIX COPIA E COLA</Text></Pressable></>}
    <Pressable style={[styles.secondary,busy&&styles.disabled]} disabled={busy} onPress={onRefresh}><Text style={styles.secondaryText}>{busy?"GERANDO...":expired?"GERAR NOVO PIX":"ATUALIZAR PIX"}</Text></Pressable>
    <Text style={styles.help}>O pedido é enviado à loja automaticamente quando a Efí confirmar o pagamento.</Text>
  </View>;
}

const styles=StyleSheet.create({
  card:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e8e8e8",borderRadius:18,padding:18,marginBottom:16},
  kicker:{fontSize:10,fontWeight:"900",color:"#8b7000",letterSpacing:1},title:{fontSize:20,fontWeight:"900",marginTop:5},
  qr:{alignItems:"center",paddingVertical:18},timer:{textAlign:"center",fontWeight:"900",marginBottom:12},
  code:{fontSize:10,color:"#555",backgroundColor:"#f5f5f5",padding:10,borderRadius:10,marginBottom:10},
  primary:{backgroundColor:"#111",borderRadius:12,padding:14,alignItems:"center"},primaryText:{color:"#fff",fontWeight:"900"},
  secondary:{borderWidth:1,borderColor:"#111",borderRadius:12,padding:12,alignItems:"center",marginTop:9},secondaryText:{fontWeight:"900"},
  help:{fontSize:11,color:"#777",textAlign:"center",marginTop:12},disabled:{opacity:.5}
});