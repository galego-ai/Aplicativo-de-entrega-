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
  qr_image?: string|null;
  visualization_url?: string|null;
};

type Props = {
  charge: PixCharge;
  onRefresh: () => Promise<unknown>;
  busy?: boolean;
};

export default function PixPaymentCard({ charge, onRefresh, busy=false }: Props){
  const[now,setNow]=useState(Date.now());
  const[copied,setCopied]=useState(false);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{setCopied(false);},[charge.brcode]);
  const remaining=useMemo(()=>Math.max(0,Math.ceil((new Date(charge.expires_at).getTime()-now)/1000)),[charge.expires_at,now]);
  const min=Math.floor(remaining/60);const sec=remaining%60;
  const expired=remaining<=0;
  async function copy(){
    await Clipboard.setStringAsync(charge.brcode);
    setCopied(true);
    setTimeout(()=>setCopied(false),2500);
  }
  return <View style={styles.card}>
    <Text style={styles.kicker}>PAGAMENTO PIX • EFÍ BANK</Text>
    <Text style={styles.title}>{expired?"PIX expirado":"Finalize seu pagamento"}</Text>
    {!expired&&<>
      <Text style={styles.instructions}>Escaneie o QR Code no aplicativo do seu banco ou use o Pix Copia e Cola.</Text>
      <View style={styles.qr}><View style={styles.qrFrame}><QRCode value={charge.brcode} size={220}/></View></View>
    </>}
    <Text style={styles.timer}>{expired?"Gere um novo código para pagar.":`Este PIX expira em ${String(min).padStart(2,"0")}:${String(sec).padStart(2,"0")}`}</Text>
    {!expired&&<>
      <Text style={styles.copyLabel}>PIX COPIA E COLA</Text>
      <Text style={styles.code} selectable numberOfLines={4}>{charge.brcode}</Text>
      <Pressable style={[styles.primary,copied&&styles.copied]} onPress={copy}><Text style={styles.primaryText}>{copied?"PIX COPIADO ✓":"COPIAR PIX COPIA E COLA"}</Text></Pressable>
    </>}
    <Pressable style={[styles.secondary,busy&&styles.disabled]} disabled={busy} onPress={onRefresh}><Text style={styles.secondaryText}>{busy?"CONSULTANDO...":expired?"GERAR NOVO PIX":"JÁ PAGUEI • ATUALIZAR"}</Text></Pressable>
    <Text style={styles.help}>Quando a Efí confirmar o pagamento, o pedido será enviado automaticamente para a loja.</Text>
  </View>;
}

const styles=StyleSheet.create({
  card:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e8e8e8",borderRadius:20,padding:18,marginBottom:16},
  kicker:{fontSize:10,fontWeight:"900",color:"#8b7000",letterSpacing:1},
  title:{fontSize:22,fontWeight:"900",marginTop:5},
  instructions:{fontSize:13,color:"#555",lineHeight:19,marginTop:6},
  qr:{alignItems:"center",paddingVertical:16},
  qrFrame:{padding:14,backgroundColor:"#fff",borderWidth:1,borderColor:"#ececec",borderRadius:16},
  timer:{textAlign:"center",fontWeight:"900",marginBottom:14,color:"#333"},
  copyLabel:{fontSize:10,fontWeight:"900",color:"#777",letterSpacing:.8,marginBottom:6},
  code:{fontSize:10,color:"#444",backgroundColor:"#f5f5f5",padding:12,borderRadius:10,marginBottom:10,lineHeight:15},
  primary:{backgroundColor:"#111",borderRadius:12,padding:14,alignItems:"center"},
  copied:{backgroundColor:"#166534"},
  primaryText:{color:"#fff",fontWeight:"900"},
  secondary:{borderWidth:1,borderColor:"#111",borderRadius:12,padding:12,alignItems:"center",marginTop:9},
  secondaryText:{fontWeight:"900"},
  help:{fontSize:11,color:"#777",textAlign:"center",marginTop:12,lineHeight:16},
  disabled:{opacity:.5}
});
