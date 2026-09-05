from pathlib import Path


def must_replace(path: str, old: str, new: str):
    p=Path(path); s=p.read_text()
    if old not in s:
        raise SystemExit(f'Padrao nao encontrado em {path}: {old[:120]}')
    p.write_text(s.replace(old,new,1))

# MATRIZ: prazo normal D+n na regra de antecipacao.
path='apps/admin/app/regras-divisao/page.tsx'
must_replace(path,
'anticipation:{storeAllowed:boolean;driverAllowed:boolean;monthlyPercentage:number;defaultMode:string;feeDestination:string}',
'anticipation:{storeAllowed:boolean;driverAllowed:boolean;monthlyPercentage:number;defaultMode:string;feeDestination:string;settlementDelayDays:number}')
must_replace(path,
'anticipation:{storeAllowed:true,driverAllowed:true,monthlyPercentage:2.5,defaultMode:"AUTOMATIC",feeDestination:"MATRIX"}',
'anticipation:{storeAllowed:true,driverAllowed:true,monthlyPercentage:2.5,defaultMode:"AUTOMATIC",feeDestination:"MATRIX",settlementDelayDays:30}')
must_replace(path,
'INSTALLMENT_RATE_NOT_CONFIGURED:"Não existe taxa configurada para esta quantidade de parcelas."',
'INSTALLMENT_RATE_NOT_CONFIGURED:"Não existe taxa configurada para esta quantidade de parcelas.",INVALID_SETTLEMENT_DELAY:"O prazo normal de liquidação deve estar entre D+0 e D+365.",DRIVER_CARD_FEE_NOT_ALLOWED:"O Entregador é isento da taxa de cartão.",PLAN_SCOPE_TARGET_REQUIRED:"Selecione o plano.",STORE_SCOPE_TARGET_REQUIRED:"Selecione a loja.",SUBSCRIPTION_SCOPE_TARGET_REQUIRED:"Selecione o contrato."')
old='''<div className="formRow"><label>Modalidade padrão<select value={config.anticipation.defaultMode} onChange={e=>setConfig(c=>({...c,anticipation:{...c.anticipation,defaultMode:e.target.value}}))}><option value="AUTOMATIC">Automática</option><option value="ON_DEMAND">Sob demanda</option><option value="DISABLED">Desativada</option></select></label><label>Taxa de antecipação (% a.m.)<input type="number" step="0.01" min="0" value={config.anticipation.monthlyPercentage} onChange={e=>setConfig(c=>({...c,anticipation:{...c.anticipation,monthlyPercentage:numberValue(e.target.value)}}))}/></label></div>'''
new='''<div className="formRow"><label>Modalidade padrão<select value={config.anticipation.defaultMode} onChange={e=>setConfig(c=>({...c,anticipation:{...c.anticipation,defaultMode:e.target.value}}))}><option value="AUTOMATIC">Automática</option><option value="ON_DEMAND">Sob demanda</option><option value="DISABLED">Desativada</option></select></label><label>Taxa de antecipação (% a.m.)<input type="number" step="0.01" min="0" value={config.anticipation.monthlyPercentage} onChange={e=>setConfig(c=>({...c,anticipation:{...c.anticipation,monthlyPercentage:numberValue(e.target.value)}}))}/></label></div><div className="formRow"><label>Prazo normal de liquidação (D+n)<input type="number" min="0" max="365" step="1" value={config.anticipation.settlementDelayDays} onChange={e=>setConfig(c=>({...c,anticipation:{...c.anticipation,settlementDelayDays:Math.max(0,Math.min(365,Math.round(numberValue(e.target.value))))}}))}/><small>Ex.: 30 = saldo normal em D+30. Antes disso, somente antecipação conforme a política.</small></label><label>Fórmula da antecipação<input value={`Taxa mensal × dias antecipados ÷ 30`} disabled/><small>A taxa é calculada proporcionalmente aos dias restantes e vai 100% para a Matriz.</small></label></div>'''
must_replace(path,old,new)

# LOJISTA: saldo antecipavel, previa e solicitacao.
path='apps/lojista/app/repasses/page.tsx'
must_replace(path,
'type Payout={id:string;amount:number;method:string;status:string;destination_value:string|null;review_notes:string|null;requested_at:string;processed_at:string|null;automatic_payout?:boolean};',
'type Payout={id:string;amount:number;gross_amount?:number;anticipation?:boolean;anticipation_fee?:number;anticipation_days?:number;method:string;status:string;destination_value:string|null;review_notes:string|null;requested_at:string;processed_at:string|null;automatic_payout?:boolean};\ntype Anticipation={availableGross:number;fee:number;net:number;maxDays:number;minRateMonthly:number;maxRateMonthly:number;details:any[]};')
must_replace(path,
'const[pixType,setPixType]=useState<PixType>("CNPJ");const[pixKey,setPixKey]=useState("");const[automatic,setAutomatic]=useState(false);const[minimum,setMinimum]=useState("1,00");const[profileBusy,setProfileBusy]=useState(false);const[profileSaved,setProfileSaved]=useState(false);',
'const[pixType,setPixType]=useState<PixType>("CNPJ");const[pixKey,setPixKey]=useState("");const[automatic,setAutomatic]=useState(false);const[minimum,setMinimum]=useState("1,00");const[profileBusy,setProfileBusy]=useState(false);const[profileSaved,setProfileSaved]=useState(false);const[anticipation,setAnticipation]=useState<Anticipation>({availableGross:0,fee:0,net:0,maxDays:0,minRateMonthly:0,maxRateMonthly:0,details:[]});const[antAmount,setAntAmount]=useState("");const[antPreview,setAntPreview]=useState<Anticipation|null>(null);')
must_replace(path,
'setAvailable(Number(data.availableBalance??0));setPayouts((data.payouts??[]).map((x:any)=>({...x,amount:Number(x.amount)})));',
'setAvailable(Number(data.availableBalance??0));setAnticipation({...{availableGross:0,fee:0,net:0,maxDays:0,minRateMonthly:0,maxRateMonthly:0,details:[]},...(data.anticipation??{})});setPayouts((data.payouts??[]).map((x:any)=>({...x,amount:Number(x.amount),gross_amount:Number(x.gross_amount??x.amount),anticipation_fee:Number(x.anticipation_fee??0)})));')
needle=''' async function cancel(id:string){setBusy(true);const{data,error}=await supabase.functions.invoke("payout-action",{body:{action:"CANCEL",payoutId:id}});setBusy(false);setMessage(error||data?.error?"Não foi possível cancelar o repasse.":"Solicitação cancelada e saldo liberado.");await load();}'''
insert=''' async function previewAnticipation(){const amount=Number(antAmount.replace(",","."));if(!Number.isFinite(amount)||amount<=0){setMessage("Informe o valor que deseja antecipar.");return;}if(amount>anticipation.availableGross+0.001){setMessage("O valor é maior que o saldo disponível para antecipação.");return;}setBusy(true);setMessage("");const{data,error}=await supabase.functions.invoke("payout-action",{body:{action:"STORE_ANTICIPATION_PREVIEW",storeId,amount}});setBusy(false);if(error||data?.error){setAntPreview(null);setMessage(requestError(data?.error));return;}setAntPreview(data.preview);setMessage("Confira a taxa e o valor líquido antes de solicitar.");}
 async function requestAnticipation(){const amount=Number(antAmount.replace(",","."));if(!antPreview||Math.abs(Number(antPreview.requestedGross??amount)-amount)>0.01){setMessage("Calcule novamente a antecipação antes de confirmar.");return;}if(!pixKey.trim()){setMessage("Cadastre a chave PIX da loja antes de antecipar.");return;}if(!window.confirm(`Antecipar ${brl(amount)}? Taxa da Matriz: ${brl(Number(antPreview.fee||0))}. Líquido: ${brl(Number(antPreview.net||0))}.`))return;setBusy(true);setMessage("");const{data,error}=await supabase.functions.invoke("payout-action",{body:{action:"REQUEST_ANTICIPATION",storeId,amount,destinationValue:pixKey}});setBusy(false);if(error||data?.error){setMessage(requestError(data?.error));await load();return;}setAntAmount("");setAntPreview(null);setMessage(`Antecipação solicitada. Valor líquido reservado para PIX: ${brl(Number(data?.payout?.amount??0))}.`);await load();}
'''+needle
must_replace(path,needle,insert)
needle='''  <article className="setupCard"><h2>Solicitar repasse manual</h2>'''
insert='''  <article className="setupCard"><h2>Antecipação de recebíveis</h2><p className="setupHint">A Matriz define o prazo normal e a taxa mensal. Aqui você antecipa somente recebíveis ainda não vencidos. A taxa é mostrada antes da confirmação e vai integralmente para a Matriz.</p><small>SALDO ANTECIPÁVEL</small><h2 style={{fontSize:28,margin:"8px 0"}}>{brl(Number(anticipation.availableGross||0))}</h2>{anticipation.availableGross>0?<><label>Valor bruto a antecipar<input value={antAmount} onChange={e=>{setAntAmount(e.target.value);setAntPreview(null)}} placeholder="0,00"/></label><button type="button" disabled={busy} onClick={previewAnticipation}>CALCULAR TAXA</button>{antPreview&&<div className="notice" style={{marginTop:10}}><b>Taxa Matriz: {brl(Number(antPreview.fee||0))}</b><br/>Líquido a receber: <b>{brl(Number(antPreview.net||0))}</b><br/>Prazo antecipado: até {Number(antPreview.maxDays||0)} dia(s) • taxa {Number(antPreview.minRateMonthly||0).toFixed(2)}% a.m.{Number(antPreview.maxRateMonthly||0)!==Number(antPreview.minRateMonthly||0)?` a ${Number(antPreview.maxRateMonthly||0).toFixed(2)}% a.m.`:""}<br/><button type="button" className="setupPrimary" style={{marginTop:10}} disabled={busy} onClick={requestAnticipation}>SOLICITAR ANTECIPAÇÃO PIX</button></div>}</>:<p className="setupHint">Nenhum recebível futuro elegível. Quando uma Regra de Divisão ativa gerar valores com D+n, eles aparecerão aqui.</p>}</article>
  <article className="setupCard"><h2>Solicitar repasse manual</h2>'''
must_replace(path,needle,insert)
must_replace(path,
'<b>{brl(p.amount)} • {p.status}{p.automatic_payout?" • AUTOMÁTICO":""}</b><small>{p.method}',
'<b>{brl(p.amount)} • {p.status}{p.anticipation?" • ANTECIPAÇÃO":""}{p.automatic_payout?" • AUTOMÁTICO":""}</b><small>{p.anticipation?`Bruto ${brl(Number(p.gross_amount??p.amount))} • taxa Matriz ${brl(Number(p.anticipation_fee??0))} • ${Number(p.anticipation_days??0)} dia(s) • `:""}{p.method}')

# ENTREGADOR: carteira com antecipacao.
path='apps/entregador/DriverWallet.tsx'
must_replace(path,
'type Payout={id:string;amount:number;method:string;status:PayoutStatus;destination_value:string;requested_at:string;processed_at:string|null;review_notes:string|null;provider_id:string|null};\ntype Summary={availableBalance:number;payouts:Payout[]};',
'type Payout={id:string;amount:number;gross_amount?:number;anticipation?:boolean;anticipation_fee?:number;anticipation_days?:number;method:string;status:PayoutStatus;destination_value:string;requested_at:string;processed_at:string|null;review_notes:string|null;provider_id:string|null};\ntype Anticipation={availableGross:number;fee:number;net:number;maxDays:number;minRateMonthly:number;maxRateMonthly:number;requestedGross?:number;details:any[]};\ntype Summary={availableBalance:number;anticipation:Anticipation;payouts:Payout[]};')
must_replace(path,
'const[loading,setLoading]=useState(true);const[busy,setBusy]=useState(false);const[summary,setSummary]=useState<Summary>({availableBalance:0,payouts:[]});const[amount,setAmount]=useState("");const[pixKey,setPixKey]=useState("");const[savedPix,setSavedPix]=useState(false);const[message,setMessage]=useState("");',
'const[loading,setLoading]=useState(true);const[busy,setBusy]=useState(false);const[summary,setSummary]=useState<Summary>({availableBalance:0,anticipation:{availableGross:0,fee:0,net:0,maxDays:0,minRateMonthly:0,maxRateMonthly:0,details:[]},payouts:[]});const[amount,setAmount]=useState("");const[pixKey,setPixKey]=useState("");const[savedPix,setSavedPix]=useState(false);const[message,setMessage]=useState("");const[antAmount,setAntAmount]=useState("");const[antPreview,setAntPreview]=useState<Anticipation|null>(null);')
must_replace(path,
'setSummary({availableBalance:Number(data.availableBalance??0),payouts:(data.payouts??[]).map((p:any)=>({...p,amount:Number(p.amount)}))});',
'setSummary({availableBalance:Number(data.availableBalance??0),anticipation:{...{availableGross:0,fee:0,net:0,maxDays:0,minRateMonthly:0,maxRateMonthly:0,details:[]},...(data.anticipation??{})},payouts:(data.payouts??[]).map((p:any)=>({...p,amount:Number(p.amount),gross_amount:Number(p.gross_amount??p.amount),anticipation_fee:Number(p.anticipation_fee??0)}))});')
needle=''' function cancelPayout(payout:Payout){'''
insert=''' async function previewAnticipation(){const parsed=Number(antAmount.replace(",","."));if(!Number.isFinite(parsed)||parsed<=0){setMessage("Informe o valor que deseja antecipar.");return;}if(parsed>Number(summary.anticipation.availableGross||0)+0.001){setMessage("O valor é maior que seu saldo antecipável.");return;}setBusy(true);setMessage("");const{data,error}=await supabase.functions.invoke("payout-action",{body:{action:"DRIVER_ANTICIPATION_PREVIEW",amount:parsed}});setBusy(false);if(error||data?.error){setAntPreview(null);setMessage(payoutError(data?.error));return;}setAntPreview(data.preview);setMessage("Confira a taxa e o valor líquido antes de confirmar.");}
 async function requestAnticipation(){const parsed=Number(antAmount.replace(",","."));if(!antPreview||Math.abs(Number(antPreview.requestedGross??parsed)-parsed)>0.01){setMessage("Calcule novamente a antecipação antes de confirmar.");return;}if(!pixKey.trim()){setMessage("Cadastre sua chave PIX antes de antecipar.");return;}Alert.alert("Antecipar recebíveis",`Bruto: ${brl(parsed)}\nTaxa Matriz: ${brl(Number(antPreview.fee||0))}\nLíquido: ${brl(Number(antPreview.net||0))}\nConfirmar?`,[{text:"Cancelar",style:"cancel"},{text:"ANTECIPAR",onPress:async()=>{setBusy(true);setMessage("");const{data,error}=await supabase.functions.invoke("payout-action",{body:{action:"DRIVER_ANTICIPATE",amount:parsed,destinationValue:pixKey.trim()}});if(error||data?.error){setMessage(payoutError(data?.error));setBusy(false);await load();return;}setAntAmount("");setAntPreview(null);setMessage(`Antecipação solicitada. Líquido para PIX: ${brl(Number(data?.payout?.amount??0))}.`);await load();setBusy(false);}}]);}

'''+needle
must_replace(path,needle,insert)
needle='''  {!!message&&<Text style={styles.notice}>{message}</Text>}\n\n  <View style={styles.form}><Text style={styles.title}>Solicitar repasse</Text>'''
insert='''  {!!message&&<Text style={styles.notice}>{message}</Text>}\n\n  <View style={styles.form}><Text style={styles.title}>Antecipação de recebíveis</Text><Text style={styles.help}>A Matriz define D+n e a taxa mensal. Você vê a taxa proporcional aos dias restantes antes de confirmar.</Text><Text style={styles.kicker}>SALDO ANTECIPÁVEL</Text><Text style={[styles.balance,{color:"#111",fontSize:27}]}>{brl(Number(summary.anticipation.availableGross||0))}</Text>{Number(summary.anticipation.availableGross||0)>0?<><TextInput style={styles.input} placeholder="Valor bruto a antecipar" keyboardType="decimal-pad" value={antAmount} onChangeText={v=>{setAntAmount(v);setAntPreview(null)}}/><Pressable style={[styles.button,busy&&styles.disabled]} disabled={busy} onPress={previewAnticipation}><Text style={styles.buttonText}>CALCULAR TAXA</Text></Pressable>{antPreview&&<View style={styles.anticipationBox}><Text style={styles.rowTitle}>Taxa Matriz: {brl(Number(antPreview.fee||0))}</Text><Text style={styles.rowTitle}>Líquido: {brl(Number(antPreview.net||0))}</Text><Text style={styles.meta}>Até {Number(antPreview.maxDays||0)} dia(s) antecipados • {Number(antPreview.minRateMonthly||0).toFixed(2)}% a.m.</Text><Pressable style={[styles.button,{marginTop:10},busy&&styles.disabled]} disabled={busy} onPress={requestAnticipation}><Text style={styles.buttonText}>SOLICITAR ANTECIPAÇÃO PIX</Text></Pressable></View>}</>:<Text style={styles.help}>Nenhum recebível futuro elegível no momento.</Text>}</View>\n\n  <View style={styles.form}><Text style={styles.title}>Solicitar repasse</Text>'''
must_replace(path,needle,insert)
must_replace(path,
'<Text style={styles.rowTitle}>{brl(p.amount)} • {statusLabel[p.status]??p.status}</Text><Text style={styles.meta}>PIX',
'<Text style={styles.rowTitle}>{brl(p.amount)} • {statusLabel[p.status]??p.status}{p.anticipation?" • ANTECIPAÇÃO":""}</Text><Text style={styles.meta}>{p.anticipation?`Bruto ${brl(Number(p.gross_amount??p.amount))} • taxa ${brl(Number(p.anticipation_fee??0))} • ${Number(p.anticipation_days??0)} dia(s) • `:""}PIX')
must_replace(path,
'empty:{color:"#777",textAlign:"center",paddingVertical:20}});',
'anticipationBox:{marginTop:10,backgroundColor:"#fff8cf",borderWidth:1,borderColor:"#ead675",borderRadius:12,padding:12},empty:{color:"#777",textAlign:"center",paddingVertical:20}});')

# MATRIZ: identificar antecipacoes na fila de repasses.
path='apps/admin/app/repasses/page.tsx'
must_replace(path,
'type Payout={id:string;recipient_type:"STORE"|"DRIVER";store_id:string|null;driver_id:string|null;amount:number;method:string;status:string;',
'type Payout={id:string;recipient_type:"STORE"|"DRIVER";store_id:string|null;driver_id:string|null;amount:number;gross_amount?:number;anticipation?:boolean;anticipation_fee?:number;anticipation_days?:number;method:string;status:string;')
must_replace(path,
'.select("id,recipient_type,store_id,driver_id,amount,method,status,destination_value,review_notes,provider_id,provider_name,provider_status,provider_end_to_end_id,provider_last_error,requested_at,processed_at")',
'.select("id,recipient_type,store_id,driver_id,amount,gross_amount,anticipation,anticipation_fee,anticipation_days,method,status,destination_value,review_notes,provider_id,provider_name,provider_status,provider_end_to_end_id,provider_last_error,requested_at,processed_at")')
must_replace(path,
'<b>{p.recipient_type==="DRIVER"?"ENTREGADOR":"LOJA"} • {recipientName(p)} • {brl(p.amount)}</b><small>{p.method}',
'<b>{p.recipient_type==="DRIVER"?"ENTREGADOR":"LOJA"} • {recipientName(p)} • {brl(p.amount)}{p.anticipation?" • ANTECIPAÇÃO":""}</b><small>{p.anticipation?`Bruto ${brl(Number(p.gross_amount??p.amount))} • taxa Matriz ${brl(Number(p.anticipation_fee??0))} • ${Number(p.anticipation_days??0)} dia(s) • `:""}{p.method}')

print('PATCH_ANTICIPATION_OK')
