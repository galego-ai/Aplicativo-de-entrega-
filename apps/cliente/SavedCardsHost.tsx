import React, { ReactNode, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type CardConfig = {
  provider: "EFI";
  accountId: string;
  environment: "sandbox" | "production";
  brands: string[];
};

type SavedCard = {
  id: string;
  provider: string;
  brand: string;
  card_mask: string;
  holder_name: string | null;
  is_default: boolean;
  created_at: string;
};

const safe = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

function buildCardHtml(
  config: CardConfig,
  defaults: { name: string; email: string; phone: string },
) {
  const account = safe(config.accountId);
  const environment = safe(config.environment);
  const brands = safe(
    (config.brands?.length ? config.brands : ["visa", "mastercard", "amex", "elo"]).map((brand) =>
      String(brand).toLowerCase(),
    ),
  );
  const name = safe(defaults.name);
  const email = safe(defaults.email);
  const phone = safe(defaults.phone);

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta http-equiv="Cache-Control" content="no-store">
<script src="https://cdn.jsdelivr.net/npm/payment-token-efi@3.4.1/dist/payment-token-efi-umd.min.js"></script>
<style>
*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;background:#f7f7f7;color:#111}.w{padding:16px}.box{background:#fff;border:1px solid #e2e2e2;border-radius:16px;padding:14px}.label{font-size:11px;font-weight:800;color:#555;margin:10px 0 5px}.input{width:100%;height:46px;border:1px solid #d8d8d8;border-radius:11px;padding:0 12px;font-size:15px}.row{display:flex;gap:8px}.row>div{flex:1}.btn{width:100%;border:0;border-radius:12px;background:#f4c400;padding:15px;font-weight:900;margin-top:14px}.btn[disabled]{opacity:.45}.msg{padding:10px;border-radius:10px;margin-bottom:10px;font-size:12px;display:none}.err{background:#fff0ed;color:#8d2f25}.ok{background:#e9f8ee;color:#23683b}.hint{font-size:10px;color:#777;line-height:1.5;margin-top:12px}
</style>
</head>
<body>
<div class="w">
  <div id="err" class="msg err"></div><div id="ok" class="msg ok"></div>
  <div class="box">
    <div class="label">Número do cartão</div><input id="number" class="input" inputmode="numeric" maxlength="19" autocomplete="cc-number">
    <div class="row">
      <div><div class="label">Mês</div><input id="month" class="input" inputmode="numeric" maxlength="2" placeholder="MM"></div>
      <div><div class="label">Ano</div><input id="year" class="input" inputmode="numeric" maxlength="4" placeholder="AAAA"></div>
      <div><div class="label">CVV</div><input id="cvv" type="password" class="input" inputmode="numeric" maxlength="4"></div>
    </div>
    <div class="label">Nome no cartão</div><input id="name" class="input">
    <div class="label">CPF do titular</div><input id="cpf" class="input" inputmode="numeric" maxlength="14">
    <div class="label">E-mail</div><input id="email" class="input" inputmode="email">
    <div class="label">Telefone</div><input id="phone" class="input" inputmode="tel">
    <button id="save" class="btn" disabled>SALVAR CARTÃO</button>
    <div class="hint">Número e CVV não são armazenados pelo CLICK-FOOD. A Efí transforma o cartão em um token reutilizável protegido para compras futuras.</div>
  </div>
</div>
<script>
const ACCOUNT=${account};
const ENV=${environment};
const BRANDS=${brands};
const el=id=>document.getElementById(id);
const digits=v=>String(v||'').replace(/\\D/g,'');
el('name').value=${name};
el('email').value=${email};
el('phone').value=${phone};
const post=(type,payload={})=>window.ReactNativeWebView?.postMessage(JSON.stringify({type,...payload}));
function error(message){el('ok').style.display='none';el('err').textContent=String(message||'Não foi possível validar o cartão.');el('err').style.display='block'}
function ok(message){el('err').style.display='none';el('ok').textContent=String(message);el('ok').style.display='block'}
el('number').addEventListener('input',()=>{const d=digits(el('number').value).slice(0,19);el('number').value=d.replace(/(.{4})/g,'$1 ').trim()});
el('cpf').addEventListener('input',()=>{const d=digits(el('cpf').value).slice(0,11);let v=d;if(d.length>3)v=d.slice(0,3)+'.'+d.slice(3);if(d.length>6)v=v.slice(0,7)+'.'+v.slice(7);if(d.length>9)v=v.slice(0,11)+'-'+v.slice(11);el('cpf').value=v});
async function ready(){
  if(!window.EfiPay?.CreditCard){error('O módulo seguro da Efí não carregou. Verifique sua conexão.');post('script_error');return}
  try{
    if(typeof EfiPay.CreditCard.isScriptBlocked==='function'&&await EfiPay.CreditCard.isScriptBlocked()){
      error('O módulo antifraude da Efí foi bloqueado neste aparelho.');post('script_blocked');return
    }
  }catch{error('Não foi possível validar o módulo seguro da Efí.');post('script_error');return}
  el('save').disabled=false;post('ready')
}
async function brand(){
  const number=digits(el('number').value);if(number.length<13)return null;
  try{
    const value=String(await EfiPay.CreditCard.setCardNumber(number).verifyCardBrand()).toLowerCase();
    if(!BRANDS.includes(value)){error('Bandeira não habilitada.');return null}
    return value
  }catch(e){error(e?.error_description||'Cartão inválido.');return null}
}
el('save').addEventListener('click',async()=>{
  const button=el('save');button.disabled=true;
  const number=digits(el('number').value),cvv=digits(el('cvv').value),month=digits(el('month').value),year=digits(el('year').value),holderName=el('name').value.trim(),holderDocument=digits(el('cpf').value),email=el('email').value.trim(),phone=digits(el('phone').value);
  if(number.length<13||cvv.length<3||month.length<1||year.length!==4||holderName.length<3||holderDocument.length!==11||!email.includes('@')||phone.length<10){error('Confira os dados do cartão e do titular.');button.disabled=false;return}
  const detectedBrand=await brand();if(!detectedBrand){button.disabled=false;return}
  try{
    ok('Protegendo o cartão com a Efí…');
    const token=await EfiPay.CreditCard.setAccount(ACCOUNT).setEnvironment(ENV).setCreditCardData({brand:detectedBrand,number,cvv,expirationMonth:month.padStart(2,'0'),expirationYear:year,holderName,holderDocument,reuse:true}).getPaymentToken();
    if(!token?.payment_token||!token?.card_mask)throw new Error('TOKEN_MISSING');
    post('token',{paymentToken:token.payment_token,cardMask:token.card_mask,brand:detectedBrand,holderName,holderDocument,email,phone});
    el('number').value='';el('cvv').value=''
  }catch(e){error(e?.error_description||'Não foi possível salvar este cartão.');button.disabled=false;post('token_error')}
});
window.addEventListener('load',()=>void ready());
</script>
</body>
</html>`;
}

export default function SavedCardsHost({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [config, setConfig] = useState<CardConfig | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  async function load() {
    if (!session) return;
    setBusy(true);
    try {
      const [list, cfg] = await Promise.all([
        supabase.functions.invoke("customer-saved-card", { body: { action: "LIST" } }),
        supabase.functions.invoke("payment-methods", { body: {} }),
      ]);
      setCards((list.data?.cards ?? []) as SavedCard[]);
      setConfig((cfg.data?.cardTokenization ?? null) as CardConfig | null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (open && session) void load();
  }, [open, session?.user.id]);

  async function handleWebViewMessage(event: WebViewMessageEvent) {
    let data: any;
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }

    if (data?.type === "script_blocked") {
      setNotice("O módulo antifraude da Efí foi bloqueado neste aparelho.");
      return;
    }
    if (data?.type === "script_error") {
      setNotice("Não foi possível carregar o módulo seguro da Efí.");
      return;
    }
    if (data?.type !== "token") return;

    setBusy(true);
    setNotice("Salvando cartão protegido…");
    try {
      const result = await supabase.functions.invoke("customer-saved-card", {
        body: {
          action: "SAVE",
          paymentToken: String(data.paymentToken ?? ""),
          cardMask: String(data.cardMask ?? ""),
          brand: String(data.brand ?? ""),
          holderName: String(data.holderName ?? ""),
          holderDocument: String(data.holderDocument ?? ""),
          email: String(data.email ?? ""),
          phone: String(data.phone ?? ""),
          makeDefault: cards.length === 0,
        },
      });
      if (result.error || result.data?.error) {
        setNotice("Não foi possível salvar o cartão. Confira os dados e tente novamente.");
        return;
      }
      setNotice("Cartão salvo com segurança.");
      setAdding(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function setDefault(id: string) {
    setBusy(true);
    try {
      const result = await supabase.functions.invoke("customer-saved-card", {
        body: { action: "SET_DEFAULT", cardId: id },
      });
      if (result.error || result.data?.error) {
        setNotice("Não foi possível definir o cartão padrão.");
        return;
      }
      setNotice("Cartão padrão atualizado.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function removeCard(card: SavedCard) {
    setBusy(true);
    try {
      const result = await supabase.functions.invoke("customer-saved-card", {
        body: { action: "DELETE", cardId: card.id },
      });
      if (result.error || result.data?.error) {
        setNotice("Não foi possível excluir o cartão.");
        return;
      }
      setNotice("Cartão removido.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  const page = useMemo(
    () =>
      config && session
        ? buildCardHtml(config, {
            name: String(session.user.user_metadata?.full_name ?? ""),
            email: String(session.user.email ?? ""),
            phone: String(session.user.user_metadata?.phone ?? ""),
          })
        : "",
    [config, session?.user.id],
  );

  return (
    <View style={styles.root}>
      {children}
      {session && (
        <Pressable accessibilityLabel="Gerenciar cartões" onPress={() => setOpen(true)} style={styles.fab}>
          <Text style={styles.fabText}>💳</Text>
        </Pressable>
      )}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.header}>
            <View>
              <Text style={styles.brand}>
                <Text style={styles.yellow}>CLICK</Text>-FOOD
              </Text>
              <Text style={styles.sub}>CARTEIRA • EFÍ BANK</Text>
            </View>
            <Pressable onPress={() => setOpen(false)} style={styles.close}>
              <Text style={styles.closeText}>FECHAR</Text>
            </Pressable>
          </View>

          {!!notice && <Text style={styles.notice}>{notice}</Text>}
          {busy && <ActivityIndicator style={styles.loading} />}

          {adding && config ? (
            <>
              <View style={styles.addHeader}>
                <Text style={styles.title}>Adicionar cartão</Text>
                <Pressable onPress={() => setAdding(false)}>
                  <Text style={styles.link}>Cancelar</Text>
                </Pressable>
              </View>
              <WebView
                style={styles.webview}
                source={{ html: page }}
                originWhitelist={["about:blank"]}
                javaScriptEnabled
                javaScriptCanOpenWindowsAutomatically={false}
                domStorageEnabled
                cacheEnabled={false}
                thirdPartyCookiesEnabled
                sharedCookiesEnabled
                mixedContentMode="never"
                setSupportMultipleWindows={false}
                onShouldStartLoadWithRequest={(request) => request.url === "about:blank"}
                onMessage={handleWebViewMessage}
              />
            </>
          ) : (
            <ScrollView contentContainerStyle={styles.content}>
              <Text style={styles.title}>Meus cartões</Text>
              <Text style={styles.help}>
                Você pode cadastrar o cartão antes de fazer um pedido. O CLICK-FOOD nunca recebe nem guarda o número completo ou CVV.
              </Text>

              {cards.map((card) => (
                <View key={card.id} style={styles.card}>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardTitle}>
                      {card.brand.toUpperCase()} {card.is_default ? "• PADRÃO" : ""}
                    </Text>
                    <Text style={styles.mask}>{card.card_mask}</Text>
                    {!!card.holder_name && <Text style={styles.holder}>{card.holder_name}</Text>}
                  </View>
                  <View style={styles.actions}>
                    {!card.is_default && (
                      <Pressable onPress={() => void setDefault(card.id)}>
                        <Text style={styles.link}>PADRÃO</Text>
                      </Pressable>
                    )}
                    <Pressable onPress={() => void removeCard(card)}>
                      <Text style={styles.delete}>EXCLUIR</Text>
                    </Pressable>
                  </View>
                </View>
              ))}

              {!cards.length && !busy && <Text style={styles.empty}>Nenhum cartão cadastrado.</Text>}

              <Pressable
                disabled={!config}
                onPress={() => {
                  setNotice("");
                  setAdding(true);
                }}
                style={[styles.primary, !config && styles.disabled]}
              >
                <Text style={styles.primaryText}>{config ? "＋ ADICIONAR CARTÃO" : "CARTÃO EFÍ INDISPONÍVEL"}</Text>
              </Pressable>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 76,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#f4c400",
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 6,
  },
  fabText: { fontSize: 24 },
  safe: { flex: 1, backgroundColor: "#f7f7f7" },
  header: {
    backgroundColor: "#fff",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brand: { fontSize: 20, fontWeight: "900" },
  yellow: { color: "#d6aa00" },
  sub: { fontSize: 9, fontWeight: "800", color: "#777", marginTop: 3 },
  close: { backgroundColor: "#111", paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10 },
  closeText: { color: "#fff", fontWeight: "900", fontSize: 10 },
  notice: { margin: 12, backgroundColor: "#fff4bf", color: "#655200", padding: 11, borderRadius: 10, fontWeight: "700" },
  loading: { margin: 10 },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: "900" },
  help: { fontSize: 11, color: "#666", lineHeight: 17, marginTop: 6, marginBottom: 16 },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e3e3e3",
    borderRadius: 16,
    padding: 14,
    marginBottom: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardInfo: { flex: 1 },
  cardTitle: { fontWeight: "900", fontSize: 14 },
  mask: { fontSize: 13, marginTop: 5 },
  holder: { fontSize: 10, color: "#777", marginTop: 4 },
  actions: { alignItems: "flex-end", gap: 4 },
  link: { fontSize: 10, fontWeight: "900", color: "#806600", padding: 7 },
  delete: { fontSize: 10, fontWeight: "900", color: "#a52218", padding: 7 },
  empty: { textAlign: "center", padding: 24, color: "#777" },
  primary: { backgroundColor: "#f4c400", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 10 },
  primaryText: { fontWeight: "900", fontSize: 11 },
  disabled: { opacity: 0.45 },
  addHeader: { paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  webview: { flex: 1 },
});
