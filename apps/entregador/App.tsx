import React, { useState } from "react";
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Screen = "home" | "history" | "wallet" | "goals" | "profile";
type DeliveryStep = "IDLE" | "TO_STORE" | "AT_STORE" | "TO_CUSTOMER" | "AT_CUSTOMER";

function Home({ online, setOnline }: { online: boolean; setOnline: (value: boolean) => void }) {
  const [offerVisible, setOfferVisible] = useState(false);
  const [step, setStep] = useState<DeliveryStep>("IDLE");

  const accept = () => {
    setOfferVisible(false);
    setStep("TO_STORE");
  };

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View><Text style={styles.brand}><Text style={styles.yellow}>CLICK</Text>-FOOD</Text><Text style={styles.subtitle}>ENTREGADOR</Text></View>
          <View style={[styles.dot, online && styles.dotOnline]} />
        </View>

        <View style={styles.earningsCard}>
          <Text style={styles.earningsLabel}>GANHOS HOJE</Text>
          <Text style={styles.earningsValue}>R$ 126,50</Text>
          <View style={styles.stats}><View><Text style={styles.statValue}>14</Text><Text style={styles.statLabel}>entregas</Text></View><View><Text style={styles.statValue}>4,9 ★</Text><Text style={styles.statLabel}>avaliação</Text></View><View><Text style={styles.statValue}>92%</Text><Text style={styles.statLabel}>aceitação</Text></View></View>
        </View>

        <Pressable style={[styles.onlineButton, online && styles.offlineButton]} onPress={() => { if (step === "IDLE") setOnline(!online); }}>
          <Text style={[styles.onlineText, online && styles.offlineText]}>{online ? "FICAR OFFLINE" : "FICAR ONLINE"}</Text>
        </Pressable>
        {step !== "IDLE" && <Text style={styles.lockHint}>Finalize a entrega atual antes de ficar offline.</Text>}

        <View style={styles.map}>
          <Text style={styles.mapTitle}>{step === "IDLE" ? (online ? "Você está disponível" : "Fique online para receber entregas") : "Entrega ativa"}</Text>
          <Text style={styles.mapEmoji}>{step === "TO_STORE" || step === "TO_CUSTOMER" ? "🛵" : "📍"}</Text>
          <Text style={styles.mapText}>{step === "TO_STORE" ? "A caminho da Pizza Mais • 1,2 km" : step === "AT_STORE" ? "Na loja • aguardando retirada" : step === "TO_CUSTOMER" ? "A caminho do cliente • 4,3 km" : step === "AT_CUSTOMER" ? "Você chegou ao destino" : "Mapa e localização em tempo real"}</Text>
        </View>

        {online && step === "IDLE" && <Pressable style={styles.demoOffer} onPress={() => setOfferVisible(true)}><Text style={styles.demoOfferText}>SIMULAR NOVO CHAMADO</Text></Pressable>}

        {step !== "IDLE" && <View style={styles.deliveryCard}>
          <Text style={styles.deliveryBadge}>PEDIDO #1842</Text>
          <Text style={styles.deliveryTitle}>{step === "TO_STORE" || step === "AT_STORE" ? "Pizza Mais" : "Entrega ao cliente"}</Text>
          <Text style={styles.deliveryMeta}>{step === "TO_STORE" ? "1,2 km até a retirada" : step === "AT_STORE" ? "Pedido pronto para retirada" : step === "TO_CUSTOMER" ? "4,3 km até o cliente" : "Confirme o código do cliente"}</Text>
          <Pressable style={styles.actionButton} onPress={() => setStep(step === "TO_STORE" ? "AT_STORE" : step === "AT_STORE" ? "TO_CUSTOMER" : step === "TO_CUSTOMER" ? "AT_CUSTOMER" : "IDLE")}><Text style={styles.actionText}>{step === "TO_STORE" ? "CONFIRMAR CHEGADA À LOJA" : step === "AT_STORE" ? "CONFIRMAR RETIRADA" : step === "TO_CUSTOMER" ? "CONFIRMAR CHEGADA" : "VALIDAR CÓDIGO E CONCLUIR"}</Text></Pressable>
          <Pressable style={styles.helpButton}><Text style={styles.helpText}>Preciso de ajuda</Text></Pressable>
        </View>}

        <Text style={styles.sectionTitle}>Meta do fim de semana</Text>
        <View style={styles.goalCard}><View style={styles.rowBetween}><Text style={styles.goalTitle}>20 entregas</Text><Text style={styles.goalBonus}>+ R$ 30</Text></View><View style={styles.progress}><View style={styles.progressFill} /></View><Text style={styles.goalText}>14 de 20 concluídas</Text></View>
      </ScrollView>

      <Modal visible={offerVisible} transparent animationType="fade" onRequestClose={() => setOfferVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.offerCard}>
            <View style={styles.offerHeader}><Text style={styles.offerLabel}>NOVA ENTREGA</Text><View style={styles.timer}><Text style={styles.timerText}>14s</Text></View></View>
            <Text style={styles.offerStore}>Pizza Mais</Text>
            <View style={styles.offerRoute}><View><Text style={styles.offerSmall}>ATÉ A LOJA</Text><Text style={styles.offerBig}>1,2 km</Text></View><Text style={styles.arrow}>→</Text><View><Text style={styles.offerSmall}>ENTREGA</Text><Text style={styles.offerBig}>4,3 km</Text></View></View>
            <View style={styles.offerPay}><Text style={styles.offerSmall}>SEU GANHO</Text><Text style={styles.offerAmount}>R$ 9,20</Text></View>
            <View style={styles.offerActions}><Pressable style={styles.reject} onPress={() => setOfferVisible(false)}><Text style={styles.rejectText}>RECUSAR</Text></Pressable><Pressable style={styles.accept} onPress={accept}><Text style={styles.acceptText}>ACEITAR</Text></Pressable></View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function History() { return <ScrollView contentContainerStyle={styles.content}><Text style={styles.pageTitle}>Minhas entregas</Text>{[["#1842","Pizza Mais","R$ 9,20"],["#1837","Burger House","R$ 8,40"],["#1821","Doces da Ana","R$ 7,50"]].map(([id,store,value]) => <View style={styles.listRow} key={id}><View><Text style={styles.listTitle}>{id} • {store}</Text><Text style={styles.listMeta}>Concluída</Text></View><Text style={styles.listValue}>{value}</Text></View>)}</ScrollView>; }
function Wallet() { return <ScrollView contentContainerStyle={styles.content}><Text style={styles.pageTitle}>Carteira</Text><View style={styles.walletCard}><Text style={styles.earningsLabel}>SALDO DISPONÍVEL</Text><Text style={styles.earningsValue}>R$ 485,90</Text><Pressable style={styles.actionButton}><Text style={styles.actionText}>SOLICITAR REPASSE</Text></Pressable></View><Text style={styles.sectionTitle}>Extrato</Text>{["Entrega #1842   + R$ 9,20","Entrega #1837   + R$ 8,40","Repasse PIX   - R$ 350,00"].map((item) => <View style={styles.listRow} key={item}><Text style={styles.listTitle}>{item}</Text></View>)}</ScrollView>; }
function Goals() { return <ScrollView contentContainerStyle={styles.content}><Text style={styles.pageTitle}>Metas e nível</Text><View style={styles.levelCard}><Text style={styles.earningsLabel}>NÍVEL ATUAL</Text><Text style={styles.level}>OURO</Text><View style={styles.progress}><View style={[styles.progressFill,{width:"92%"}]} /></View><Text style={styles.goalText}>184 / 200 entregas • faltam 16 para Diamante</Text></View><Text style={styles.sectionTitle}>Bônus ativos</Text><View style={styles.goalCard}><Text style={styles.goalTitle}>+ R$ 2 por entrega</Text><Text style={styles.goalText}>Hoje, das 18h às 22h • Região Centro</Text></View></ScrollView>; }
function Profile() { return <ScrollView contentContainerStyle={styles.content}><Text style={styles.pageTitle}>Minha conta</Text>{["Meus documentos","Meu veículo","Minha cidade","Avaliações","Notificações","Suporte","Termos e privacidade"].map((item) => <Pressable style={styles.menuRow} key={item}><Text style={styles.listTitle}>{item}</Text><Text>›</Text></Pressable>)}</ScrollView>; }

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [online, setOnline] = useState(false);
  const current = screen === "home" ? <Home online={online} setOnline={setOnline} /> : screen === "history" ? <History /> : screen === "wallet" ? <Wallet /> : screen === "goals" ? <Goals /> : <Profile />;
  const tabs: Array<[Screen,string,string]> = [["home","⌂","Início"],["history","▤","Entregas"],["wallet","$","Carteira"],["goals","★","Metas"],["profile","○","Perfil"]];
  return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" backgroundColor="#f6f6f6"/><View style={styles.flex}>{current}</View><View style={styles.bottom}>{tabs.map(([key,icon,label]) => <Pressable key={key} onPress={() => setScreen(key)} style={styles.tab}><Text style={[styles.tabIcon,screen===key&&styles.tabActive]}>{icon}</Text><Text style={[styles.tabText,screen===key&&styles.tabActive]}>{label}</Text></Pressable>)}</View></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:"#f6f6f6"},flex:{flex:1},content:{padding:18,paddingBottom:32},header:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:20},brand:{fontSize:23,fontWeight:"900"},yellow:{color:"#f4c400"},subtitle:{fontSize:9,fontWeight:"900",letterSpacing:2,color:"#777",marginTop:3},dot:{width:12,height:12,borderRadius:6,backgroundColor:"#bbb"},dotOnline:{backgroundColor:"#21a366"},
  earningsCard:{backgroundColor:"#111",borderRadius:22,padding:20},earningsLabel:{fontSize:10,fontWeight:"900",letterSpacing:1,color:"#9a9a9a"},earningsValue:{fontSize:34,fontWeight:"900",color:"#fff",marginTop:5},stats:{flexDirection:"row",justifyContent:"space-between",marginTop:20},statValue:{color:"#fff",fontSize:16,fontWeight:"900"},statLabel:{color:"#8d8d8d",fontSize:10,marginTop:3},
  onlineButton:{backgroundColor:"#f4c400",paddingVertical:17,borderRadius:16,alignItems:"center",marginTop:16},offlineButton:{backgroundColor:"#fff",borderWidth:2,borderColor:"#111"},onlineText:{fontWeight:"900",fontSize:13},offlineText:{color:"#111"},lockHint:{textAlign:"center",fontSize:11,color:"#777",marginTop:7},
  map:{height:220,borderRadius:22,backgroundColor:"#e8e8e8",marginTop:18,alignItems:"center",justifyContent:"center",padding:20},mapTitle:{fontSize:16,fontWeight:"900"},mapEmoji:{fontSize:45,marginVertical:18},mapText:{fontSize:12,color:"#666",textAlign:"center"},demoOffer:{marginTop:12,paddingVertical:12,alignItems:"center"},demoOfferText:{fontSize:11,fontWeight:"900",color:"#8b6d00"},
  deliveryCard:{backgroundColor:"#fff",borderRadius:20,padding:18,marginTop:16,borderWidth:1,borderColor:"#e8e8e8"},deliveryBadge:{fontSize:10,fontWeight:"900",color:"#a27e00"},deliveryTitle:{fontSize:20,fontWeight:"900",marginTop:7},deliveryMeta:{color:"#666",fontSize:12,marginVertical:8},actionButton:{backgroundColor:"#f4c400",paddingVertical:15,borderRadius:14,alignItems:"center",marginTop:12},actionText:{fontWeight:"900",fontSize:11},helpButton:{paddingVertical:12,alignItems:"center"},helpText:{fontWeight:"800",fontSize:11,color:"#555"},
  sectionTitle:{fontSize:18,fontWeight:"900",marginTop:24,marginBottom:12},goalCard:{backgroundColor:"#fff",borderRadius:18,padding:16,borderWidth:1,borderColor:"#e9e9e9"},rowBetween:{flexDirection:"row",justifyContent:"space-between"},goalTitle:{fontWeight:"900"},goalBonus:{fontWeight:"900",color:"#16784b"},progress:{height:7,borderRadius:4,backgroundColor:"#e5e5e5",overflow:"hidden",marginTop:14},progressFill:{height:"100%",width:"70%",backgroundColor:"#f4c400"},goalText:{fontSize:11,color:"#666",marginTop:8},
  modalBackdrop:{flex:1,backgroundColor:"rgba(0,0,0,.65)",justifyContent:"center",padding:20},offerCard:{backgroundColor:"#fff",borderRadius:26,padding:22},offerHeader:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},offerLabel:{fontSize:12,fontWeight:"900",letterSpacing:1},timer:{width:44,height:44,borderRadius:22,backgroundColor:"#111",alignItems:"center",justifyContent:"center"},timerText:{color:"#f4c400",fontWeight:"900"},offerStore:{fontSize:27,fontWeight:"900",marginTop:18},offerRoute:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",backgroundColor:"#f4f4f4",borderRadius:18,padding:16,marginTop:16},offerSmall:{fontSize:9,fontWeight:"900",color:"#777"},offerBig:{fontSize:18,fontWeight:"900",marginTop:3},arrow:{fontSize:25,color:"#999"},offerPay:{marginTop:18},offerAmount:{fontSize:31,fontWeight:"900",color:"#16784b",marginTop:3},offerActions:{flexDirection:"row",gap:10,marginTop:20},reject:{flex:1,borderWidth:1,borderColor:"#ddd",paddingVertical:16,borderRadius:14,alignItems:"center"},rejectText:{fontWeight:"900",color:"#555"},accept:{flex:1,backgroundColor:"#f4c400",paddingVertical:16,borderRadius:14,alignItems:"center"},acceptText:{fontWeight:"900"},
  bottom:{minHeight:72,backgroundColor:"#fff",borderTopWidth:1,borderTopColor:"#e3e3e3",flexDirection:"row",paddingVertical:7},tab:{flex:1,alignItems:"center",justifyContent:"center"},tabIcon:{fontSize:19,color:"#777"},tabText:{fontSize:9,fontWeight:"700",color:"#777",marginTop:3},tabActive:{color:"#9c7900",fontWeight:"900"},
  pageTitle:{fontSize:28,fontWeight:"900",marginBottom:20},listRow:{backgroundColor:"#fff",borderRadius:16,padding:16,marginBottom:9,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},listTitle:{fontWeight:"800"},listMeta:{fontSize:11,color:"#777",marginTop:4},listValue:{fontWeight:"900",color:"#16784b"},walletCard:{backgroundColor:"#111",borderRadius:22,padding:20},levelCard:{backgroundColor:"#111",borderRadius:22,padding:20},level:{color:"#f4c400",fontSize:32,fontWeight:"900",marginVertical:8},menuRow:{backgroundColor:"#fff",minHeight:56,paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:"#eee",flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
});
