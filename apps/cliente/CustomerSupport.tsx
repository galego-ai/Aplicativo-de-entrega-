import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "./supabase";

type Ticket={id:string;order_id:string|null;category:string;priority:string;status:string;subject:string;created_at:string;updated_at:string};
type Message={id:string;sender_id:string;body:string;created_at:string};
type Order={id:string;order_number:number;status:string;created_at:string};

const statusLabel:Record<string,string>={OPEN:"Aberto",IN_PROGRESS:"Em atendimento",WAITING_USER:"Aguardando você",RESOLVED:"Resolvido",CLOSED:"Fechado"};
const categoryLabel:Record<string,string>={ORDER:"Pedido",PAYMENT_REFUND:"Pagamento / estorno",DELIVERY:"Entrega",ACCOUNT:"Minha conta",OTHER:"Outro assunto"};

export default function CustomerSupport(){
 const[tickets,setTickets]=useState<Ticket[]>([]);const[orders,setOrders]=useState<Order[]>([]);const[selected,setSelected]=useState<Ticket|null>(null);const[messages,setMessages]=useState<Message[]>([]);
 const[category,setCategory]=useState("ORDER");const[orderId,setOrderId]=useState("");const[subject,setSubject]=useState("");const[text,setText]=useState("");const[reply,setReply]=useState("");const[busy,setBusy]=useState(false);const[notice,setNotice]=useState("");

 useEffect(()=>{load();},[]);
 async function load(){
  const[{data:t},{data:o}]=await Promise.all([
   supabase.from("support_tickets").select("id,order_id,category,priority,status,subject,created_at,updated_at").order("updated_at",{ascending:false}).limit(50),
   supabase.from("orders").select("id,order_number,status,created_at").order("created_at",{ascending:false}).limit(30),
  ]);
  setTickets((t??[]) as Ticket[]);setOrders((o??[]) as Order[]);
 }
 async function openTicket(ticket:Ticket){setSelected(ticket);setNotice("");const{data}=await supabase.from("support_messages").select("id,sender_id,body,created_at").eq("ticket_id",ticket.id).order("created_at");setMessages((data??[]) as Message[]);}
 async function createTicket(){
  if(!subject.trim()||!text.trim()){setNotice("Informe o assunto e descreva o que aconteceu.");return;}
  setBusy(true);setNotice("");
  const{data,error}=await supabase.functions.invoke("support-action",{body:{action:"CREATE",orderId:orderId||null,category,priority:category==="PAYMENT_REFUND"?"HIGH":"NORMAL",subject:subject.trim(),message:text.trim()}});
  if(error||data?.error){setNotice("Não foi possível abrir o chamado agora.");setBusy(false);return;}
  setSubject("");setText("");setOrderId("");setCategory("ORDER");setNotice("Chamado aberto. A equipe poderá responder por aqui.");await load();if(data?.ticket)await openTicket(data.ticket as Ticket);setBusy(false);
 }
 async function sendReply(){
  if(!selected||!reply.trim())return;setBusy(true);setNotice("");
  const{data,error}=await supabase.functions.invoke("support-action",{body:{action:"REPLY",ticketId:selected.id,message:reply.trim()}});
  if(error||data?.error){setNotice("Não foi possível enviar sua mensagem.");setBusy(false);return;}
  setReply("");await openTicket(selected);await load();setBusy(false);
 }

 if(selected)return <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
  <Pressable onPress={()=>{setSelected(null);setMessages([]);}}><Text style={styles.back}>‹ Voltar aos chamados</Text></Pressable>
  <Text style={styles.title}>{selected.subject}</Text><Text style={styles.meta}>{categoryLabel[selected.category]??selected.category} • {statusLabel[selected.status]??selected.status}</Text>
  <View style={styles.chat}>{messages.map(message=><View key={message.id} style={styles.message}><Text style={styles.messageText}>{message.body}</Text><Text style={styles.time}>{new Date(message.created_at).toLocaleString("pt-BR")}</Text></View>)}{!messages.length&&<Text style={styles.empty}>Nenhuma mensagem.</Text>}</View>
  {!['RESOLVED','CLOSED'].includes(selected.status)&&<><TextInput style={[styles.input,styles.multiline]} multiline placeholder="Escreva sua resposta" value={reply} onChangeText={setReply}/><Pressable style={[styles.primary,busy&&styles.disabled]} disabled={busy} onPress={sendReply}><Text style={styles.primaryText}>{busy?"ENVIANDO...":"ENVIAR MENSAGEM"}</Text></Pressable></>}
  {!!notice&&<Text style={styles.notice}>{notice}</Text>}
 </ScrollView>;

 return <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
  <Text style={styles.title}>Central de Ajuda</Text><Text style={styles.subtitle}>Abra um chamado e acompanhe a resposta sem sair do CLICK-FOOD.</Text>
  {!!notice&&<Text style={styles.notice}>{notice}</Text>}
  <View style={styles.card}><Text style={styles.cardTitle}>Novo chamado</Text><Text style={styles.label}>Assunto</Text>
   <ScrollView horizontal showsHorizontalScrollIndicator={false}>{["ORDER","PAYMENT_REFUND","DELIVERY","ACCOUNT","OTHER"].map(value=><Pressable key={value} style={[styles.chip,category===value&&styles.chipActive]} onPress={()=>setCategory(value)}><Text style={category===value?styles.chipTextActive:styles.chipText}>{categoryLabel[value]}</Text></Pressable>)}</ScrollView>
   <Text style={styles.label}>Pedido relacionado (opcional)</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}>{orders.map(order=><Pressable key={order.id} style={[styles.chip,orderId===order.id&&styles.chipActive]} onPress={()=>setOrderId(orderId===order.id?"":order.id)}><Text style={orderId===order.id?styles.chipTextActive:styles.chipText}>#{order.order_number} • {order.status}</Text></Pressable>)}</ScrollView>
   <TextInput style={styles.input} placeholder="Ex.: preciso cancelar e receber meu PIX" value={subject} onChangeText={setSubject}/><TextInput style={[styles.input,styles.multiline]} multiline placeholder="Conte o que aconteceu" value={text} onChangeText={setText}/>
   <Pressable style={[styles.primary,busy&&styles.disabled]} disabled={busy} onPress={createTicket}><Text style={styles.primaryText}>{busy?"ABRINDO...":"ABRIR CHAMADO"}</Text></Pressable>
  </View>
  <Text style={styles.section}>Meus chamados</Text>{tickets.map(ticket=><Pressable key={ticket.id} style={styles.ticket} onPress={()=>openTicket(ticket)}><View style={{flex:1}}><Text style={styles.ticketTitle}>{ticket.subject}</Text><Text style={styles.meta}>{categoryLabel[ticket.category]??ticket.category}{ticket.order_id?" • vinculado a pedido":""}</Text></View><View><Text style={styles.status}>{statusLabel[ticket.status]??ticket.status}</Text><Text style={styles.arrow}>›</Text></View></Pressable>)}{!tickets.length&&<Text style={styles.empty}>Você ainda não abriu chamados.</Text>}
 </ScrollView>;
}

const styles=StyleSheet.create({
 wrap:{padding:18,paddingBottom:40},title:{fontSize:28,fontWeight:"900",color:"#111",marginBottom:4},subtitle:{fontSize:12,color:"#666",marginBottom:16},notice:{backgroundColor:"#fff4c7",color:"#665200",padding:11,borderRadius:11,marginBottom:12,fontWeight:"700"},card:{backgroundColor:"#fff",borderRadius:16,padding:14,borderWidth:1,borderColor:"#e7e7e7"},cardTitle:{fontSize:18,fontWeight:"900",marginBottom:10},label:{fontSize:11,fontWeight:"900",marginTop:10,marginBottom:7,color:"#444"},chip:{paddingVertical:9,paddingHorizontal:11,borderRadius:10,borderWidth:1,borderColor:"#ddd",marginRight:7,backgroundColor:"#fff"},chipActive:{backgroundColor:"#111",borderColor:"#111"},chipText:{fontSize:10,fontWeight:"800",color:"#333"},chipTextActive:{fontSize:10,fontWeight:"900",color:"#fff"},input:{marginTop:10,borderWidth:1,borderColor:"#ddd",backgroundColor:"#fafafa",borderRadius:11,padding:12},multiline:{minHeight:90,textAlignVertical:"top"},primary:{marginTop:10,backgroundColor:"#f4c400",borderRadius:12,padding:14,alignItems:"center"},primaryText:{fontWeight:"900",color:"#111"},disabled:{opacity:.5},section:{fontSize:19,fontWeight:"900",marginTop:24,marginBottom:10},ticket:{flexDirection:"row",alignItems:"center",gap:10,backgroundColor:"#fff",borderRadius:14,padding:13,borderWidth:1,borderColor:"#e7e7e7",marginBottom:8},ticketTitle:{fontSize:14,fontWeight:"900"},meta:{fontSize:10,color:"#777",marginTop:4},status:{fontSize:9,fontWeight:"900",color:"#806700",textAlign:"right"},arrow:{fontSize:22,textAlign:"right"},empty:{padding:20,textAlign:"center",color:"#777"},back:{fontWeight:"900",color:"#856a00",marginBottom:18},chat:{marginTop:18,marginBottom:10},message:{backgroundColor:"#fff",borderRadius:13,padding:12,marginBottom:8,borderWidth:1,borderColor:"#e8e8e8"},messageText:{fontSize:13,lineHeight:19,color:"#222"},time:{fontSize:9,color:"#999",marginTop:6}
});
