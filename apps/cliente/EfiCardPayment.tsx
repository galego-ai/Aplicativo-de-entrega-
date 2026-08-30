import React, { useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { supabase } from "./supabase";

export type CardTokenizationConfig = {
  provider: "EFI";
  accountId: string;
  environment: "sandbox" | "production";
  brands: string[];
};

export type PendingCardOrder = {
  orderId: string;
  total: number;
};

type Props = {
  visible: boolean;
  config: CardTokenizationConfig;
  order: PendingCardOrder;
  defaults: { name: string; email: string; phone: string };
  onCancel: () => Promise<void> | void;
  onComplete: (result: { paid: boolean; approved: boolean; status: string }) => Promise<void> | void;
};

const safeJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

function buildHtml(config: CardTokenizationConfig, total: number, defaults: Props["defaults"]) {
  const accountId = safeJson(config.accountId);
  const environment = safeJson(config.environment);
  const totalCents = Math.max(0, Math.round(total * 100));
  const initialName = safeJson(defaults.name || "");
  const initialEmail = safeJson(defaults.email || "");
  const initialPhone = safeJson(defaults.phone || "");
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<meta http-equiv="Cache-Control" content="no-store" />
<title>Pagamento seguro</title>
<script src="https://cdn.jsdelivr.net/gh/efipay/js-payment-token-efi/dist/payment-token-efi-umd.min.js"></script>
<style>
*{box-sizing:border-box}body{margin:0;background:#f7f7f7;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#111}.wrap{padding:18px 18px 42px}.brand{font-size:22px;font-weight:900;margin-bottom:4px}.brand span{color:#e1b400}.sub{font-size:12px;color:#666;line-height:1.45;margin-bottom:18px}.total{background:#111;color:#fff;border-radius:16px;padding:16px;margin-bottom:16px}.total small{display:block;color:#bbb;font-weight:700}.total strong{display:block;font-size:25px;margin-top:4px}.card{background:#fff;border:1px solid #e5e5e5;border-radius:16px;padding:14px;margin-bottom:12px}.label{font-size:11px;font-weight:800;color:#555;margin:9px 0 5px}.input,.select{width:100%;height:46px;border:1px solid #d8d8d8;border-radius:11px;padding:0 12px;font-size:15px;background:#fff}.row{display:flex;gap:9px}.row>div{flex:1}.button{width:100%;border:0;border-radius:13px;background:#f4c400;padding:15px;font-size:15px;font-weight:900;margin-top:14px}.button[disabled]{opacity:.45}.hint{font-size:10px;color:#777;line-height:1.45;margin-top:12px}.error{background:#fff0ed;color:#8d2f25;border-radius:11px;padding:11px;font-size:12px;margin:10px 0;display:none}.ok{background:#e9f8ee;color:#23683b;border-radius:11px;padding:11px;font-size:12px;margin:10px 0;display:none}</style>
</head>
<body>
<div class="wrap">
  <div class="brand"><span>CLICK</span>-FOOD</div>
  <div class="sub">Pagamento protegido pela tokenização Efí. O CLICK-FOOD não recebe nem armazena o número completo do cartão ou CVV.</div>
  <div class="total"><small>Total do pedido</small><strong>R$ ${(total || 0).toFixed(2).replace(".", ",")}</strong></div>
  <div id="error" class="error"></div><div id="ok" class="ok"></div>
  <div class="card">
    <div class="label">Número do cartão</div><input id="number" class="input" inputmode="numeric" autocomplete="cc-number" maxlength="19" placeholder="0000 0000 0000 0000" />
    <div class="row"><div><div class="label">Validade (mês)</div><input id="month" class="input" inputmode="numeric" maxlength="2" placeholder="MM" /></div><div><div class="label">Validade (ano)</div><input id="year" class="input" inputmode="numeric" maxlength="4" placeholder="AAAA" /></div><div><div class="label">CVV</div><input id="cvv" class="input" inputmode="numeric" maxlength="4" type="password" placeholder="123" /></div></div>
    <div class="label">Nome impresso no cartão</div><input id="name" class="input" autocomplete="cc-name" placeholder="Nome completo" />
    <div class="label">CPF do titular</div><input id="cpf" class="input" inputmode="numeric" maxlength="14" placeholder="000.000.000-00" />
    <div class="label">E-mail</div><input id="email" class="input" inputmode="email" autocomplete="email" />
    <div class="label">Telefone</div><input id="phone" class="input" inputmode="tel" autocomplete="tel" />
    <div class="label">Parcelas</div><select id="installments" class="select"><option value="1">1x</option></select>
    <button id="pay" class="button">PAGAR COM CARTÃO</button>
    <div class="hint">Os dados sensíveis do cartão são criptografados/tokenizados dentro desta tela pela biblioteca oficial Efí. Apenas o token temporário é enviado para concluir a cobrança.</div>
  </div>
</div>
<script>
const ACCOUNT=${accountId}; const ENV=${environment}; const TOTAL=${totalCents};
const el=id=>document.getElementById(id); const digits=v=>String(v||'').replace(/\D/g,'');
el('name').value=${initialName}; el('email').value=${initialEmail}; el('phone').value=${initialPhone};
function post(type,payload={}){window.ReactNativeWebView?.postMessage(JSON.stringify({type,...payload}));}
function showError(message){el('ok').style.display='none';el('error').textContent=String(message||'Não foi possível validar o cartão.');el('error').style.display='block';}
function showOk(message){el('error').style.display='none';el('ok').textContent=message;el('ok').style.display='block';}
function formatCard(){const d=digits(el('number').value).slice(0,19);el('number').value=d.replace(/(.{4})/g,'$1 ').trim();}
function formatCpf(){const d=digits(el('cpf').value).slice(0,11);let v=d;if(d.length>3)v=d.slice(0,3)+'.'+d.slice(3);if(d.length>6)v=v.slice(0,7)+'.'+v.slice(7);if(d.length>9)v=v.slice(0,11)+'-'+v.slice(11);el('cpf').value=v;}
el('number').addEventListener('input',formatCard);el('cpf').addEventListener('input',formatCpf);
async function identifyBrand(){const number=digits(el('number').value);if(number.length<13)return null;try{const brand=await EfiPay.CreditCard.setCardNumber(number).verifyCardBrand();if(!['visa','mastercard','amex','elo'].includes(brand)){showError('Bandeira não suportada. Use Visa, Mastercard, Amex ou Elo.');return null;}return brand;}catch(e){showError(e?.error_description||'Não foi possível identificar a bandeira.');return null;}}
async function loadInstallments(){const brand=await identifyBrand();if(!brand)return;try{const data=await EfiPay.CreditCard.setAccount(ACCOUNT).setEnvironment(ENV).setBrand(brand).setTotal(TOTAL).getInstallments();const list=Array.isArray(data?.installments)?data.installments:[];const select=el('installments');select.innerHTML='';(list.length?list:[{installment:1,currency:(TOTAL/100).toFixed(2).replace('.',',')}]).forEach(item=>{const option=document.createElement('option');option.value=String(item.installment);option.textContent=String(item.installment)+'x de R$ '+String(item.currency||((Number(item.value||TOTAL)/100).toFixed(2).replace('.',',')));select.appendChild(option);});}catch(e){showError(e?.error_description||'Não foi possível consultar as parcelas.');}}
el('number').addEventListener('blur',loadInstallments);
el('pay').addEventListener('click',async()=>{const button=el('pay');button.disabled=true;el('error').style.display='none';const number=digits(el('number').value),cvv=digits(el('cvv').value),month=digits(el('month').value),year=digits(el('year').value),name=el('name').value.trim(),cpf=digits(el('cpf').value),email=el('email').value.trim(),phone=digits(el('phone').value),installments=Number(el('installments').value||1);if(number.length<13||cvv.length<3||month.length<1||year.length!==4||name.length<3||cpf.length!==11||!email.includes('@')||phone.length<10){showError('Confira número, validade, CVV, nome, CPF, e-mail e telefone.');button.disabled=false;return;}const brand=await identifyBrand();if(!brand){button.disabled=false;return;}try{showOk('Protegendo os dados do cartão…');const token=await EfiPay.CreditCard.setAccount(ACCOUNT).setEnvironment(ENV).setCreditCardData({brand,number,cvv,expirationMonth:month.padStart(2,'0'),expirationYear:year,holderName:name,holderDocument:cpf,reuse:false}).getPaymentToken();if(!token?.payment_token||!token?.card_mask)throw new Error('TOKEN_MISSING');post('token',{paymentToken:token.payment_token,cardMask:token.card_mask,brand,installments,customer:{name,cpf,email,phone}});number && (el('number').value='');el('cvv').value='';}catch(e){showError(e?.error_description||'A Efí não conseguiu tokenizar este cartão. Confira os dados e tente novamente.');button.disabled=false;post('token_error',{code:String(e?.code||e?.error||'TOKENIZATION_FAILED')});}});
post('ready');
</script>
</body></html>`;
}

export default function EfiCardPayment({ visible, config, order, defaults, onCancel, onComplete }: Props) {
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const html = useMemo(() => buildHtml(config, order.total, defaults), [config, order.total, defaults]);

  async function handleMessage(event: WebViewMessageEvent) {
    let data: any;
    try { data = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (data?.type !== "token") return;
    setProcessing(true); setMessage("Enviando o token seguro para a Efí…");
    const charge = await supabase.functions.invoke("efi-card-charge", { body: {
      orderId: order.orderId,
      paymentToken: String(data.paymentToken ?? ""),
      cardMask: String(data.cardMask ?? ""),
      brand: String(data.brand ?? ""),
      installments: Number(data.installments ?? 1),
      customer: data.customer ?? {},
    }});
    const statusCheck = await supabase.functions.invoke("efi-card-status", { body: { orderId: order.orderId } });
    const status = String(statusCheck.data?.status ?? charge.data?.providerStatus ?? "").toUpperCase();
    const paid = Boolean(statusCheck.data?.paid || charge.data?.paid || status === "PAID");
    const approved = Boolean(statusCheck.data?.approved || charge.data?.approved || status === "APPROVED");
    if (paid || approved) {
      setMessage(paid ? "Pagamento confirmado." : "Cartão aprovado. Aguardando a confirmação final da Efí.");
      setProcessing(false);
      await onComplete({ paid, approved, status: status || (paid ? "PAID" : "APPROVED") });
      return;
    }
    const refusal = statusCheck.data?.charge?.refusal_reason || charge.data?.refusal?.reason;
    setMessage(refusal ? `Cartão não aprovado: ${refusal}` : "A cobrança não foi aprovada. Confira os dados ou tente outro cartão.");
    setProcessing(false);
  }

  return <Modal visible={visible} animationType="slide" onRequestClose={() => { if (!processing) void onCancel(); }}>
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View><Text style={styles.brand}><Text style={styles.yellow}>CLICK</Text>-FOOD</Text><Text style={styles.subtitle}>PAGAMENTO SEGURO • EFÍ BANK</Text></View>
        <Pressable disabled={processing} onPress={() => void onCancel()} style={[styles.close, processing && styles.disabled]}><Text style={styles.closeText}>FECHAR</Text></Pressable>
      </View>
      {!!message && <View style={styles.notice}>{processing && <ActivityIndicator />}<Text style={styles.noticeText}>{message}</Text></View>}
      <WebView
        style={styles.web}
        source={{ html }}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled={false}
        cacheEnabled={false}
        incognito
        mixedContentMode="never"
        setSupportMultipleWindows={false}
        onMessage={handleMessage}
      />
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7f7f7" },
  header: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#e6e6e6", flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#fff" },
  brand: { fontSize: 20, fontWeight: "900" }, yellow: { color: "#e1b400" }, subtitle: { fontSize: 9, color: "#777", fontWeight: "800", marginTop: 3, letterSpacing: .7 },
  close: { backgroundColor: "#111", paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10 }, closeText: { color: "#fff", fontSize: 10, fontWeight: "900" }, disabled: { opacity: .45 },
  notice: { margin: 12, marginBottom: 0, backgroundColor: "#fff5d2", borderRadius: 11, padding: 10, flexDirection: "row", alignItems: "center", gap: 8 }, noticeText: { color: "#695400", flex: 1, fontSize: 11, fontWeight: "700" },
  web: { flex: 1, backgroundColor: "#f7f7f7" },
});
