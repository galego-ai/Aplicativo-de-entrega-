import React,{useState}from"react";
import{Pressable,StyleSheet,Text,TextInput,View}from"react-native";
import{supabase}from"./supabase";

type Props={order:{id:string;store_id:string};customerId:string;onDone:()=>void;onCancel:()=>void};
type RatingKey="store"|"delivery"|"time"|"taste"|"temperature";
const labels:Record<RatingKey,{title:string;hint:string}>={
 store:{title:"Restaurante",hint:"Sua experiência geral com a loja"},
 delivery:{title:"Entrega",hint:"Cuidado e qualidade da entrega"},
 time:{title:"Tempo da entrega",hint:"O pedido chegou no tempo esperado?"},
 taste:{title:"Sabor",hint:"Qualidade e sabor dos produtos"},
 temperature:{title:"Temperatura",hint:"O pedido chegou na temperatura adequada?"},
};

function StarRow({value,onChange}:{value:number;onChange:(value:number)=>void}){return <View style={styles.stars}>{[1,2,3,4,5].map(star=><Pressable key={star} onPress={()=>onChange(star)} hitSlop={5}><Text style={[styles.star,star<=value&&styles.starActive]}>★</Text></Pressable>)}</View>}

export default function CustomerDetailedReview({order,customerId,onDone,onCancel}:Props){
 const[ratings,setRatings]=useState<Record<RatingKey,number>>({store:5,delivery:5,time:5,taste:5,temperature:5});const[comment,setComment]=useState("");const[busy,setBusy]=useState(false);const[message,setMessage]=useState("");
 function set(key:RatingKey,value:number){setRatings(current=>({...current,[key]:value}));}
 async function submit(){
  if(busy)return;setBusy(true);setMessage("");
  const{data:delivery}=await supabase.from("deliveries").select("driver_id,status").eq("order_id",order.id).maybeSingle();const driverId=delivery?.status==="DELIVERED"?delivery.driver_id:null;
  const{error}=await supabase.from("reviews").insert({order_id:order.id,customer_id:customerId,store_id:order.store_id,store_rating:ratings.store,driver_id:driverId,driver_rating:driverId?ratings.delivery:null,delivery_rating:ratings.delivery,delivery_time_rating:ratings.time,taste_rating:ratings.taste,temperature_rating:ratings.temperature,comment:comment.trim()||null});
  setBusy(false);if(error){setMessage(error.code==="23505"?"Este pedido já foi avaliado.":"Não foi possível enviar sua avaliação agora.");return;}onDone();
 }
 return <View style={styles.box}><Text style={styles.title}>Avalie seu pedido</Text><Text style={styles.subtitle}>Sua opinião ajuda a loja, a entrega e a Matriz CLICK-FOOD a melhorar.</Text>{(Object.keys(labels) as RatingKey[]).map(key=><View key={key} style={styles.row}><View style={styles.labelWrap}><Text style={styles.label}>{labels[key].title}</Text><Text style={styles.hint}>{labels[key].hint}</Text></View><StarRow value={ratings[key]} onChange={value=>set(key,value)}/></View>)}<TextInput style={styles.input} placeholder="Comentário opcional" multiline value={comment} onChangeText={setComment}/>{!!message&&<Text style={styles.message}>{message}</Text>}<Pressable style={[styles.submit,busy&&styles.disabled]} disabled={busy} onPress={submit}><Text style={styles.submitText}>{busy?"ENVIANDO...":"ENVIAR AVALIAÇÃO"}</Text></Pressable><Pressable onPress={onCancel}><Text style={styles.cancel}>Cancelar</Text></Pressable></View>;
}

const styles=StyleSheet.create({box:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e1d49d",borderRadius:14,padding:14,marginTop:6},title:{fontSize:18,fontWeight:"900",color:"#111"},subtitle:{fontSize:10,color:"#666",lineHeight:15,marginTop:4,marginBottom:8},row:{paddingVertical:9,borderBottomWidth:1,borderBottomColor:"#eee"},labelWrap:{marginBottom:5},label:{fontSize:12,fontWeight:"900",color:"#222"},hint:{fontSize:9.5,color:"#777",marginTop:2},stars:{flexDirection:"row",gap:7},star:{fontSize:31,color:"#ccc"},starActive:{color:"#f4c400"},input:{minHeight:74,backgroundColor:"#fafafa",borderWidth:1,borderColor:"#ddd",borderRadius:11,padding:11,textAlignVertical:"top",marginTop:12},message:{backgroundColor:"#fff3c8",color:"#765c00",fontWeight:"800",fontSize:10,padding:9,borderRadius:9,marginTop:9},submit:{backgroundColor:"#111",borderRadius:11,paddingVertical:13,alignItems:"center",marginTop:11},submitText:{color:"#f4c400",fontWeight:"900",fontSize:10},cancel:{textAlign:"center",fontWeight:"800",color:"#8d7000",padding:12},disabled:{opacity:.55}});
