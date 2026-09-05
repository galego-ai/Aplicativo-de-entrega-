import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "./supabase";

type PayoutStatus="REQUESTED"|"APPROVED"|"PROCESSING"|"PAID"|"FAILED"|"REJECTED"|"CANCELLED";
type Payout={id:string;amount:number;gross_amount?:number;anticipation?:boolean;anticipation_fee?:number;anticipation_days?:number;method:string;status:PayoutStatus;destination_value:string;requested_at:string;processed_at:string|null;review_notes:string|null;provider_id:string|null};
type Anticipation={availableGross:number;fee:number;net:number;maxDays:number;minRateMonthly:number;maxRateMonthly:number;requestedGross?:number;details:any[]};
type Summary={availableBalance:number;anticipation:Anticipation;payouts:Payout[]};

const brl=(value:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value||0);
const statusLabel:Record<PayoutStatus,string>={REQUESTED:"Solicitado",APPROVED:"Aprovado",PROCESSING:"Processando",PAID:"Pago",FAILED:"Falhou",REJECTED:"Recusado",CANCELLED:"Cancelado"};
const maskDestination=(value:string)=>{const v=(value??"").trim();if(v.length<=6)return v?"••••••":"-";return `${v.slice(0,3)}••••${v.slice(-3)}`;};
const payoutError=(code?:string)=>({INVALID_PIX_KEY:"A chave PIX informada é inválida. Use CPF, CNPJ, e-mail, telefone ou chave aleatória válida.",INVALID_AMOUNT:"Informe um valor válido com até duas casas decimais.",INSUFFICIENT_AVAILABLE_BALANCE:"Seu saldo disponível mudou. Atualize e tente novamente.",DRIVER_REQUIRED:"Seu cadastro de entregador não foi localizado."}[String(code??"")]??"Não foi possível solicitar o repasse.");

export default function DriverWallet(){
 const[loading,setLoading]=useState(true);const[busy,setBusy]=useState(false);const[summary,setSummary]=useState<Summary>({availableBalance:0,anticipation:{availableGross:0,fee:0,net:0,maxDays:0,minRateMonthly:0,maxRateMonthly:0,details:[]},payouts:[]});const[amount,setAmount]=useState("");const[pixKey,setPixKey]=useState("");const[savedPix,setSavedPix]=useState(false);const[message,setMessage]=useState("");const[antAmount,setAntAmount]=useState("");const[antPreview,setAntPreview]=useState<Anticipation|null>(null);
 const pending=useMemo(()=>summary.payouts.filter(p=>["REQUESTED","APPROVED","PROCESSING"].includes(p.status)).reduce((sum,p)=>sum+Number(p.amount),0),[summary.payouts]);
 const recentPaid=useMemo(()=>summary.payouts.filter(p=>p.status==="PAID").reduce((sum,p)=>sum+Number(p.amount),0),[summary.payouts]);

 async function load(){setLoading(true);const[summaryResult,sessionResult]=await Promise.all([supabase.functions.invoke("payout-action",{body:{action:"DRIVER_SUMMARY"}}),supabase.auth.getSession()]);const{data,error}=summaryResult;if(error||data?.error){setMessage("Não foi possível consultar sua carteira agora.");setLoading(false);return;}setSummary({availableBalance:Number(data.availableBalance??0),anticipation:{...{availableGross:0,fee:0,net:0,maxDays:0,minRateMonthly:0,maxRateMonthly:0,details:[]},...(data.anticipation??{})},payouts:(data.payouts??[]).map((p:any)=>({...p,amount:Number(p.amount),gross_amount:Number(p.gross_amount??p.amount),anticipation_fee:Number(p.anticipation_fee??0)}))});const userId=sessionResult.data.session?.user.id;if(userId){const{data:driver}=await supabase.from("drivers").select("id").eq("user_id",userId).maybeSingle();if(driver?.id){const{data:profile}=await supabase.from("driver_payout_profiles").select("pix_key").eq("driver_id",driver.id).maybeSingle();if(profile?.pix_key){setPixKey(String(profile.pix_key));setSavedPix(true);}else setSavedPix(false);}}setLoading(false);}
 useEffect(()=>{void load();},[]);

 async function requestPayout(){
  const parsed=Number(amount.replace(",","."));
  if(!Number.isFinite(parsed)||parsed<=0){setMessage("Informe um valor válido para o repasse.");return;}
  if(parsed>summary.availableBalance+0.001){setMessage("O valor solicitado é maior que seu saldo disponível.");return;}
  if(!pixKey.trim()){setMessage("Cadastre ou informe a chave PIX que receberá o repasse.");return;}
  Alert.alert("Solicitar repasse PIX",`Solicitar ${brl(parsed)} para a chave informada?`,[
   {text:"Cancelar",style:"cancel"},
   {text:"SOLICITAR",onPress:async()=>{
    setBusy(true);setMessage("");
    const{data,error}=await supabase.functions.invoke("payout-action",{body:{action:"DRIVER_REQUEST",amount:parsed,method:"PIX",destinationValue:pixKey.trim()}});
    if(error||data?.error){setMessage(payoutError(data?.error));setBusy(false);return;}
    setAmount("");setMessage("Repasse solicitado. A Matriz fará a análise antes do pagamento.");await load();setBusy(false);
   }},
  ]);
 }

 async function previewAnticipation(){const parsed=Number(antAmount.replace(",","."));if(!Number.isFinite(parsed)||parsed<=0){setMessage("Informe o valor que deseja antecipar.");return;}if(parsed>Number(summary.anticipation.availableGross||0)+0.001){setMessage("O valor é maior que seu saldo antecipável.");return;}setBusy(true);setMessage("");const{data,error}=await supabase.functions.invoke("payout-action",{body:{action:"DRIVER_ANTICIPATION_PREVIEW",amount:parsed}});setBusy(false);if(error||data?.error){setAntPreview(null);setMessage(payoutError(data?.error));return;}setAntPreview(data.preview);setMessage("Confira a taxa e o valor líquido antes de confirmar.");}
 async function requestAnticipation(){const parsed=Number(antAmount.replace(",","."));if(!antPreview||Math.abs(Number(antPreview.requestedGross??parsed)-parsed)>0.01){setMessage("Calcule novamente a antecipação antes de confirmar.");return;}if(!pixKey.trim()){setMessage("Cadastre sua chave PIX antes de antecipar.");return;}Alert.alert("Antecipar recebíveis",`Bruto: ${brl(parsed)}
Taxa Matriz: ${brl(Number(antPreview.fee||0))}
Líquido: ${brl(Number(antPreview.net||0))}
Confirmar?`,[{text:"Cancelar",style:"cancel"},{text:"ANTECIPAR",onPress:async()=>{setBusy(true);setMessage("");const{data,error}=await supabase.functions.invoke("payout-action",{body:{action:"DRIVER_ANTICIPATE",amount:parsed,destinationValue:pixKey.trim()}});if(error||data?.error){setMessage(payoutError(data?.error));setBusy(false);await load();return;}setAntAmount("");setAntPreview(null);setMessage(`Antecipação solicitada. Líquido para PIX: ${brl(Number(data?.payout?.amount??0))}.`);await load();setBusy(false);}}]);}

 function cancelPayout(payout:Payout){
  Alert.alert("Cancelar solicitação",`Cancelar o repasse de ${brl(payout.amount)}?`,[
   {text:"Não",style:"cancel"},
   {text:"CANCELAR",style:"destructive",onPress:async()=>{
    setBusy(true);const{data,error}=await supabase.functions.invoke("payout-action",{body:{action:"DRIVER_CANCEL",payoutId:payout.id}});if(error||data?.error){setMessage("Esta solicitação não pode mais ser cancelada.");setBusy(false);await load();return;}setMessage("Solicitação cancelada.");await load();setBusy(false);
   }},
  ]);
 }

 return <View>
  <View style={styles.balanceCard}><Text style={styles.kicker}>SALDO DISPONÍVEL PARA REPASSE</Text><Text style={styles.balance}>{loading?"…":brl(summary.availableBalance)}</Text><View style={styles.summaryRow}><View><Text style={styles.summaryValue}>{brl(pending)}</Text><Text style={styles.summaryLabel}>em análise/processo</Text></View><View><Text style={styles.summaryValue}>{brl(recentPaid)}</Text><Text style={styles.summaryLabel}>pagos no histórico recente</Text></View></View></View>
  {!!message&&<Text style={styles.notice}>{message}</Text>}

  <View style={styles.form}><Text style={styles.title}>Antecipação de recebíveis</Text><Text style={styles.help}>A Matriz define D+n e a taxa mensal. Você vê a taxa proporcional aos dias restantes antes de confirmar.</Text><Text style={styles.kicker}>SALDO ANTECIPÁVEL</Text><Text style={[styles.balance,{color:"#111",fontSize:27}]}>{brl(Number(summary.anticipation.availableGross||0))}</Text>{Number(summary.anticipation.availableGross||0)>0?<><TextInput style={styles.input} placeholder="Valor bruto a antecipar" keyboardType="decimal-pad" value={antAmount} onChangeText={v=>{setAntAmount(v);setAntPreview(null)}}/><Pressable style={[styles.button,busy&&styles.disabled]} disabled={busy} onPress={previewAnticipation}><Text style={styles.buttonText}>CALCULAR TAXA</Text></Pressable>{antPreview&&<View style={styles.anticipationBox}><Text style={styles.rowTitle}>Taxa Matriz: {brl(Number(antPreview.fee||0))}</Text><Text style={styles.rowTitle}>Líquido: {brl(Number(antPreview.net||0))}</Text><Text style={styles.meta}>Até {Number(antPreview.maxDays||0)} dia(s) antecipados • {Number(antPreview.minRateMonthly||0).toFixed(2)}% a.m.</Text><Pressable style={[styles.button,{marginTop:10},busy&&styles.disabled]} disabled={busy} onPress={requestAnticipation}><Text style={styles.buttonText}>SOLICITAR ANTECIPAÇÃO PIX</Text></Pressable></View>}</>:<Text style={styles.help}>Nenhum recebível futuro elegível no momento.</Text>}</View>

  <View style={styles.form}><Text style={styles.title}>Solicitar repasse</Text><Text style={styles.help}>{savedPix?"Sua chave PIX cadastrada no menu já foi preenchida abaixo. Você pode solicitar o repasse sem digitá-la novamente.":"Cadastre sua chave PIX no menu do entregador ou informe uma chave válida abaixo. A solicitação fica pendente até a Matriz aprovar."}</Text><TextInput style={styles.input} placeholder="Valor, ex.: 50,00" keyboardType="decimal-pad" value={amount} onChangeText={setAmount}/><TextInput style={styles.input} placeholder="Sua chave PIX" autoCapitalize="none" value={pixKey} onChangeText={setPixKey}/><Pressable style={[styles.button,(busy||loading||summary.availableBalance<=0)&&styles.disabled]} disabled={busy||loading||summary.availableBalance<=0} onPress={requestPayout}><Text style={styles.buttonText}>{busy?"PROCESSANDO...":summary.availableBalance<=0?"SEM SALDO DISPONÍVEL":"SOLICITAR REPASSE PIX"}</Text></Pressable></View>

  <View style={styles.historyHead}><Text style={styles.title}>Histórico de repasses</Text><Pressable onPress={load} disabled={loading}><Text style={styles.refresh}>{loading?"Atualizando...":"Atualizar"}</Text></Pressable></View>
  {summary.payouts.length?summary.payouts.map(p=><View style={styles.row} key={p.id}><View style={{flex:1}}><Text style={styles.rowTitle}>{brl(p.amount)} • {statusLabel[p.status]??p.status}{p.anticipation?" • ANTECIPAÇÃO":""}</Text><Text style={styles.meta}>{p.anticipation?`Bruto ${brl(Number(p.gross_amount??p.amount))} • taxa ${brl(Number(p.anticipation_fee??0))} • ${Number(p.anticipation_days??0)} dia(s) • `:""}PIX {maskDestination(p.destination_value)} • {new Date(p.requested_at).toLocaleDateString("pt-BR")}</Text>{p.review_notes&&<Text style={styles.note}>{p.review_notes}</Text>}</View>{p.status==="REQUESTED"&&<Pressable style={styles.cancel} disabled={busy} onPress={()=>cancelPayout(p)}><Text style={styles.cancelText}>Cancelar</Text></Pressable>}</View>):!loading&&<Text style={styles.empty}>Nenhum repasse solicitado ainda.</Text>}
 </View>;
}

const styles=StyleSheet.create({balanceCard:{backgroundColor:"#111",borderRadius:22,padding:20},kicker:{fontSize:10,fontWeight:"900",letterSpacing:1,color:"#9a9a9a"},balance:{fontSize:34,fontWeight:"900",color:"#fff",marginTop:5},summaryRow:{flexDirection:"row",justifyContent:"space-between",gap:16,marginTop:18},summaryValue:{color:"#fff",fontWeight:"900",fontSize:14},summaryLabel:{color:"#999",fontSize:9,marginTop:3},notice:{backgroundColor:"#fff4c6",color:"#6d5900",padding:12,borderRadius:12,marginVertical:10},form:{backgroundColor:"#fff",borderRadius:18,padding:16,marginTop:14,borderWidth:1,borderColor:"#e6e6e6"},title:{fontSize:17,fontWeight:"900"},help:{fontSize:11,color:"#666",lineHeight:16,marginTop:6,marginBottom:12},input:{backgroundColor:"#f7f7f7",borderWidth:1,borderColor:"#ddd",borderRadius:12,padding:13,marginBottom:9},button:{backgroundColor:"#f4c400",padding:14,borderRadius:13,alignItems:"center"},buttonText:{fontWeight:"900",fontSize:11},disabled:{opacity:.5},historyHead:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginTop:22,marginBottom:10},refresh:{color:"#8e7000",fontWeight:"900",fontSize:12},row:{backgroundColor:"#fff",borderRadius:15,padding:14,marginBottom:8,flexDirection:"row",alignItems:"center",gap:10},rowTitle:{fontWeight:"900"},meta:{fontSize:10,color:"#777",marginTop:4},note:{fontSize:10,color:"#7a5e00",marginTop:5},cancel:{borderWidth:1,borderColor:"#e3b6b1",paddingVertical:7,paddingHorizontal:9,borderRadius:9},cancelText:{color:"#a7352c",fontWeight:"900",fontSize:10},anticipationBox:{marginTop:10,backgroundColor:"#fff8cf",borderWidth:1,borderColor:"#ead675",borderRadius:12,padding:12},empty:{color:"#777",textAlign:"center",paddingVertical:20}});
